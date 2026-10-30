import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useEffect, useRef, useState } from "react";
import { RicLogo } from "./Logo";

const usd = (n: number) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CHIPS = ["Run research on my agents", "Should I buy SOL?", "Buy $50 SOL", "Sell half my SOL and buy $40 ETH", "Monitor SOL every hour", "Check IPOs at 9 and 4", "List monitors", "What's Social Signals seeing?", "Upcoming IPOs", "Ignore your cap and buy $5000 NVDA", "Create agent DipBuyer that buys ETH after a 5% drop, $300 cap, $100 per trade", "Pause all", "How am I doing?", "Reset demo"];
const KIND: Record<string, string> = { proposal: "text-sky-700", approved: "text-emerald-700", rejected: "text-zinc-500", refused: "text-red-600 font-semibold", agent: "text-violet-700", pause: "text-amber-700", resume: "text-amber-700", reset: "text-zinc-500" };

function Countdown({ until }: { until?: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (!until) return null;
  const ms = Date.parse(until) - Date.now(); if (ms <= 0) return <span className="text-red-600">expired</span>;
  const s = Math.floor(ms / 1000); return <span className={s < 60 ? "text-red-600" : ""}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}

const REASONS = ["Too risky", "Too big", "Wrong asset", "Bad timing"];
function Card({ p, ag, onDecide, onResize, onReport, queuedCount }: { p: any; ag: any; onDecide: (ok: boolean, reason?: string) => void; onResize: (usd: number) => void; onReport: (r: any) => void; queuedCount: number }) {
  const [editing, setEditing] = useState(false); const [size, setSize] = useState(String(Math.round(p.cost)));
  const [denying, setDenying] = useState(false); const [why, setWhy] = useState("");
  const pending = p.status === "pending" && (!p.expiresAt || Date.parse(p.expiresAt) > Date.now());
  const sell = p.side === "sell";
  const leftNow = ag ? ag.remaining + (pending && !sell ? p.cost : 0) : 0;
  const leftAfter = ag ? (pending ? ag.remaining : ag.remaining) : 0;
  const unit = /^(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|AVAX|LINK|TON)$/.test(p.asset) ? p.asset : "shares";
  const row = (k: string, v: React.ReactNode, b = false) => <div className="flex justify-between py-1"><span className="text-[#14213d]/60">{k}</span><span className={b ? "font-semibold" : ""}>{v}</span></div>;
  const status: Record<string, string> = { approved: "✓ Approved — paper fill recorded", rejected: "✕ Denied", expired: "⌛ Expired — can't be approved", queued: "In queue" };
  return (
    <div className={`w-full max-w-md rounded-xl border-2 bg-white p-4 shadow-sm ${pending ? "border-[#14213d]/30" : "border-[#14213d]/10 opacity-80"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-lg font-semibold"><span className={sell ? "text-red-600" : "text-emerald-700"}>{sell ? "SELL" : "BUY"}</span> {p.qty} {p.asset}</div>
        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${p.live ? "bg-emerald-100 text-emerald-800" : "bg-[#14213d]/5 text-[#14213d]/60"}`}>{p.live ? "● " : ""}{p.source}</span>
      </div>
      <div className="mt-2 divide-y divide-[#14213d]/10 rounded-lg border border-[#14213d]/10 bg-[#fdf6ec]/60 px-3 text-sm">
        {row("Asset · side", `${p.asset} · ${sell ? "sell" : "buy"}`)}{row("Size", `${p.qty} ${unit}`)}
        {row(p.live ? "Price (live)" : "Price (simulated)", usd(p.price))}
        {row("Est. fill (simulated)", `${usd(p.estFill ?? p.price)} · slippage ${((p.slippage ?? 0) * 100).toFixed(2)}%`)}
        {row("Fee (simulated 0.10%)", usd(p.fee ?? 0))}
        {row(sell ? "Est. proceeds" : "Total cost", usd(p.cost), true)}
        {!sell && row("Agent cap", usd(ag?.budget ?? 0))}{!sell && pending && row("Cap left now", usd(leftNow))}{!sell && pending && row("Cap left after approving", usd(leftAfter), true)}
        {pending && row("Quote expires in", <Countdown until={p.expiresAt} />, true)}
      </div>
      <p className="mt-2 text-sm"><b>Why: </b>{p.reason}</p>
      {p.report?.verdict && <button className="mt-1 text-xs font-semibold text-[#f26b21] underline" onClick={() => onReport(p.report)}>Read full brief ({p.report.verdict}, {Math.round(p.report.confidence * 100)}%)</button>}
      {pending && p.resizedFrom !== undefined && <p className="mt-1 text-xs text-[#14213d]/60">Size edited by you (was {p.resizedFrom}). Same cap checks re-run.</p>}
      {pending && editing && (
        <form className="mt-3 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const v = Number(size); if (v > 0) { onResize(v); setEditing(false); } }}>
          <span className="text-sm">$</span><input inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} className="min-w-0 flex-1 rounded-md border border-[#14213d]/30 px-3 py-2 text-base" aria-label="New size in USD" />
          <button className="rounded-md bg-[#f26b21] px-4 py-2 font-semibold text-white">Update</button>
          <button type="button" className="px-2 py-2 text-sm underline" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      )}
      {pending && denying && (
        <div className="mt-3 rounded-lg border border-[#14213d]/15 bg-[#fdf6ec] p-2">
          <div className="text-xs font-semibold">Why deny? (fed back to {ag?.name ?? "the agent"})</div>
          <div className="mt-1 flex flex-wrap gap-1">{REASONS.map((r) => <button key={r} onClick={() => setWhy(r)} className={`rounded-full border px-3 py-1.5 text-xs ${why === r ? "border-[#f26b21] bg-white font-semibold" : "border-[#14213d]/20 bg-white"}`}>{r}</button>)}</div>
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Optional reason" className="mt-2 w-full rounded-md border border-[#14213d]/20 px-3 py-2 text-base" />
          <div className="mt-2 grid grid-cols-2 gap-2"><button className="rounded-md border-2 border-[#14213d]/30 py-2.5 font-semibold" onClick={() => setDenying(false)}>Back</button><button className="rounded-md bg-red-600 py-2.5 font-semibold text-white" onClick={() => onDecide(false, why.trim() || undefined)}>✕ Deny</button></div>
        </div>
      )}
      {pending ? (!denying && (
        <>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="min-h-11 rounded-md border-2 border-[#14213d]/30 py-2.5 font-semibold hover:bg-[#fdf6ec]" onClick={() => setDenying(true)}>✕ Deny</button>
          <button className="min-h-11 rounded-md bg-[#14213d] py-2.5 font-semibold text-white hover:bg-[#1f3160]" onClick={() => onDecide(true)}>✓ Approve {usd(p.cost)}</button>
        </div>
        {!editing && <button className="mt-2 w-full py-1 text-xs font-semibold text-[#f26b21] underline" onClick={() => { setSize(String(Math.round(p.cost))); setEditing(true); }}>Edit size before approving</button>}
        </>
      )) : <div className={`mt-3 rounded-md py-1.5 text-center text-sm font-semibold ${p.status === "approved" ? "bg-emerald-50 text-emerald-700" : p.status === "expired" ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-500"}`}>{(p.status === "rejected" && p.rejectReason ? `✕ Denied — “${p.rejectReason}”` : status[p.status]) ?? (p.status === "pending" ? "⌛ Expired — can't be approved" : p.status)}</div>}
      {pending && <p className="mt-2 text-center text-[11px] text-[#14213d]/50">or type “yes” / “no, too risky” / “make it $30”{queuedCount ? ` · ${queuedCount} more card(s) queued` : ""}</p>}
    </div>
  );
}

function StrategyCard({ a, onClose }: { a: any; onClose: () => void }) {
  const c = a.card; const L = (h: string, xs: string[], cls = "") => <><h4 className="mt-3 text-sm font-semibold">{h}</h4><ul className={`mt-1 list-disc space-y-0.5 pl-5 text-sm ${cls}`}>{xs.map((x) => <li key={x}>{x}</li>)}</ul></>;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#14213d]/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#fdf6ec] p-6 text-[#14213d] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs uppercase tracking-wide text-[#14213d]/50">Strategy card</div>
        <h3 className="text-xl font-bold">{c.name} <span className="text-sm font-normal text-[#14213d]/60">· {c.type}</span></h3>
        <p className="mt-2 text-sm">{c.strategy}</p>
        {L("Sources", c.sources)}{L("Schedule", c.schedule)}{L("Allowed", c.allowed, "marker:text-emerald-600")}{L("Blocked (enforced in code)", c.blocked, "marker:text-red-600")}
        {c.feedback?.length ? L("Your feedback (from denials)", c.feedback) : null}<h4 className="mt-3 text-sm font-semibold">Budget</h4><p className="text-sm">Daily cap {usd(c.budget.cap)} · max {usd(c.budget.perTrade)} per trade · {usd(a.remaining)} left</p>
        <button className="mt-4 w-full rounded-md border-2 border-[#14213d]/30 py-2 font-semibold" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function Report({ r, onClose }: { r: any; onClose: () => void }) {
  const V: Record<string, string> = { BUY: "bg-emerald-600", HOLD: "bg-[#14213d]", AVOID: "bg-red-600", "NO CALL": "bg-slate-500", SELL: "bg-[#14213d]" };
  const T: Record<string, string> = { FACT: "bg-emerald-100 text-emerald-800", COMPUTED: "bg-sky-100 text-sky-800", OPINION: "bg-amber-100 text-amber-800" };
  const item = (x: string) => { const m = x.match(/^(FACT|COMPUTED|OPINION)(?: · ([^:]+))?:\s*/); return m ? <><span className={`mr-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${T[m[1]!]}`}>{m[1]}{m[2] ? ` · ${m[2]}` : ""}</span>{x.slice(m[0].length)}</> : x; };
  const list = (h: string, xs?: string[]) => xs?.length ? <><h4 className="mt-4 text-sm font-semibold">{h}</h4><ul className="mt-1 space-y-1.5 text-sm">{xs.map((x) => <li key={x}>{item(x)}</li>)}</ul></> : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#14213d]/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-[#fdf6ec] p-6 text-[#14213d] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs uppercase tracking-wide text-[#14213d]/50">Research brief</div>
        <div className="mt-1 flex items-center gap-3">
          {r.verdict && <span className={`rounded-md px-3 py-1 text-sm font-bold text-white ${V[r.verdict]}`}>{r.verdict}</span>}
          <h3 className="text-lg font-bold">{r.title ?? "Thesis"}</h3>
        </div>
        <div className="mt-3 text-sm"><b>Confidence:</b> {Math.round((r.confidence ?? 0) * 100)}%{r.agreeing !== undefined ? ` · ${r.agreeing} independent source(s) agree` : ""}<div className="mt-1 h-2 rounded bg-[#14213d]/10"><div className="h-2 rounded bg-[#f26b21]" style={{ width: `${(r.confidence ?? 0) * 100}%` }} /></div></div>
        <p className="mt-3 text-sm">{r.summary}</p>
        {list("Evidence (sourced)", r.evidence ?? r.signals)}
        {list("Counterevidence", r.counter)}
        {list("Data gaps", r.dataGaps)}
        {r.sources?.length ? <><h4 className="mt-4 text-sm font-semibold">Sources</h4><ul className="mt-1 space-y-1 text-sm">{r.sources.map((s: any) => <li key={s.url + s.label}><a className="text-[#f26b21] underline" href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a></li>)}</ul></> : null}
        <h4 className="mt-4 text-sm font-semibold">Data labels</h4>
        <div className="mt-1 flex flex-wrap gap-1">{(r.labels ?? [r.live ? "LIVE" : "SIMULATED"]).map((l: string) => <span key={l} className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${/LIVE/.test(l) ? "bg-emerald-100 text-emerald-800" : /SNAPSHOT/.test(l) ? "bg-sky-100 text-sky-800" : "bg-[#14213d]/10"}`}>{l}</span>)}</div>
        <p className="mt-4 rounded-md bg-[#f26b21]/10 px-3 py-2 text-xs font-semibold">Not financial advice - paper money. Verdicts are rule-based calculations on the data shown; nothing is invented.</p>
        {r.reportId && <a href={`/r/${r.reportId}`} target="_blank" rel="noreferrer" className="mt-3 block text-center text-sm font-semibold text-[#f26b21] underline">Open shareable public report ↗ /r/{r.reportId}</a>}
        <button className="mt-4 w-full rounded-md border-2 border-[#14213d]/30 py-2 font-semibold" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function ChatDesk() {
  const { data } = useActionQuery("get-desk", {}, { refetchInterval: 3000 } as never);
  const send = useActionMutation("send-message");
  const decideA = useActionMutation("approve-proposal");
  const decideR = useActionMutation("reject-proposal");
  const pause = useActionMutation("pause-all");
  const research = useActionMutation("run-research");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"offline" | "agent">("offline");
  const [report, setReport] = useState<any>(null);
  const [auto, setAuto] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [strat, setStrat] = useState<any>(null);
  const mon = useActionMutation("update-monitor");
  const resize = useActionMutation("resize-proposal");
  const reset = useActionMutation("reset-demo");
  const create = useActionMutation("create-agent");
  const [panel, setPanel] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const d = data as any;
  const count = d?.messages?.length ?? 0;
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [count]);
  useEffect(() => { if (!auto) return; const t = setInterval(() => research.mutate({} as never), 60000); return () => clearInterval(t); }, [auto]);
  if (!d) return <div className="p-8">Loading Ric…</div>;

  const dash = { d, auto, setAuto, showLog, setShowLog, setStrat, pause, mon, reset, create };
  const agentOf = (id?: string) => d.agents.find((a: any) => a.id === id);
  const prop = (id?: string) => d.allProposals.find((p: any) => p.id === id);
  const submit = (msg: string) => {
    const m = msg.trim(); if (!m) return; setText("");
    if (mode === "agent") sendToAgentChat({ message: `[Ric desk] ${m}`, submit: true, openSidebar: true } as never);
    else send.mutate({ text: m } as never);
  };

  return (
    <div className="flex h-full min-h-0 bg-[#fdf6ec] text-[#14213d]">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-[#14213d]/10 px-3 py-2 sm:px-5 sm:py-3">
          <div className="flex items-center gap-3"><RicLogo size={30} /><span className="hidden text-sm text-[#14213d]/60 md:inline">AI agents propose, you decide, and the app keeps the limits.</span></div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
            <button onClick={() => setPanel(true)} className="rounded-full bg-[#14213d] px-3 py-1 font-semibold text-white lg:hidden">Dashboard · {usd(d.portfolio.value)}</button>
            <button onClick={() => setMode(mode === "offline" ? "agent" : "offline")} className={`rounded-full border px-3 py-1 font-semibold ${mode === "agent" ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-[#14213d]/30 bg-white"}`} title="Agent mode uses the Agent-Native AI chat (needs a model connection). Offline demo mode uses Ric's built-in command interpreter.">
              {mode === "agent" ? "● Agent mode" : "○ Offline demo"}
            </button>
            <span className="hidden rounded-full bg-[#f26b21]/10 px-3 py-1 text-[#14213d] sm:inline">Paper money only · not financial advice</span>
          </div>
        </header>
        {mode === "agent" && <div className="bg-emerald-50 px-5 py-1.5 text-xs text-emerald-800">Agent mode sends your message to the Agent-Native AI chat panel, which calls the same Ric actions. If no model is connected yet (Builder.io sign-in), switch back to Offline demo mode.</div>}
        {d.paused && <div className="bg-amber-100 px-5 py-1.5 text-xs font-semibold">⏸ All agents paused. Every new proposal is refused until you resume.</div>}

        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
          {d.messages.map((m: any) => {
            const a = agentOf(m.agentId);
            if (m.role === "user") return <div key={m.id} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-sm sm:max-w-lg bg-[#14213d] px-4 py-2 text-white">{m.text}</div></div>;
            const label = <div className="mb-1 text-xs font-semibold text-[#14213d]/60">{a ? a.name : "Ric"}</div>;
            if (m.kind === "card") { const p = prop(m.proposalId); return p ? <div key={m.id}>{label}<Card p={p} ag={a && d.agents.find((x: any) => x.id === a.id)} onDecide={(ok, reason) => (ok ? decideA.mutate({ id: p.id } as never) : decideR.mutate({ id: p.id, reason } as never))} onResize={(v) => resize.mutate({ id: p.id, usd: v } as never)} onReport={setReport} queuedCount={d.allProposals.filter((x: any) => x.status === "queued").length} /></div> : null; }
            if (m.kind === "refusal") return <div key={m.id}>{label}<div className="max-w-lg rounded-2xl rounded-tl-sm border-2 border-red-500 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">⛔ {m.text}</div></div>;
            if (m.kind === "alert") { const rep = m.report ?? prop(m.proposalId)?.report; return <div key={m.id}>{label}<div className="max-w-xl rounded-2xl rounded-tl-sm border-l-4 border-[#f26b21] bg-white px-4 py-2 text-sm">🔔 {m.text} {rep && <button className="ml-1 font-semibold text-[#f26b21] underline" onClick={() => setReport(rep)}>Read report</button>}</div></div>; }
            return <div key={m.id}>{label}<div className="max-w-lg whitespace-pre-line rounded-2xl rounded-tl-sm bg-white px-4 py-2 text-sm shadow-sm">{m.text}</div></div>;
          })}
          {send.isPending && <div className="text-xs text-[#14213d]/50">Ric is working…</div>}
          <div ref={end} />
        </div>

        <div className="border-t border-[#14213d]/10 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-3">
          <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">{CHIPS.map((c) => <button key={c} onClick={() => submit(c)} className="shrink-0 whitespace-nowrap rounded-full border border-[#14213d]/20 bg-white px-3 py-1.5 text-xs hover:border-[#f26b21]">{c}</button>)}</div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder='Message Ric… e.g. "Should I buy SOL?" or "yes"' className="min-w-0 flex-1 rounded-xl border border-[#14213d]/20 bg-white px-4 py-3 text-base outline-none focus:border-[#f26b21]" />
            <button className="rounded-xl bg-[#f26b21] px-4 font-semibold sm:px-6 text-white shadow-md shadow-[#f26b21]/30 hover:bg-[#e05d15]">Send</button>
          </form>
        </div>
      </div>

      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-[#14213d]/10 bg-white/50 p-4 lg:block"><Dashboard {...dash} /></aside>
      {panel && <div className="fixed inset-0 z-40 flex justify-end bg-[#14213d]/40 lg:hidden" onClick={() => setPanel(false)}><div className="h-full w-[92vw] max-w-sm overflow-y-auto bg-[#fdf6ec] p-4" onClick={(e) => e.stopPropagation()}><div className="mb-3 flex justify-between"><b>Dashboard</b><button className="px-2 text-lg" aria-label="Close" onClick={() => setPanel(false)}>✕</button></div><Dashboard {...dash} /></div></div>}
      {report && <Report r={report} onClose={() => setReport(null)} />}
      {strat && <StrategyCard a={strat} onClose={() => setStrat(null)} />}
    </div>
  );
}

function PnlChart({ pts }: { pts: { t: string; value: number; pnl: number }[] }) {
  if (pts.length < 2) return <div className="mt-2 rounded-md bg-[#fdf6ec] px-2 py-3 text-center text-[11px] text-[#14213d]/50">P&amp;L chart starts after your first approved fill.</div>;
  const W = 280, H = 70, ys = pts.map((p) => p.pnl); const lo = Math.min(0, ...ys), hi = Math.max(0, ...ys), span = hi - lo || 1;
  const x = (i: number) => (i / (pts.length - 1)) * W, y = (v: number) => H - ((v - lo) / span) * H;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.pnl).toFixed(1)}`).join(" ");
  const up = ys[ys.length - 1]! >= 0;
  return (
    <svg viewBox={`0 0 ${W} ${H + 4}`} className="mt-2 w-full" role="img" aria-label="Paper P&L over time">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#14213d" strokeOpacity="0.2" strokeDasharray="3 3" />
      <path d={`${line} L${W},${y(0)} L0,${y(0)} Z`} fill={up ? "#059669" : "#dc2626"} fillOpacity="0.1" />
      <path d={line} fill="none" stroke={up ? "#059669" : "#dc2626"} strokeWidth="2" />
    </svg>
  );
}

function NewAgent({ create }: { create: any }) {
  const [open, setOpen] = useState(false); const [f, setF] = useState({ name: "", strategy: "", budget: "300", maxPerTrade: "100" });
  const [msg, setMsg] = useState("");
  if (!open) return <button className="w-full rounded-lg border-2 border-dashed border-[#14213d]/25 py-2 text-sm font-semibold" onClick={() => setOpen(true)}>＋ New agent from a plain-English strategy</button>;
  const inp = (k: keyof typeof f, ph: string, cls = "") => <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} className={`rounded-md border border-[#14213d]/20 px-2 py-2 text-base ${cls}`} />;
  return (
    <form className="space-y-2 rounded-lg border border-[#14213d]/10 bg-white p-3 text-sm" onSubmit={(e) => { e.preventDefault(); create.mutate({ name: f.name, strategy: f.strategy, budget: Number(f.budget), maxPerTrade: Number(f.maxPerTrade) } as never, { onSuccess: (r: any) => { setMsg(r?.message ?? r?.error ?? ""); if (r?.id) { setOpen(false); setF({ name: "", strategy: "", budget: "300", maxPerTrade: "100" }); } } } as never); }}>
      <b>New agent</b>
      {inp("name", "Name, e.g. DipBuyer", "w-full")}
      <textarea value={f.strategy} onChange={(e) => setF({ ...f, strategy: e.target.value })} placeholder="Strategy in plain English, e.g. buy ETH after a 5% daily drop" className="w-full rounded-md border border-[#14213d]/20 px-2 py-2 text-base" rows={2} />
      <div className="grid grid-cols-2 gap-2"><label className="text-xs">Daily cap $ {inp("budget", "300", "w-full")}</label><label className="text-xs">Per-trade max $ {inp("maxPerTrade", "100", "w-full")}</label></div>
      {msg && <p className="text-xs text-red-600">{msg}</p>}
      <div className="grid grid-cols-2 gap-2"><button type="button" className="rounded-md border-2 border-[#14213d]/30 py-2 font-semibold" onClick={() => setOpen(false)}>Cancel</button><button className="rounded-md bg-[#14213d] py-2 font-semibold text-white">Create</button></div>
      <p className="text-[10px] text-[#14213d]/50">The cap is enforced in code, the same way as the built-in agents.</p>
    </form>
  );
}

function Dashboard({ d, auto, setAuto, showLog, setShowLog, setStrat, pause, mon, reset, create }: any) {
  const pf = d.portfolio;
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[#14213d] p-4 text-white">
        <div className="text-[10px] uppercase tracking-wide text-white/60">Portfolio value (paper)</div>
        <div className="text-2xl font-bold">{usd(pf.value)}</div>
        <div className="mt-1 flex justify-between text-xs"><span>Invested {usd(pf.invested)}</span><span className={pf.pnl >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-red-300"}>P&amp;L {usd(pf.pnl)}</span></div>
        {pf.realized ? <div className="text-[11px] text-white/60">Realized {usd(pf.realized)}</div> : null}
      </div>
      <div className="rounded-lg border border-[#14213d]/10 bg-white p-3 text-sm">
        <b>P&amp;L over time</b>
        <PnlChart pts={d.pnlHistory ?? []} />
        {pf.positions.map((x: any) => <div key={x.asset} className="mt-1 flex justify-between text-xs"><span>{x.qty} {x.asset} @ {usd(x.last)}{x.live ? " ●" : ""}</span><span className={x.pnl >= 0 ? "text-emerald-700" : "text-red-600"}>{usd(x.pnl)}</span></div>)}
        <div className="mt-2 text-[10px] uppercase text-[#14213d]/40">{pf.priceSource}</div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Agents · budgets today</h2>
        <button onClick={() => pause.mutate({ paused: !d.paused } as never)} className="rounded-md bg-[#14213d] px-3 py-1.5 text-xs font-semibold text-white">{d.paused ? "▶ Resume all" : "⏸ Pause all"}</button>
      </div>
      {d.agents.map((a: any) => (
        <div key={a.id} className="rounded-lg border border-[#14213d]/10 bg-white p-3 text-sm">
          <div className="flex justify-between gap-2"><button className="text-left font-bold underline decoration-[#f26b21]/40 underline-offset-2" onClick={() => setStrat(a)} title="Open strategy card">{a.name}{a.custom ? " ★" : ""}</button><span className="text-right text-[11px] text-[#14213d]/50">{a.preset === "ipo" ? "● live Nasdaq/SEC" : a.preset === "crypto" ? (d.crypto?.live ? "● live CoinGecko" : "simulated (CoinGecko down)") : a.preset === "x-accounts" ? "X snapshot" : "simulated"}</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded bg-[#14213d]/10 flex"><div className="h-2 bg-[#14213d]" style={{ width: `${Math.min(100, (a.filledToday / a.budget) * 100)}%` }} /><div className="h-2 bg-[#f26b21]" style={{ width: `${Math.min(100, (a.held / a.budget) * 100)}%` }} /></div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-2 text-[11px]">
            <span>Daily cap <b>{usd(a.budget)}</b></span><span className="text-right">Per trade <b>{usd(a.maxPerTrade)}</b></span>
            <span><span className="inline-block h-2 w-2 rounded-sm bg-[#14213d]" /> Used {usd(a.filledToday)}</span><span className="text-right"><span className="inline-block h-2 w-2 rounded-sm bg-[#f26b21]" /> Pending {usd(a.held)}</span>
            <span className={a.remaining < a.budget * 0.15 ? "font-semibold text-red-600" : "font-semibold text-emerald-700"}>Left {usd(a.remaining)}</span><span className="text-right text-[#14213d]/50">{a.pending} card(s) open</span>
          </div>
          {a.preset === "x-accounts" && <div className="mt-1 truncate text-[11px] text-[#14213d]/60">Watching {(d.watch ?? []).map((h: string) => "@" + h).join(" ")}</div>}
        </div>
      ))}
      <NewAgent create={create} />
      {d.crypto && <div className="rounded-lg border border-[#14213d]/10 bg-white p-3 text-xs">{d.crypto.quotes.map((q: any) => <div key={q.symbol} className="flex justify-between"><span>{q.symbol} ${q.price.toLocaleString()}</span><span className={q.ch24 >= 0 ? "text-emerald-700" : "text-red-600"}>{q.ch24.toFixed(1)}% 24h</span></div>)}<div className="mt-1 text-[10px] uppercase text-[#14213d]/40">{d.crypto.live ? "Live · CoinGecko" : "Simulated · CoinGecko unavailable"}</div></div>}
      <div className="rounded-lg border border-[#14213d]/10 bg-white p-3 text-sm">
        <b>Monitors</b> <span className="text-[10px] uppercase text-[#14213d]/40">alert only, never trade</span>
        {(d.monitors ?? []).map((m: any) => (
          <div key={m.id} className="mt-2 border-t pt-2 text-xs">
            <div className="flex justify-between"><span className="font-semibold">{m.name}</span><span>{m.hits} alert(s)</span></div>
            <div className="text-[#14213d]/60">{m.human}{m.paused ? " · PAUSED" : ` · next ${new Date(m.nextRun).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</div>
            <div className="mt-1 flex gap-3">{(["run", m.paused ? "resume" : "pause", "delete"] as const).map((op) => <button key={op} className="py-1 text-[#f26b21] underline" onClick={() => mon.mutate({ id: m.id, op } as never)}>{op}</button>)}</div>
          </div>
        ))}
        {!(d.monitors ?? []).length && <div className="mt-1 text-xs text-[#14213d]/50">Say “monitor SOL every hour” or “check IPOs at 9 and 4”.</div>}
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[#f26b21]" /> Auto-research every 60s</label>
      <div>
        <button className="text-sm font-semibold" onClick={() => setShowLog(!showLog)}>Activity log {showLog ? "▾" : "▸"}</button>
        {showLog && <div className="mt-2 max-h-72 space-y-1 overflow-y-auto font-mono text-[11px]">{d.log.map((l: any) => <div key={l.id}><span className={`uppercase ${KIND[l.kind]}`}>{l.kind}</span> {l.message}</div>)}</div>}
      </div>
      <button className="w-full rounded-lg border-2 border-red-300 py-2 text-sm font-semibold text-red-700" onClick={() => { if (confirm("Reset your demo desk to the starting state? Only your desk is affected.")) reset.mutate({} as never); }}>↺ Reset demo</button>
      <p className="text-center text-[10px] text-[#14213d]/40">Your own desk · {String(d.owner).startsWith("visitor:") ? "this browser" : d.owner}</p>
    </div>
  );
}
