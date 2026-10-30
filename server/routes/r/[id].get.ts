import { defineEventHandler, getRouterParam, setResponseHeader } from "h3";
import { getReport } from "../../ric/desk";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeUrl = (u: string) => (/^https:\/\//.test(u) ? u : "#");
const tag = (t: string) => { const m = t.match(/^(FACT|COMPUTED|OPINION)(?: · ([^:]+))?:\s*/); return m ? `<span class="t ${m[1]!.toLowerCase()}">${m[1]}${m[2] ? " · " + esc(m[2]) : ""}</span> ${esc(t.slice(m[0].length))}` : esc(t); };

function chart(points: number[]) {
  if (points.length < 2) return "";
  const W = 640, H = 180, min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const pts = points.map((p, i) => `${((i / (points.length - 1)) * W).toFixed(1)},${(H - ((p - min) / span) * (H - 20) - 10).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="price chart"><polyline fill="none" stroke="#f26b21" stroke-width="2.5" points="${pts}"/><text x="4" y="14" font-size="11" fill="#14213d">${max.toLocaleString()}</text><text x="4" y="${H - 2}" font-size="11" fill="#14213d">${min.toLocaleString()}</text></svg>`;
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const r = /^rp_[a-z0-9]+$/.test(id) ? await getReport(id) : null;
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  if (!r) { event.res.status = 404; return `<!doctype html><title>Report not found</title><body style="font-family:system-ui;background:#fdf6ec;color:#14213d;padding:40px"><h1>Report not found</h1><a href="/">Ric</a></body>`; }
  const color = { BUY: "#15803d", AVOID: "#dc2626", HOLD: "#14213d", "NO CALL": "#64748b", SELL: "#14213d" }[r.verdict ?? "HOLD"] ?? "#14213d";
  const li = (xs?: string[]) => (xs ?? []).map((x) => `<li>${tag(x)}</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(r.title)} · Ric brief</title><link rel="icon" href="/favicon.svg">
<style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#fdf6ec;color:#14213d}main{max-width:760px;margin:0 auto;padding:32px 20px}h1{font-size:26px;margin:8px 0}.v{display:inline-block;color:#fff;font-weight:800;padding:6px 14px;border-radius:8px}.bar{height:10px;background:#14213d1a;border-radius:6px}.bar i{display:block;height:10px;background:#f26b21;border-radius:6px}section{background:#fff;border:1px solid #14213d1a;border-radius:14px;padding:16px 20px;margin:14px 0}h2{font-size:15px;margin:0 0 8px}li{margin:6px 0;font-size:14px}.t{font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px}.fact{background:#dcfce7;color:#166534}.computed{background:#e0f2fe;color:#075985}.opinion{background:#fef3c7;color:#92400e}.lab{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;background:#14213d14;padding:3px 7px;border-radius:4px;margin:2px}a{color:#f26b21}.nfa{background:#f26b211a;font-weight:700;font-size:13px;padding:10px 14px;border-radius:10px}</style></head>
<body><main><a href="/" style="text-decoration:none;font-weight:800;color:#14213d">R<span style="color:#f26b21">.</span> Ric</a> <span style="font-size:12px;opacity:.6">public research brief · ${esc(r.agent)} · ${esc(r.createdAt?.slice(0, 16).replace("T", " "))} UTC</span>
<div style="margin-top:18px"><span class="v" style="background:${color}">${esc(r.verdict)}</span></div><h1>${esc(r.title)}</h1>
<div><b>Confidence ${Math.round((r.confidence ?? 0) * 100)}%</b>${r.agreeing !== undefined ? ` · ${r.agreeing} independent source(s) agree` : ""}<div class="bar"><i style="width:${(r.confidence ?? 0) * 100}%"></i></div></div>
<p>${esc(r.summary)}</p>
${r.chart?.points?.length ? `<section><h2>Price chart</h2>${chart(r.chart.points)}<div style="font-size:11px;opacity:.6">${esc(r.chart.label)}</div></section>` : ""}
<section><h2>Evidence</h2><ul>${li(r.evidence)}</ul></section>
<section><h2>Counterevidence</h2><ul>${li(r.counter)}</ul></section>
<section><h2>Data gaps</h2><ul>${li(r.dataGaps)}</ul></section>
<section><h2>Sources</h2><ul>${(r.sources ?? []).map((s) => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a></li>`).join("")}</ul><div>${(r.labels ?? []).map((l) => `<span class="lab">${esc(l)}</span>`).join("")}</div></section>
<p class="nfa">Not financial advice - paper money. Verdicts are rule-based calculations on the data shown; nothing is invented.</p></main></body></html>`;
});
