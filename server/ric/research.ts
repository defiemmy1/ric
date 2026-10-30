import { CRYPTO, post, publishReport, proposeInto, simPrice, tradeMax, writeDesk, type Agent, type Desk, type Report } from "./desk";
import { analyze, coinMarkets, cryptoSeries, stockSeries, type Brief } from "./market";
import { fetchPosts, socialThesis, DEFAULT_HANDLES } from "./social";
import { stocksThesis } from "./stocks";

export const toReport = (b: Brief): Report => ({ summary: b.summary, confidence: b.confidence, live: b.labels.some((l) => /LIVE/.test(l)), verdict: b.verdict, title: b.title, evidence: b.evidence, counter: b.counter, sources: b.sources, labels: b.labels, dataGaps: b.dataGaps ?? [], agreeing: b.agreeing ?? 0, link: b.sources[0]?.url });

/** Turn a thesis into chat: BUY → alert + Approve card (through the cap check); HOLD/AVOID → alert with brief. */
export function deliver(d: Desk, a: Agent, asset: string | undefined, b: Brief, liveLabel: string) {
  const report = toReport(b); report.chart = b.chart; publishReport(report, asset, a.name);
  const head = `${a.name}: ${b.verdict}${asset ? ` ${asset}` : ""} · confidence ${Math.round(b.confidence * 100)}%. ${b.summary}`;
  if (b.verdict !== "BUY" || !asset) { post(d, { role: "agent", agentId: a.id, kind: "alert", text: `Alert: ${head}`, report }); return `${b.verdict}${asset ? " " + asset : ""}`; }
  const remaining = a.budget - d.proposals.filter((p) => p.agentId === a.id && p.status !== "rejected").reduce((s, p) => s + p.cost, 0);
  const dollars = Math.max(10, Math.floor(Math.min(remaining, tradeMax(a)) * 0.3));
  const price = simPrice(asset);
  const qty = CRYPTO.has(asset) ? Math.round((dollars / price) * 1e6) / 1e6 : Math.max(1, Math.floor(dollars / price));
  post(d, { role: "agent", agentId: a.id, kind: "alert", text: `Alert: ${head}`, report });
  const r = proposeInto(d, { agentId: a.id, asset, qty, reason: b.evidence.slice(0, 2).join(" · ") || b.summary, source: liveLabel, live: /LIVE/.test(liveLabel), link: b.sources[0]?.url, report });
  return r.ok ? `BUY ${qty} ${asset} (card)` : r.message;
}

export async function thesisFor(a: Agent, d: Desk): Promise<{ asset?: string; brief: Brief; label: string }> {
  if (a.preset === "x-accounts") {
    const { posts, mode, note } = await fetchPosts(d.watch?.length ? d.watch : DEFAULT_HANDLES);
    const t = socialThesis(posts, mode, note);
    if (t.asset) {
      const s = CRYPTO.has(t.asset) ? await cryptoSeries(t.asset) : await stockSeries(t.asset);
      t.brief.labels.push(`Price: ${s.source}`);
      t.brief.evidence.push(`Price check: ${t.asset} $${s.price.toLocaleString()} (${s.source})`);
    }
    return { ...t, label: `${mode === "live" ? "LIVE X" : "X SNAPSHOT"} · price ${t.asset && simPrice(t.asset) ? "live/sim" : ""}`.replace(" · price live/sim", "") };
  }
  if (a.preset === "crypto") {
    const all = [];
    for (const sym of ["BTC", "ETH", "SOL", "XRP"]) all.push(await analyzeAsset(sym));
    const rank = { BUY: 3, HOLD: 2, "NO CALL": 1, AVOID: 0 } as const;
    all.sort((x, y) => rank[y.brief.verdict] - rank[x.brief.verdict] || y.brief.confidence - x.brief.confidence);
    const best = all[0]!;
    best.brief.counter.push(`Compared with: ${all.slice(1).map((x) => `${x.asset} ${x.brief.verdict}`).join(", ")}`);
    return best;
  }
  if (a.preset === "ipo") { const t = await stocksThesis(); return { ...t, label: t.brief.labels.find((l) => /Yahoo/.test(l)) ? "LIVE IPO calendar · LIVE price (Yahoo)" : "IPO calendar · SIMULATED price" }; }
  return analyzeAsset(getUniverse(a)[0]!, {});
}

const getUniverse = (a: Agent) => (a.preset === "congress" ? ["MSFT", "AAPL", "LMT"] : ["SPY", "QQQ", "AMZN"]);

export async function analyzeAsset(sym: string, ch: { ch7d?: number; ch30d?: number } = {}) {
  const S = sym.toUpperCase();
  if (CRYPTO.has(S)) {
    if (ch.ch7d === undefined) { try { const r = (await coinMarkets()).find((x: any) => x.symbol === S); if (r) ch = { ch7d: r.ch7d, ch30d: r.ch30d }; } catch { /* ignore */ } }
    const s = await cryptoSeries(S); const b = analyze(s, ch);
    if (s.volume) b.evidence.push(`FACT · CoinGecko: 24h volume $${Math.round(s.volume / 1e6).toLocaleString()}M (CoinGecko)`);
    return { asset: S, brief: b, label: s.live ? "LIVE PRICE (CoinGecko)" : "SIMULATED price (CoinGecko unavailable)" };
  }
  const s = await stockSeries(S); const b = analyze(s);
  return { asset: S, brief: b, label: s.live ? "LIVE PRICE (Yahoo Finance)" : "SIMULATED price" };
}

export async function researchRound() {
  const d0 = await (await import("./desk")).readDesk();
  const active = d0.agents;
  const theses = await Promise.all(active.map(async (a) => ({ a, t: await thesisFor(a, d0).catch((e) => ({ asset: undefined, brief: { verdict: "HOLD", confidence: 0, title: "Error", summary: `Research failed: ${(e as Error).message}`, evidence: [], counter: [], sources: [], labels: ["error"] } as Brief, label: "error" })) })));
  const results: { agent: string; outcome: string }[] = [];
  await writeDesk((d) => {
    for (const { a, t } of theses) {
      const agent = d.agents.find((x) => x.id === a.id); if (!agent) continue;
      results.push({ agent: agent.name, outcome: deliver(d, agent, t.asset, t.brief, t.label) });
    }
  });
  return { results, message: "Research round done." };
}
