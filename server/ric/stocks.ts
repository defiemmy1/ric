/** Stocks & IPOs: Nasdaq IPO calendar (priced + upcoming) + SEC EDGAR filings, with live-or-simulated quotes. */
import { recentIpoFilings } from "./edgar";
import { analyze, finalize, stockSeries, type Brief } from "./market";

type Ipo = { ticker: string; company: string; price: number; date: string; exchange: string; status: "priced" | "upcoming" | "filed"; offer: string };
let memo: { at: number; v: Ipo[]; live: boolean } | null = null;

async function nasdaqMonth(ym: string) {
  const r = await fetch(`https://api.nasdaq.com/api/ipo/calendar?date=${ym}`, { headers: { "User-Agent": "Mozilla/5.0 (Ric demo)", Accept: "application/json" }, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(`Nasdaq ${r.status}`);
  return ((await r.json()) as any).data ?? {};
}
export async function ipoCalendar(): Promise<{ rows: Ipo[]; live: boolean }> {
  if (memo && Date.now() - memo.at < 30 * 60_000) return { rows: memo.v, live: memo.live };
  const now = new Date(); const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  try {
    const rows: Ipo[] = [];
    for (const m of [ym(now), ym(prev)]) {
      const d = await nasdaqMonth(m);
      for (const x of d.priced?.rows ?? []) rows.push({ ticker: x.proposedTickerSymbol, company: x.companyName, price: parseFloat(x.proposedSharePrice) || 0, date: x.pricedDate, exchange: x.proposedExchange, status: "priced", offer: x.dollarValueOfSharesOffered });
      for (const x of d.upcoming?.upcomingTable?.rows ?? []) rows.push({ ticker: x.proposedTickerSymbol, company: x.companyName, price: parseFloat(x.proposedSharePrice) || 0, date: x.expectedPriceDate, exchange: x.proposedExchange, status: "upcoming", offer: x.dollarValueOfSharesOffered });
    }
    if (!rows.length) throw new Error("empty");
    memo = { at: Date.now(), v: rows, live: true }; return { rows, live: true };
  } catch {
    return { rows: [{ ticker: "ASPE", company: "Aspen Neuroscience, Inc. (snapshot)", price: 15, date: "10/30/2026", exchange: "NASDAQ Global Select", status: "upcoming", offer: "$140,625,000" }], live: false };
  }
}

const SPAC = /acquisition|capital|partners|holdings? corp|spac|trust/i;

export async function stocksThesis(): Promise<{ asset?: string; price?: number; brief: Brief }> {
  const [cal, filings] = await Promise.all([ipoCalendar(), recentIpoFilings().catch(() => [])]);
  const label = cal.live ? "LIVE IPO calendar (Nasdaq public JSON)" : "SNAPSHOT IPO calendar (Nasdaq unreachable)";
  const priced = cal.rows.filter((r) => r.status === "priced" && r.ticker && !SPAC.test(r.company) && !/U$/.test(r.ticker));
  const upcoming = cal.rows.filter((r) => r.status === "upcoming");
  const watch = upcoming.slice(0, 3).map((u) => `Upcoming: ${u.company} (${u.ticker}) expected ${u.date} at $${u.price || "?"}, ${u.offer} on ${u.exchange}`);
  const fil = filings.filter((f) => !f.spac).slice(0, 2).map((f) => `SEC EDGAR: ${f.company} (${f.ticker}) filed ${f.form} on ${f.date}`);
  for (const ipo of priced.slice(0, 6)) {
    const s = await stockSeries(ipo.ticker);
    if (!s.live) continue;
    const vsIpo = ((s.price - ipo.price) / ipo.price) * 100;
    const a = analyze({ ...s, closes: s.closes.length >= 5 ? s.closes : [s.price] });
    const verdict: Brief["verdict"] = vsIpo < 0 ? "AVOID" : vsIpo > 40 ? "HOLD" : a.verdict === "AVOID" ? "HOLD" : "BUY";
    const brief: Brief = {
        verdict, confidence: Math.min(0.6, a.confidence), title: `${ipo.company} (${ipo.ticker}) — ${verdict}`,
        summary: `${ipo.company} priced its IPO at $${ipo.price} on ${ipo.date} (${ipo.exchange}). It now trades at $${s.price.toFixed(2)}, ${vsIpo >= 0 ? "+" : ""}${vsIpo.toFixed(1)}% vs the IPO price. ${verdict === "BUY" ? "Holding above the offer without being overextended is a constructive early sign." : verdict === "HOLD" ? "Already well above the offer or trend unclear; wait." : "Trading below its offer price is a weak debut."}`,
        evidence: [`FACT · Nasdaq: IPO priced at $${ipo.price} on ${ipo.date}, raised ${ipo.offer}`, `FACT · Yahoo: last price $${s.price.toFixed(2)}`, `COMPUTED: ${vsIpo >= 0 ? "+" : ""}${vsIpo.toFixed(1)}% vs IPO price`, ...a.evidence.filter((x) => !/^FACT/.test(x)).slice(0, 2), ...fil.slice(0, 1).map((x) => `FACT · ${x}`)],
        counter: ["OPINION: new listings are volatile and have little trading history", ...a.counter.slice(0, 2), "OPINION: lock-up expiry (often ~180 days) can add selling pressure"],
        sources: [{ label: "Nasdaq IPO calendar", url: "https://www.nasdaq.com/market-activity/ipos" }, { label: s.source, url: s.url }, ...filings.slice(0, 1).map((f) => ({ label: `SEC ${f.form}: ${f.company}`, url: f.link }))],
        labels: [label, s.source, filings.length ? "LIVE SEC EDGAR full-text search" : "SEC EDGAR unavailable"],
        dataGaps: ["Few trading days since listing: indicators are less reliable", "Yahoo quote endpoint is unofficial", "A filing is not an IPO; S-1/A amendments are not new deals"],
    };
    const agreeing = (cal.live ? 1 : 0) + 1 + (filings.length ? 1 : 0);
    return { asset: ipo.ticker, price: s.price, brief: finalize(brief, verdict === "BUY" ? agreeing : Math.min(agreeing, 2), false) };
  }
  return { brief: finalize({ verdict: "NO CALL", confidence: 0.3, title: "IPO watchlist — NO CALL", summary: "No recently priced operating-company IPO had a live quote to analyze. Watching upcoming deals.", evidence: [...watch, ...fil].map((x) => `FACT · ${x}`), counter: ["OPINION: upcoming IPOs can't be bought until they list"], sources: [{ label: "Nasdaq IPO calendar", url: "https://www.nasdaq.com/market-activity/ipos" }], labels: [label], dataGaps: ["No live quote for a recently priced IPO"] }, cal.live ? 1 : 0) };
}

export async function upcomingIpos() { const c = await ipoCalendar(); return { live: c.live, rows: c.rows.filter((r) => r.status === "upcoming") }; }
