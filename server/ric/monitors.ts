/** Named monitors: cron cadence (Agent-Native's cron parser), server-side sweep, new items only, silent on no match. Monitors can never trade. */
import { describeCron, isValidCron, nextOccurrence } from "@agent-native/core/jobs";
import { listSettingsByPrefix } from "@agent-native/core/settings";
import { CRYPTO, DESK_PREFIX, post, publishReport, readDesk, withOwner, writeDesk, type Desk, type Monitor } from "./desk";
import { analyzeAsset, toReport } from "./research";
import { fetchPosts, DEFAULT_HANDLES } from "./social";
import { ipoCalendar } from "./stocks";
import { recentIpoFilings } from "./edgar";

export const TZ = "Africa/Lagos";
const mid = () => "mn_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export function cronFromText(t: string): string {
  const low = t.toLowerCase();
  let m = low.match(/every\s+(\d+)\s*(?:min|minute)/); if (m) return `*/${Math.max(1, Math.min(59, +m[1]!))} * * * *`;
  m = low.match(/every\s+(\d+)\s*(?:h|hour)/); if (m) return `0 */${Math.max(1, Math.min(23, +m[1]!))} * * *`;
  if (/every\s+hour|hourly/.test(low)) return "0 * * * *";
  if (/every\s+minute/.test(low)) return "* * * * *";
  const at = low.match(/\bat\s+([\d:apm\s,and&]+)/);
  if (at) {
    const hours = [...at[1]!.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/g)].map((x) => { let h = +x[1]!; if (x[3] === "pm" && h < 12) h += 12; else if (!x[3] && h >= 1 && h <= 7) h += 12; return h % 24; });
    if (hours.length) return `0 ${[...new Set(hours)].sort((a, b) => a - b).join(",")} * * *`;
  }
  return "0 9 * * *";
}

export function parseMonitor(t: string): Omit<Monitor, "id" | "nextRun" | "seen" | "hits" | "paused"> | null {
  const low = t.toLowerCase();
  if (!/\b(monitor|check|alert me|watch|track|scan)\b/.test(low) || !/(every|hourly|daily|at \d)/.test(low)) return null;
  const cron = cronFromText(t);
  const sym = t.match(/\b(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|AVAX|LINK|TON)\b/i)?.[1]?.toUpperCase() ?? t.match(/\$([A-Za-z]{1,5})\b/)?.[1]?.toUpperCase();
  const kind: Monitor["kind"] = /ipo|s-1|listing/.test(low) ? "ipo" : sym ? "asset" : /social|posts|\bx\b|tweets/.test(low) ? "social" : /crypto/.test(low) ? "crypto" : "asset";
  const name = kind === "ipo" ? "IPO check" : kind === "social" ? "Social posts" : kind === "crypto" ? "Crypto majors" : `${sym ?? "NVDA"} monitor`;
  return { name, kind, symbol: kind === "asset" ? sym ?? "NVDA" : undefined, cron, human: describeCron(cron, TZ) };
}

export function addMonitor(d: Desk, m: NonNullable<ReturnType<typeof parseMonitor>>) {
  if (!isValidCron(m.cron)) throw new Error("bad cadence");
  const mon: Monitor = { ...m, id: mid(), paused: false, seen: [], hits: 0, nextRun: nextOccurrence(m.cron, new Date(), TZ).toISOString() };
  (d.monitors ??= []).push(mon);
  return mon;
}

export type Hit = { key: string; text: string; links: { label: string; url: string }[]; report?: ReturnType<typeof toReport> };

