/** Market data + analysis computed in code. Never invents numbers: every figure comes from a fetched series or is labeled simulated. */
import { setLivePrice, simPrice } from "./desk";

export type Brief = {
  verdict: "BUY" | "HOLD" | "AVOID" | "NO CALL"; confidence: number; title: string; summary: string;
  /** Each item starts with "FACT · <source>:", "COMPUTED:" or "OPINION:" */
  evidence: string[]; counter: string[]; sources: { label: string; url: string }[]; labels: string[];
  dataGaps?: string[]; agreeing?: number; chart?: { label: string; points: number[] } | undefined;
};

/** Confidence is capped by how many independent sources agree; mixed signals abstain. */
export const confidenceCap = (n: number) => (n <= 0 ? 0.2 : n === 1 ? 0.4 : n === 2 ? 0.6 : 0.75);
export function finalize(b: Brief, agreeing: number, mixed = false): Brief {
  b.agreeing = agreeing;
  if (mixed && b.verdict !== "AVOID") { b.verdict = "NO CALL"; b.title = b.title.replace(/— \w+( \w+)?$/, "— NO CALL"); b.summary = b.summary.replace(/→ HOLD\.?/, "→ mixed.") + " Signals are mixed, so Ric makes no call."; }
  const cap = confidenceCap(agreeing);
  if (b.confidence > cap) { b.confidence = cap; (b.dataGaps ??= []).push(`Confidence capped at ${Math.round(cap * 100)}% because only ${agreeing} independent source${agreeing === 1 ? "" : "s"} agree${agreeing === 1 ? "s" : ""}`); }
  if (b.verdict === "NO CALL") b.confidence = Math.min(b.confidence, 0.3);
  return b;
}
export type Series = { symbol: string; name: string; closes: number[]; price: number; ch24?: number | undefined; volume?: number | undefined; live: boolean; source: string; url: string };

const memo = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const m = memo.get(key); if (m && Date.now() - m.at < ttl) return m.v as T;
  const v = await fn(); memo.set(key, { at: Date.now(), v }); return v;
}
const UA = { "User-Agent": "Mozilla/5.0 (Ric paper-trading demo)", Accept: "application/json" };
async function getJson(url: string) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json() as Promise<any>;
}

export const COINS: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple", BNB: "binancecoin", DOGE: "dogecoin", ADA: "cardano", AVAX: "avalanche-2", LINK: "chainlink", TON: "the-open-network" };

export async function coinMarkets() {
  return cached("markets", 60_000, async () => {
    const ids = Object.values(COINS).join(",");
    const j = await getJson(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h,7d,30d`);
    if (!Array.isArray(j) || !j.length) throw new Error("CoinGecko empty");
    const rows = j.map((c: any) => ({ symbol: String(c.symbol).toUpperCase(), id: c.id, name: c.name, price: c.current_price as number,
      ch24: c.price_change_percentage_24h_in_currency ?? 0, ch7d: c.price_change_percentage_7d_in_currency ?? 0, ch30d: c.price_change_percentage_30d_in_currency ?? 0,
      volume: c.total_volume ?? 0, mcap: c.market_cap ?? 0 }));
    for (const r of rows) setLivePrice(r.symbol, r.price);
    return rows;
  });
}

export async function cryptoSeries(sym: string): Promise<Series> {
  const id = COINS[sym]; if (!id) throw new Error(`Unknown coin ${sym}`);
  try {
    const [mk, ch] = await Promise.all([coinMarkets(), cached(`chart:${id}`, 10 * 60_000, () => getJson(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=30&interval=daily`))]);
    const row = mk.find((r: any) => r.symbol === sym);
    const closes = (ch.prices as [number, number][]).map((p) => p[1]);
    const price = row?.price ?? closes[closes.length - 1]!; setLivePrice(sym, price);
    return { symbol: sym, name: row?.name ?? sym, closes, price, ch24: row?.ch24, volume: row?.volume, live: true, source: "LIVE (CoinGecko)", url: `https://www.coingecko.com/en/coins/${id}` };
  } catch { return simSeries(sym, "SIMULATED (CoinGecko unavailable)"); }
}

