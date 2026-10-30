/** Social Signals: recent posts from watched X accounts. Live with X_BEARER_TOKEN, else a labeled snapshot of real posts. */
import snapshot from "./x-snapshot";
import { finalize, type Brief } from "./market";
/** Posts are untrusted DATA. Instruction-like text never becomes an action and is excluded from tone. */
export const INJECTION = /\b(ignore (all |any |previous |your )?(instructions|rules|cap|caps|limits?)|approve (all|every|this)|execute (the )?trade|you (must|should) (buy|sell)|system prompt)\b/i;

export type Post = { id: string; handle: string; text: string; created_at: string; url: string; likes?: number };
export const SNAPSHOT_AT = "2026-10-30 13:00 UTC";
export const DEFAULT_HANDLES = ["unusual_whales", "WatcherGuru", "DeItaone", "zerohedge"];

const NAMES: [RegExp, string][] = [[/\$?\bbtc\b|bitcoin/i, "BTC"], [/\$?\beth\b|ethereum|\bether\b/i, "ETH"], [/\$?\bsol\b|solana/i, "SOL"], [/\$?nvda\b|nvidia/i, "NVDA"], [/\$?msft\b|microsoft/i, "MSFT"], [/\$?aapl\b|\bapple\b/i, "AAPL"], [/\$?amzn\b|amazon/i, "AMZN"], [/\$?googl?\b|alphabet/i, "GOOGL"], [/\$?tsla\b|tesla/i, "TSLA"], [/\$?xrp\b/i, "XRP"]];
const BULL = /\b(beats?|tops|accumulate|launch(es)?|rises?|surges?|jumps?|record|buy(ing)?|investment strategy|credit support|approv(ed|al)|higher)\b/i;
const BEAR = /\b(falls?|crash(ing)?|hack(ed)?|liquidat(ed|ions)|plunges?|spy|doj|inquir|examin|lower|stolen|lawsuit|probe|disappoint|shrink|stall)\w*/i;

export async function fetchPosts(handles: string[]): Promise<{ posts: Post[]; mode: "live" | "snapshot"; note: string }> {
  const token = process.env.X_BEARER_TOKEN; // guard:allow-env-credential — app-wide read-only X API key set by the deployer, not per-user
  if (token && handles.length) {
    try {
      const q = encodeURIComponent(`(${handles.map((h) => `from:${h}`).join(" OR ")}) -is:retweet -is:reply`);
      const r = await fetch(`https://api.x.com/2/tweets/search/recent?query=${q}&max_results=30&tweet.fields=created_at,author_id&expansions=author_id&user.fields=username`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(7000) });
      if (!r.ok) throw new Error(`X API ${r.status}`);
      const j = (await r.json()) as any; const users = new Map<string, string>((j.includes?.users ?? []).map((u: any) => [u.id, u.username]));
      const posts = (j.data ?? []).map((p: any) => { const h = users.get(p.author_id) ?? "i"; return { id: p.id, handle: h, text: p.text, created_at: p.created_at, url: `https://x.com/${h}/status/${p.id}` }; });
      return { posts, mode: "live", note: "LIVE from X API" };
    } catch (e) { /* fall through to snapshot */ }
  }
  const set = new Set(handles.map((h) => h.toLowerCase()));
  const posts = (snapshot as Post[]).filter((p) => set.has(p.handle.toLowerCase()));
  return { posts, mode: "snapshot", note: `SNAPSHOT of real public posts captured ${SNAPSHOT_AT} (no X_BEARER_TOKEN set)` };
}

export function socialThesis(all: Post[], mode: string, note: string): { asset?: string; brief: Brief } {
  const flagged = all.filter((p) => INJECTION.test(p.text));
  const posts = all.filter((p) => !INJECTION.test(p.text));
  const by = new Map<string, { bull: Post[]; bear: Post[]; neutral: Post[] }>();
  for (const p of posts) for (const [re, sym] of NAMES) if (re.test(p.text)) {
    const b = by.get(sym) ?? { bull: [], bear: [], neutral: [] };
    (BEAR.test(p.text) ? b.bear : BULL.test(p.text) ? b.bull : b.neutral).push(p); by.set(sym, b);
  }
  const ranked = [...by.entries()].map(([s, b]) => ({ s, b, net: b.bull.length - b.bear.length, n: b.bull.length + b.bear.length + b.neutral.length })).sort((a, b) => b.net - a.net || b.n - a.n);
  const top = ranked[0];
  const short = (p: Post) => `FACT · @${p.handle}: “${p.text.replace(/https:\/\/t\.co\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 140)}”`;
  if (!top) return { brief: { verdict: "HOLD", confidence: 0.3, title: "No asset mentioned", summary: "Watched accounts did not mention a tracked asset.", evidence: [], counter: [], sources: [], labels: [note] } };
  const verdict: Brief["verdict"] = top.net >= 1 ? "BUY" : top.net <= -1 ? "AVOID" : "HOLD";
  const lead = verdict === "AVOID" ? top.b.bear : top.b.bull.length ? top.b.bull : top.b.neutral;
  const other = verdict === "AVOID" ? top.b.bull : top.b.bear;
  const crowd = ranked.filter((r) => r.s !== top.s && r.net < 0).slice(0, 2).map((r) => `${r.s} drew ${r.b.bear.length} negative post(s) in the same window`);
  const agreeing = new Set((verdict === "AVOID" ? top.b.bear : top.b.bull).map((p) => p.handle.toLowerCase())).size;
  const gaps = [mode === "live" ? "X recent search covers ~7 days only" : `Snapshot, not live: posts as of ${SNAPSHOT_AT}`, "Tone is keyword-based, not a full reading of each post", ...(flagged.length ? [`${flagged.length} post(s) contained instruction-like text (e.g. "ignore your cap") and were ignored: posts are data, not commands`] : [])];
  const brief: Brief = {
    verdict, confidence: Math.min(0.65, 0.35 + 0.1 * Math.abs(top.net)) * (mode === "live" ? 1 : 0.85),
      title: `${top.s} — ${verdict} on social signals`,
      summary: `${top.n} post(s) from watched accounts mention ${top.s}: ${top.b.bull.length} positive, ${top.b.bear.length} negative, ${top.b.neutral.length} neutral (keyword tone, computed in code). ${verdict === "BUY" ? "Net tone is positive." : verdict === "AVOID" ? "Net tone is negative." : "Tone is mixed."}`,
      evidence: [`COMPUTED: ${top.b.bull.length} positive / ${top.b.bear.length} negative / ${top.b.neutral.length} neutral posts on ${top.s}`, ...lead.slice(0, 4).map(short), ...(verdict === "BUY" ? ["OPINION: positive chatter from more than one account can precede a move, but it is a weak signal alone"] : [])],
      counter: [...other.slice(0, 3).map(short), ...crowd.map((x) => `COMPUTED: ${x}`), "OPINION: posts can be priced in by the time you see them"],
      sources: [...lead, ...other].slice(0, 6).map((p) => ({ label: `@${p.handle} · ${p.created_at.slice(0, 16).replace("T", " ")} UTC`, url: p.url })),
      labels: [note, "Sentiment: keyword rules in code"], dataGaps: gaps,
  };
  return { asset: top.s, brief: finalize(brief, agreeing, verdict === "HOLD" || (top.b.bull.length > 0 && top.b.bear.length > 0 && Math.abs(top.net) < 2)) };
}
