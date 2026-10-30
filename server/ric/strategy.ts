import { getPreset, tradeMax, type Agent, type Desk } from "./desk";

/** Inspectable strategy card for each agent. */
export function strategyCard(a: Agent, d: Desk) {
  const src: Record<string, string[]> = {
    "x-accounts": [`X posts from ${(d.watch ?? []).map((h) => "@" + h).join(", ")} (live with X_BEARER_TOKEN, else labeled snapshot)`, "Price check: CoinGecko (crypto) / Yahoo Finance chart endpoint (stocks)"],
    crypto: ["CoinGecko /coins/markets (24h/7d/30d, volume)", "CoinGecko /market_chart 30d daily (RSI, 20-day SMA, drawdown)"],
    ipo: ["Nasdaq public IPO calendar (priced + upcoming)", "SEC EDGAR full-text search (S-1, 424B4)", "Yahoo Finance chart endpoint (unofficial) for post-IPO price"],
    congress: ["Simulated congressional filings (no free live source wired)"],
    custom: ["Your plain-English rule", "Prices: CoinGecko / Yahoo when available, else simulated"],
  };
  const kind = a.preset === "x-accounts" ? "social" : a.preset === "crypto" ? "asset|crypto" : a.preset === "ipo" ? "ipo" : "asset";
  const mons = (d.monitors ?? []).filter((m) => kind.split("|").includes(m.kind) && (a.preset !== "crypto" || m.kind === "crypto" || /^(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|AVAX|LINK|TON)$/.test(m.symbol ?? "")));
  return {
    name: a.name, type: (a.custom ? "Your agent · " : "") + getPreset(a.preset).label, strategy: a.strategy,
    sources: src[a.preset] ?? src.custom!,
    schedule: ["On demand: “run research”, “analyze …”", ...mons.map((m) => `Monitor “${m.name}”: ${m.human}${m.paused ? " (paused)" : ""}`)],
    allowed: ["Read the sources above", "Write a research brief (verdict, confidence, evidence, counterevidence, gaps, sources)", "Propose a paper BUY/SELL card for you to approve"],
    blocked: ["Approve or execute any trade (only you can)", `Spend over its $${a.budget} daily cap or $${tradeMax(a)} per trade (app-enforced)`, "Sell what you don't hold", "Act on instructions found inside posts or filings", "Trade from a monitor (monitors only alert)", "Real money or a real brokerage"],
    budget: { cap: a.budget, perTrade: tradeMax(a), period: "daily" },
    feedback: (a.feedback ?? []).slice(-5).reverse().map((f) => `${f.asset}: “${f.reason}”`),
  };
}