export async function stockSeries(sym: string): Promise<Series> {
  try {
    const j = await cached(`y:${sym}`, 5 * 60_000, () => getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2mo&interval=1d`));
    const res = j?.chart?.result?.[0]; const closes = (res?.indicators?.quote?.[0]?.close ?? []).filter((x: unknown) => typeof x === "number") as number[];
    const price = res?.meta?.regularMarketPrice ?? closes[closes.length - 1];
    if (!price || closes.length < 5) throw new Error("no data");
    setLivePrice(sym, price);
    const prev = res?.meta?.chartPreviousClose && closes.length > 1 ? closes[closes.length - 2]! : undefined;
    return { symbol: sym, name: res?.meta?.longName ?? sym, closes, price, ch24: prev ? ((price - prev) / prev) * 100 : undefined, live: true, source: "LIVE (Yahoo Finance, unofficial free endpoint)", url: `https://finance.yahoo.com/quote/${sym}` };
  } catch { return simSeries(sym, "SIMULATED (no free quote)"); }
}

function simSeries(sym: string, source: string): Series {
  const now = Date.now(); const closes = Array.from({ length: 30 }, (_, i) => simPrice(sym, now - (29 - i) * 86400_000 * 0 - (29 - i) * 3600_000 * 4));
  return { symbol: sym, name: sym, closes, price: closes[closes.length - 1]!, live: false, source, url: "" };
}

export function rsi(closes: number[], n = 14) {
  if (closes.length <= n) return 50;
  let g = 0, l = 0;
  for (let i = closes.length - n; i < closes.length; i++) { const d = closes[i]! - closes[i - 1]!; if (d > 0) g += d; else l -= d; }
  if (l === 0) return 100; const rs = g / l; return 100 - 100 / (1 + rs);
}
const last1 = (a: number[]) => a[a.length - 1]!;
const pct = (a: number, b: number) => ((a - b) / b) * 100;
const f = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

/** Rule-based verdict over a price series. All inputs are computed from the series. */
export function analyze(s: Series, extra: { ch7d?: number; ch30d?: number } = {}): Brief {
  const c = s.closes; const last = s.price;
  const r = rsi(c); const high30 = Math.max(...c.slice(-30)); const dd = pct(last, high30);
  const ch7 = extra.ch7d ?? (c.length > 7 ? pct(last, c[c.length - 8]!) : 0);
  const ch30 = extra.ch30d ?? pct(last, c[Math.max(0, c.length - 31)]!);
  const sma = c.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, c.length);
  const pro: string[] = [], con: string[] = []; let score = 0;
  pro.push(`FACT · ${s.live ? s.source.replace(/^LIVE \(|\)$/g, "") : "simulated"}: last price $${last.toLocaleString(undefined, { maximumFractionDigits: 4 })}`);
  if (r < 35) { score += 2; pro.push(`RSI(14) is ${r.toFixed(0)}: oversold zone, bounces are common from here`); }
  else if (r > 70) { score -= 2; con.push(`RSI(14) is ${r.toFixed(0)}: overbought, late to chase`); }
  else (r >= 50 ? pro : con).push(`RSI(14) is ${r.toFixed(0)} (neutral)`);
  if (last > sma) { score += 1; pro.push(`Price is above its 20-day average (${sma.toFixed(2)}): uptrend intact`); }
  else { score -= 1; con.push(`Price is below its 20-day average (${sma.toFixed(2)}): trend is down`); }
  if (ch7 > 0) { score += 1; pro.push(`7-day momentum ${f(ch7)}`); } else con.push(`7-day momentum ${f(ch7)}`);
  if (dd < -25) { score -= 1; con.push(`${f(dd)} from its 30-day high: falling-knife risk`); } else if (dd < -10) pro.push(`${f(dd)} from its 30-day high: discount without a collapse`);
  if (s.ch24 !== undefined) (s.ch24 >= 0 ? pro : con).push(`24h move ${f(s.ch24)}`);
  con.push(`30-day change ${f(ch30)}`);
  const tag = (x: string) => (/^FACT/.test(x) ? x : `COMPUTED: ${x}`);
  for (const arr of [pro, con]) for (let i = 0; i < arr.length; i++) arr[i] = tag(arr[i]!);
  if (score >= 2) pro.push("OPINION: setup favors a small starter position, sized inside the cap");
  if (score <= -1) con.push("OPINION: wait for the trend to turn before buying");
  const verdict = score >= 2 ? "BUY" : score <= -1 ? "AVOID" : "HOLD";
  const mixed = verdict === "HOLD";
  const confidence = Math.min(0.75, 0.4 + 0.08 * Math.abs(score)) * (s.live ? 1 : 0.7);
  const brief: Brief = {
    verdict, confidence, title: `${s.name} (${s.symbol}) — ${verdict}`,
    summary: `${s.symbol} at $${last.toLocaleString(undefined, { maximumFractionDigits: 4 })}. Rule score ${score} from RSI, trend, momentum and drawdown → ${verdict}.`,
    evidence: verdict === "AVOID" ? con : pro, counter: verdict === "AVOID" ? pro : con,
    sources: s.url ? [{ label: s.source, url: s.url }] : [], labels: [s.source, "Indicators computed in code from the series above"],
    chart: { label: `${s.symbol} daily close, ${s.live ? s.source : "SIMULATED"}`, points: s.closes.slice(-60).map((x) => Math.round(x * 1e4) / 1e4) },
    dataGaps: [s.live ? "Single price source (no second feed to cross-check)" : "No live price: series is SIMULATED", "No order book, on-chain or news data in this read"],
  };
  return finalize(brief, s.live ? 1 : 0, mixed);
}
