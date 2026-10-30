/** Live, free SEC EDGAR full-text search for recent IPO prospectuses (424B4) and S-1s. */
export type IpoFiling = { company: string; ticker: string; form: string; date: string; link: string; spac: boolean };
const UA = "Ric paper-trading hackathon demo (contact: ric-demo@example.com)";
let cache: { at: number; rows: IpoFiling[] } | null = null;

export async function recentIpoFilings(): Promise<IpoFiling[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.rows;
  const end = new Date(); const start = new Date(Date.now() - 30 * 86400_000);
  const f = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://efts.sec.gov/LATEST/search-index?forms=424B4,S-1&dateRange=custom&startdt=${f(start)}&enddt=${f(end)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`EDGAR ${res.status}`);
  const j = (await res.json()) as { hits?: { hits?: { _id: string; _source: { ciks: string[]; display_names: string[]; form: string; file_date: string; adsh: string; sics?: string[] } }[] } };
  const rows: IpoFiling[] = [];
  for (const h of j.hits?.hits ?? []) {
    const s = h._source; const name = s.display_names?.[0] ?? "";
    const m = name.match(/^(.*?)\s+\(([A-Z.\-, ]+)\)\s+\(CIK/);
    if (!m) continue;
    const ticker = m[2]!.split(",")[0]!.trim();
    const file = h._id.split(":")[1] ?? "";
    const cik = String(Number(s.ciks[0]));
    rows.push({ company: m[1]!.trim(), ticker, form: s.form, date: s.file_date, spac: (s.sics ?? []).includes("6770"),
      link: `https://www.sec.gov/Archives/edgar/data/${cik}/${s.adsh.replace(/-/g, "")}/${file}` });
  }
  if (!rows.length) throw new Error("EDGAR returned no ticker filings");
  rows.sort((a, b) => Number(a.spac) - Number(b.spac));
  cache = { at: Date.now(), rows };
  return rows;
}
