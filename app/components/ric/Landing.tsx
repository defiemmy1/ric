import { RicLogo } from "./Logo";

const steps = [
  ["1", "Agents research", "Three strategy agents (Social Signals, Crypto, Stocks & IPOs) write a thesis with evidence, counterpoints, confidence and sources."],
  ["2", "You decide", "Every proposal is an exact-order preview. Nothing runs until you tap Approve."],
  ["3", "The app keeps the limits", "Budget caps and per-trade maximums are checked in code. 'Ignore your cap' is refused and logged."],
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#fdf6ec] text-[#14213d]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <RicLogo />
        <span className="rounded-full border border-[#14213d]/20 px-3 py-1 text-xs">Prototype - paper money only, no real trades</span>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-20 pt-12">
        <h1 className="max-w-3xl text-5xl font-bold leading-tight tracking-tight">AI agents propose, you decide, and the app keeps the limits.</h1>
        <p className="mt-4 max-w-2xl text-lg text-[#14213d]/70">Ric is a paper-trading desk run by AI agents. Each agent has a strategy and a hard budget cap that no prompt can break.</p>
        <a href="/home" className="mt-8 inline-block rounded-xl bg-[#f26b21] px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-[#f26b21]/30 hover:bg-[#e05d15]">Open the desk →</a>
        <section className="mt-16 grid gap-5 md:grid-cols-3">
          {steps.map(([n, t, d]) => (
            <div key={n} className="rounded-2xl border border-[#14213d]/10 bg-white/70 p-6">
              <div className="flex size-9 items-center justify-center rounded-full bg-[#14213d] font-bold text-white">{n}</div>
              <h3 className="mt-4 text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-[#14213d]/70">{d}</p>
            </div>
          ))}
        </section>
        <p className="mt-16 text-xs text-[#14213d]/50">Paper trading only. No real money, no brokerage. Not financial advice. Built with Agent-Native.</p>
      </main>
    </div>
  );
}