/** Gather candidate items. No trading capability is passed in here at all. */
async function candidates(m: Monitor, d: Desk): Promise<Hit[]> {
  if (m.kind === "ipo") {
    const [cal, fil] = await Promise.all([ipoCalendar(), recentIpoFilings().catch(() => [])]);
    const a = cal.rows.filter((r) => (r.status === "upcoming" || r.status === "priced") && !/acquisition|spac|capital partners|blank check/i.test(r.company) && !/U$/.test(r.ticker)).map((r) => ({ key: `ipo:${r.ticker}:${r.status}`, text: `${r.status === "upcoming" ? "Upcoming IPO" : "Newly priced IPO"}: ${r.company} (${r.ticker}) ${r.date} at $${r.price || "?"} · ${r.offer}. Matched because it is a ${r.status} deal on the ${cal.live ? "live" : "snapshot"} Nasdaq calendar.`, links: [{ label: "Nasdaq IPO calendar", url: "https://www.nasdaq.com/market-activity/ipos" }] }));
    const b = fil.filter((f) => !f.spac).map((f) => ({ key: `sec:${f.link}`, text: `SEC filing: ${f.company} (${f.ticker}) ${f.form} on ${f.date}. Matched because it is a new S-1/424B prospectus (a filing is not yet an IPO).`, links: [{ label: `SEC ${f.form}`, url: f.link }] }));
    return [...a, ...b];
  }
  if (m.kind === "social") {
    const { posts, note } = await fetchPosts(d.watch?.length ? d.watch : DEFAULT_HANDLES);
    return posts.filter((p) => /\$[A-Z]{2,5}|bitcoin|nvidia|microsoft|apple|solana|ethereum/i.test(p.text)).map((p) => ({ key: `x:${p.id}`, text: `@${p.handle}: “${p.text.replace(/https:\/\/t\.co\/\S+/g, "").slice(0, 140)}” Matched because it mentions a tracked asset (${note.startsWith("LIVE") ? "live" : "snapshot"}).`, links: [{ label: `@${p.handle} post`, url: p.url }] }));
  }
  const syms = m.kind === "crypto" ? ["BTC", "ETH", "SOL"] : [m.symbol ?? "NVDA"];
  const out: Hit[] = [];
  for (const s of syms) {
    const th = await analyzeAsset(s);
    const move = th.brief.evidence.concat(th.brief.counter).find((x) => /24h move/.test(x));
    const pct = Number(move?.match(/([+-]?\d+(\.\d+)?)%/)?.[1] ?? 0);
    const why = th.brief.verdict === "BUY" ? "the rule verdict turned BUY" : Math.abs(pct) >= 5 ? `it moved ${pct.toFixed(1)}% in 24h (≥5% threshold)` : "";
    if (!why) continue;
    const day = new Date().toISOString().slice(0, 10);
    const rep = toReport(th.brief); rep.chart = th.brief.chart;
    out.push({ key: `${s}:${th.brief.verdict}:${Math.sign(pct)}:${day}`, text: `${s}: ${th.brief.verdict} (${Math.round(th.brief.confidence * 100)}%). Matched because ${why}.`, links: th.brief.sources, report: rep });
  }
  return out;
}

/** Run one monitor: alert on new matches only; silent otherwise. Returns number of alerts. */
export async function runMonitor(id: string): Promise<{ alerts: number; checked: number }> {
  const d0 = await readDesk(); const m0 = d0.monitors?.find((x) => x.id === id);
  if (!m0) return { alerts: 0, checked: 0 };
  const hits = await candidates(m0, d0).catch(() => [] as Hit[]);
  let alerts = 0;
  await writeDesk((d) => { const m = d.monitors?.find((x) => x.id === id); if (m) alerts = applyHits(d, m, hits); });
  return { alerts, checked: hits.length };
}

/** Pure step: dedupe hits against what this monitor has seen, post alerts only for new ones. Never touches proposals. */
export function applyHits(d: Desk, m: Monitor, hits: Hit[]): number {
  let alerts = 0;
  const seen = new Set(m.seen); const globalSeen = new Set(d.seen ?? []);
  const fresh = hits.filter((h) => !seen.has(h.key) && !globalSeen.has(`${m.id}|${h.key}`));
  const first = m.seen.length === 0 && !m.lastRun;
  const show = first ? fresh.slice(0, 3) : fresh.slice(0, 5);
  for (const h of hits) seen.add(h.key);
  m.seen = [...seen].slice(-500); m.lastRun = new Date().toISOString();
  m.nextRun = nextOccurrence(m.cron, new Date(), TZ).toISOString();
  for (const h of show) {
    const report = h.report; if (report) publishReport(report, undefined, `Monitor: ${m.name}`);
    post(d, { role: "agent", kind: "alert", text: `Monitor “${m.name}”${first ? " (first run, latest items)" : ""}: ${h.text}${h.links[0] ? ` Source: ${h.links[0].url}` : ""}`, report });
    alerts++;
  }
  m.hits += alerts;
  d.seen = [...globalSeen, ...show.map((h) => `${m.id}|${h.key}`)].slice(-1000);
  return alerts;
}

/** Server sweep: every desk, every due unpaused monitor. */
let running = false;
export async function sweepMonitors() {
  if (running) return; running = true;
  try {
    const desks = await listSettingsByPrefix(DESK_PREFIX, { limit: 200 });
    for (const { key, value } of desks) {
      const owner = key.slice(DESK_PREFIX.length);
      const due = ((value as unknown as Desk).monitors ?? []).filter((m) => !m.paused && Date.parse(m.nextRun) <= Date.now());
      for (const m of due) await withOwner(owner, () => runMonitor(m.id)).catch(() => null);
    }
  } finally { running = false; }
}
export const isCrypto = (s: string) => CRYPTO.has(s);
