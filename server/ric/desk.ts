import { getSetting, mutateSetting, putSetting } from "@agent-native/core/settings";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { AsyncLocalStorage } from "node:async_hooks";

const KEY_PREFIX = "ric:desk:v2:";
const ownerStore = new AsyncLocalStorage<string>();
/** Each signed-in user gets their own desk. CLI/tests use "local". */
export const deskOwner = () => ownerStore.getStore() ?? getRequestUserEmail() ?? "local";
export const withOwner = <T>(owner: string, fn: () => Promise<T>) => ownerStore.run(owner, fn);
export const DESK_PREFIX = KEY_PREFIX;
const KEY_ = () => KEY_PREFIX + deskOwner();

export type Agent = { id: string; name: string; preset: string; strategy: string; budget: number; maxPerTrade?: number | undefined; createdAt: string };
export type Proposal = {
  id: string; agentId: string; asset: string; side: "buy" | "sell"; qty: number; price: number; cost: number; estFill?: number; fee?: number; slippage?: number; expiresAt?: string | undefined; basis?: number;
  reason: string; source: string; live?: boolean | undefined; link?: string | undefined; report?: Report | undefined; status: "pending" | "queued" | "approved" | "rejected" | "expired"; createdAt: string; decidedAt?: string | undefined;
};
export type LogEntry = { id: string; at: string; kind: "proposal" | "approved" | "rejected" | "refused" | "expired" | "monitor" | "agent" | "pause" | "resume" | "reset"; agentId?: string | undefined; message: string };
export type Report = { summary: string; signals?: string[] | undefined; confidence: number; link?: string | undefined; live: boolean; verdict?: "BUY" | "HOLD" | "AVOID" | "SELL" | "NO CALL"; dataGaps?: string[]; reportId?: string; agreeing?: number; chart?: { label: string; points: number[] } | undefined; asset?: string; agent?: string; createdAt?: string; title?: string; evidence?: string[]; counter?: string[]; sources?: { label: string; url: string }[]; labels?: string[] };
export type Msg = { id: string; at: string; role: "user" | "agent" | "system"; agentId?: string | undefined; kind: "text" | "card" | "refusal" | "alert"; text: string; proposalId?: string | undefined; report?: Report | undefined };
export type Monitor = { id: string; name: string; kind: "ipo" | "crypto" | "social" | "asset"; symbol?: string | undefined; cron: string; human: string; nextRun: string; lastRun?: string | undefined; paused: boolean; seen: string[]; hits: number };
export type Desk = { monitors?: Monitor[]; seen?: string[]; watch?: string[]; agents: Agent[]; proposals: Proposal[]; log: LogEntry[]; paused: boolean; messages?: Msg[] };

type Preset = { label: string; strategy: string; universe: string[]; source: string };
export const PRESETS = {
  "x-accounts": { label: "Social Signals", strategy: "Read recent posts from the X accounts you watch, find the asset they talk about, weigh positive vs negative tone, and propose a small entry only when the tone is clearly positive.", universe: ["NVDA", "TSLA", "COIN"], source: "X posts" },
  congress: { label: "Congressional trades", strategy: "Mirror disclosed congressional stock buys (STOCK Act filings) with a small position.", universe: ["MSFT", "AAPL", "LMT"], source: "Simulated congressional filing" },
  ipo: { label: "Stocks & IPOs", strategy: "Track recently priced IPOs (Nasdaq calendar) and SEC S-1/424B filings, check how each trades vs its offer price, and propose a starter position in healthy debuts.", universe: ["RDDT", "ARM", "CRCL"], source: "Simulated IPO filing" },
  crypto: { label: "Crypto", strategy: "Analyze top coins from CoinGecko: 24h/7d/30d change, volume, drawdown from 30-day high, RSI(14) and trend vs 20-day average. Verdict BUY / HOLD / AVOID.", universe: ["BTC", "ETH", "SOL"], source: "LIVE PRICE (CoinGecko)" },
  custom: { label: "Custom", strategy: "", universe: ["SPY", "QQQ", "AMZN"], source: "Simulated rule-based signal" },
} satisfies Record<string, Preset>;
export const getPreset = (k: string): Preset => (PRESETS as Record<string, Preset>)[k] ?? PRESETS.custom;

const BASE: Record<string, number> = { NVDA: 182, TSLA: 248, COIN: 265, MSFT: 418, AAPL: 229, LMT: 472, RDDT: 141, ARM: 158, CRCL: 92, SPY: 571, QQQ: 489, AMZN: 191, BTC: 76000, ETH: 2900, SOL: 180 };
export const CRYPTO = new Set(["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "TON"]);
const LIVE = new Map<string, { price: number; at: number }>();
export function setLivePrice(sym: string, price: number) { LIVE.set(sym.toUpperCase(), { price, at: Date.now() }); }
export function isLive(sym: string) { const l = LIVE.get(sym.toUpperCase()); return !!l && Date.now() - l.at < 10 * 60_000; }

/** SIMULATED price: deterministic wobble around a base, changes every minute. Not market data. */
export function simPrice(asset: string, at = Date.now()): number {
  const live = LIVE.get(asset.toUpperCase());
  if (live && Math.abs(at - Date.now()) < 5000 && Date.now() - live.at < 10 * 60_000) return live.price;
  const base = BASE[asset.toUpperCase()] ?? 100;
  const seed = [...asset].reduce((a, c) => a + c.charCodeAt(0), 0);
  const m = Math.floor(at / 60000);
  const drift = 0.04 * Math.sin((m + seed) / 7) + 0.015 * Math.sin((m * 3 + seed) / 5);
  return Math.round(base * (1 + drift) * 100) / 100;
}

const id = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const now = () => new Date().toISOString();

export function seed(): Desk {
  const t = Date.now();
  const agents: Agent[] = [
    { id: "ag_social", name: "Social Signals", preset: "x-accounts", strategy: PRESETS["x-accounts"].strategy, budget: 1000, maxPerTrade: 500, createdAt: now() },
    { id: "ag_crypto", name: "Crypto", preset: "crypto", strategy: PRESETS.crypto.strategy, budget: 1000, maxPerTrade: 500, createdAt: now() },
    { id: "ag_stocks", name: "Stocks & IPOs", preset: "ipo", strategy: PRESETS.ipo.strategy, budget: 1000, maxPerTrade: 400, createdAt: now() },
  ];

  const p = (agentId: string, asset: string, qty: number, status: Proposal["status"], reason: string, source: string, ago: number): Proposal => {
    const price = simPrice(asset, t - ago * 60000);
    return { id: id("pr"), agentId, asset, side: "buy", qty, price, cost: Math.round(qty * price * 100) / 100, reason, source, status, createdAt: new Date(t - ago * 60000).toISOString(), decidedAt: status === "pending" ? undefined : new Date(t - (ago - 2) * 60000).toISOString() };
  };
  const proposals: Proposal[] = [];

  const log: LogEntry[] = [
    { id: id("lg"), at: now(), kind: "reset", message: "Demo desk seeded with 3 agents (paper trading)." },
  ];
  const d: Desk = { agents, proposals, log, paused: false, messages: [] };
  post(d, { role: "system", kind: "text", text: "Hi, I'm Ric. I run three strategy agents: Social Signals (X accounts you watch), Crypto (CoinGecko) and Stocks & IPOs (Nasdaq calendar + SEC). Each writes a thesis with evidence, counterpoints and sources. Nothing trades until you say yes. Paper money only, not financial advice." });
  const pend = proposals.find((x) => x.status === "pending");
  if (pend) { pend.report = defaultReport(pend); post(d, { role: "agent", agentId: pend.agentId, kind: "card", text: "Proposal ready for your approval.", proposalId: pend.id }); }
  d.watch = ["unusual_whales", "WatcherGuru", "DeItaone", "zerohedge"];
  return d;
}

export async function readDesk(): Promise<Desk> {
  const v = (await getSetting(KEY_())) as unknown as Desk | null;
  if (v?.agents) { const c = structuredClone(v); sweep(c); return c; }
  return writeDesk(() => seed());
}

export async function writeDesk(fn: (d: Desk) => Desk | void | Promise<Desk | void>): Promise<Desk> {
  const out = await mutateSetting(KEY_(), async (cur) => {
    const d: Desk = (cur as unknown as Desk)?.agents ? structuredClone(cur as unknown as Desk) : seed();
    sweep(d);
    const r = (await fn(d)) ?? d;
    sweep(r);
    r.log = r.log.slice(-200);
    r.messages = (r.messages ?? []).slice(-150);
    return r as unknown as Record<string, unknown>;
  });
  await flushReports();
  return out as unknown as Desk;
}

/** Public, shareable briefs live under their own global key so /r/<id> works without login. */
const reportQueue: Report[] = [];
export const lastPublished = { id: "" };
export function publishReport(r: Report, asset?: string, agent?: string) {
  r.reportId ??= "rp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  if (asset) r.asset = asset; if (agent) r.agent = agent; r.createdAt = new Date().toISOString();
  reportQueue.push(r); lastPublished.id = r.reportId; return r.reportId;
}
async function flushReports() { while (reportQueue.length) { const r = reportQueue.shift()!; await putSetting("ric:report:" + r.reportId, r as unknown as Record<string, unknown>); } }
export async function getReport(id: string) { return (await getSetting("ric:report:" + id)) as unknown as Report | null; }

export function resetDesk() { return writeDesk(() => seed()); }

export function post(d: Desk, m: Omit<Msg, "id" | "at">) {
  (d.messages ??= []).push({ id: id("m"), at: now(), ...m });
}

export function defaultReport(p: Proposal): Report {
  return { summary: p.reason, signals: [p.reason, `Sized to ${p.qty} shares (${p.cost.toFixed(2)} USD) to stay inside the cap`, `Price ${p.price.toFixed(2)} USD (simulated)`],
    confidence: p.live ? 0.62 : 0.5, link: p.link, live: !!p.live };
}

export function addLog(d: Desk, kind: LogEntry["kind"], message: string, agentId?: string) {
  d.log.push({ id: id("lg"), at: now(), kind, message, agentId });
}

export const EXPIRY_MS = 5 * 60_000;
export const FEE_RATE = 0.001; // simulated 0.10% fee
export const slipRate = (asset: string) => (CRYPTO.has(asset) ? 0.0015 : 0.0005); // simulated slippage
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Cap use = open buys (approved/pending/queued) minus cost basis released by approved sells. */
export function spent(d: Desk, agentId: string) {
  const buys = d.proposals.filter((p) => p.agentId === agentId && p.side !== "sell" && ["approved", "pending", "queued"].includes(p.status)).reduce((a, p) => a + p.cost, 0);
  const released = d.proposals.filter((p) => p.agentId === agentId && p.side === "sell" && p.status === "approved").reduce((a, p) => a + (p.basis ?? 0), 0);
  return r2(Math.max(0, buys - released));
}

/** Holdings per asset from approved fills (sells reduce). */
export function holdings(d: Desk) {
  const h = new Map<string, { asset: string; qty: number; cost: number; realized: number }>();
  for (const p of d.proposals.filter((x) => x.status === "approved").sort((a, b) => (a.decidedAt ?? "").localeCompare(b.decidedAt ?? ""))) {
    const c = h.get(p.asset) ?? { asset: p.asset, qty: 0, cost: 0, realized: 0 };
    if (p.side === "sell") { const avg = c.qty ? c.cost / c.qty : 0; c.realized += p.cost - avg * p.qty; c.cost -= avg * p.qty; c.qty -= p.qty; }
    else { c.qty += p.qty; c.cost += p.cost; }
    c.qty = Math.round(c.qty * 1e6) / 1e6; h.set(p.asset, c);
  }
  return h;
}
export const heldQty = (d: Desk, asset: string) => holdings(d).get(asset)?.qty ?? 0;
const reservedSell = (d: Desk, asset: string) => d.proposals.filter((p) => p.asset === asset && p.side === "sell" && ["pending", "queued"].includes(p.status)).reduce((a, p) => a + p.qty, 0);

/** Expire stale cards and promote the next queued one. Runs on every read/write. */
export function sweep(d: Desk) {
  const t = Date.now();
  for (const p of d.proposals) if (p.status === "pending" && p.expiresAt && Date.parse(p.expiresAt) < t) {
    p.status = "expired"; p.decidedAt = new Date().toISOString();
    const msg = `Expired: ${p.side.toUpperCase()} ${p.qty} ${p.asset} was not approved within 5 minutes. Budget released.`;
    addLog(d, "expired", msg, p.agentId); post(d, { role: "agent", agentId: p.agentId, kind: "text", text: msg });
  }
  promote(d);
}
function promote(d: Desk) {
  if (d.proposals.some((p) => p.status === "pending")) return;
  const next = d.proposals.find((p) => p.status === "queued");
  if (!next) return;
  next.status = "pending"; next.expiresAt = new Date(Date.now() + EXPIRY_MS).toISOString();
  post(d, { role: "agent", agentId: next.agentId, kind: "card", text: "Next card from the queue.", proposalId: next.id });
}

export type DecideResult = { ok: boolean; message: string; code?: string };
/** Approve or reject. Expired or non-pending cards cannot be approved. */
export function decide(d: Desk, idOrLatest: string | "latest", approve: boolean): DecideResult {
  sweep(d);
  const p = idOrLatest === "latest" ? d.proposals.find((x) => x.status === "pending") : d.proposals.find((x) => x.id === idOrLatest);
  if (!p) return { ok: false, code: "none", message: "There's no pending card to " + (approve ? "approve." : "reject.") };
  if (p.status === "expired") { const m = `REFUSED: that card expired at ${p.expiresAt?.slice(11, 16)} UTC. Ask again for a fresh quote.`; addLog(d, "refused", m, p.agentId); post(d, { role: "agent", agentId: p.agentId, kind: "refusal", text: m }); return { ok: false, code: "expired", message: m }; }
  if (p.status === "queued") return { ok: false, code: "queued", message: "That card is queued. Decide the current card first." };
  if (p.status !== "pending") return { ok: false, code: "decided", message: `Already ${p.status}.` };
  const a = d.agents.find((x) => x.id === p.agentId);
  if (approve && p.side === "sell" && p.qty > heldQty(d, p.asset) + 1e-9) { const m = `REFUSED: you hold only ${heldQty(d, p.asset)} ${p.asset}.`; p.status = "rejected"; post(d, { role: "agent", agentId: p.agentId, kind: "refusal", text: m }); promote(d); return { ok: false, code: "not_held", message: m }; }
  p.status = approve ? "approved" : "rejected"; p.decidedAt = new Date().toISOString();
  if (approve && p.side === "sell") { const h = holdings(d).get(p.asset); p.basis = 0; if (h) { /* basis computed post-approval */ } }
  if (approve && p.side === "sell") { const before = holdings({ ...d, proposals: d.proposals.filter((x) => x.id !== p.id) }).get(p.asset); p.basis = before && before.qty ? r2((before.cost / before.qty) * p.qty) : 0; }
  const msg = approve ? `Approved: ${p.side.toUpperCase()} ${p.qty} ${p.asset} at est. $${(p.estFill ?? p.price).toFixed(2)} for ${a?.name}. Paper fill recorded.` : `Rejected ${p.side} ${p.qty} ${p.asset} for ${a?.name}.${p.side === "buy" ? " Budget released." : ""}`;
  addLog(d, approve ? "approved" : "rejected", msg, p.agentId); post(d, { role: "agent", agentId: p.agentId, kind: "text", text: msg });
  promote(d);
  return { ok: true, message: msg };
}

export type ProposeInput = { report?: Report; agentId: string; asset: string; qty: number; reason: string; source?: string; live?: boolean; link?: string | undefined; basePrice?: number; side?: "buy" | "sell"; fromMonitor?: boolean };
export const tradeMax = (a: Agent) => a.maxPerTrade ?? Math.round(a.budget * 0.5);
export type ProposeResult = { ok: true; proposal: Proposal; remaining: number; queued: boolean } | { ok: false; refused: true; code: string; message: string; requested: number; remaining: number; budget: number };

function refuse(d: Desk, agent: Agent, code: string, msg: string, cost: number, remaining: number): ProposeResult {
  addLog(d, "refused", msg, agent.id); post(d, { role: "agent", agentId: agent.id, kind: "refusal", text: msg });
  return { ok: false, refused: true, code, message: msg, requested: cost, remaining, budget: agent.budget };
}

/** THE GUARD. Code, not the model, decides whether a proposal may exist. */
export function proposeInto(d: Desk, input: ProposeInput): ProposeResult {
  const agent = d.agents.find((a) => a.id === input.agentId || a.name.toLowerCase() === input.agentId.toLowerCase());
  if (!agent) return { ok: false, refused: true, code: "unknown_agent", message: `No agent "${input.agentId}".`, requested: 0, remaining: 0, budget: 0 };
  const side = input.side ?? "buy";
  const asset = input.asset.toUpperCase().trim();
  const remaining = r2(agent.budget - spent(d, agent.id));
  if (input.fromMonitor) return refuse(d, agent, "monitor_cannot_trade", "REFUSED: monitors can only alert. They can never create trades.", 0, remaining);
  const price = input.basePrice ? r2(input.basePrice * simPrice(asset) / (BASE[asset] ?? 100)) : simPrice(asset);
  const qty = CRYPTO.has(asset) ? Math.round(input.qty * 1e6) / 1e6 : input.qty;
  const slip = slipRate(asset);
  const estFill = Math.round(price * (side === "buy" ? 1 + slip : 1 - slip) * 1e4) / 1e4;
  const notional = r2(estFill * qty); const fee = r2(Math.max(0.01, notional * FEE_RATE));
  const cost = side === "buy" ? r2(notional + fee) : r2(notional - fee);
  if (d.paused) return refuse(d, agent, "paused", `REFUSED: Desk is paused. ${agent.name} cannot propose until you resume.`, cost, remaining);
  if (!(qty > 0) || cost <= 0) return refuse(d, agent, "bad_size", "REFUSED: quantity must be positive.", cost, remaining);
  if (side === "sell") {
    const free = Math.round((heldQty(d, asset) - reservedSell(d, asset)) * 1e6) / 1e6;
    if (qty > free + 1e-9) return refuse(d, agent, "not_held", `REFUSED: ${agent.name} asked to sell ${qty} ${asset} but you hold only ${free} ${asset} not already in a sell card. You can't sell what you don't own.`, cost, remaining);
  } else {
    const max = tradeMax(agent);
    if (cost > max && cost <= remaining) return refuse(d, agent, "over_trade_max", `REFUSED: ${agent.name} asked for ${qty} ${asset} ($${cost.toFixed(2)}) but its per-trade maximum is $${max.toFixed(2)}. Enforced by the app, not the AI.`, cost, remaining);
    if (cost > remaining) return refuse(d, agent, "over_cap", `REFUSED: ${agent.name} asked for ${qty} ${asset} ($${cost.toFixed(2)}) but only $${remaining.toFixed(2)} of its $${agent.budget.toFixed(2)} cap is left. The cap is enforced by the app; instructions cannot change it.`, cost, remaining);
  }
  const queued = d.proposals.some((p) => p.status === "pending");
  const proposal: Proposal = { id: id("pr"), agentId: agent.id, asset, side, qty, price, estFill, fee, slippage: slip, cost, reason: input.reason.slice(0, 280), source: input.source ?? "Agent proposal", live: input.live ?? false, link: input.link, status: queued ? "queued" : "pending", expiresAt: queued ? undefined : new Date(Date.now() + EXPIRY_MS).toISOString(), createdAt: now() };
  proposal.report = input.report ?? defaultReport(proposal);
  d.proposals.push(proposal);
  if (queued) post(d, { role: "agent", agentId: agent.id, kind: "text", text: `Queued: ${side.toUpperCase()} ${qty} ${asset} (~$${cost.toFixed(2)}). One approval at a time — it shows up when you decide the current card.` });
  else post(d, { role: "agent", agentId: agent.id, kind: "card", text: "Proposal ready for your approval.", proposalId: proposal.id });
  addLog(d, "proposal", `${agent.name} proposed ${side.toUpperCase()} ${qty} ${asset} @ est. $${estFill} ($${cost.toFixed(2)} incl. $${fee} fee)${queued ? " [queued]" : ""}.`, agent.id);
  return { ok: true, proposal, queued, remaining: side === "buy" ? r2(remaining - cost) : remaining };
}

export function summarize(d: Desk) {
  const at = Date.now();
  const agents = d.agents.map((a) => {
    const used = spent(d, a.id);
    const pending = d.proposals.filter((p) => p.agentId === a.id && (p.status === "pending" || p.status === "queued")).length;
    return { ...a, maxPerTrade: tradeMax(a), used, remaining: Math.round((a.budget - used) * 100) / 100, pending };
  });
  const pos = [...holdings(d).values()].filter((x) => x.qty > 1e-9).map((x) => {
    const last = simPrice(x.asset, at); const value = r2(last * x.qty);
    return { asset: x.asset, qty: x.qty, live: isLive(x.asset), cost: r2(x.cost), avg: r2(x.cost / x.qty), last, value, pnl: r2(value - x.cost) };
  });
  const realized = r2([...holdings(d).values()].reduce((a, x) => a + x.realized, 0));
  const invested = pos.reduce((a, x) => a + x.cost, 0), value = pos.reduce((a, x) => a + x.value, 0);
  return {
    paused: d.paused, agents,
    proposals: [...d.proposals].reverse().slice(0, 50),
    portfolio: { positions: pos, invested: Math.round(invested * 100) / 100, value: Math.round(value * 100) / 100, pnl: r2(value - invested + realized), realized, priceSource: pos.some((x) => isLive(x.asset)) ? "Marked at LIVE prices where available (CoinGecko / Yahoo); others SIMULATED" : "SIMULATED prices (deterministic, not market data)" },
    log: [...d.log].reverse().slice(0, 60),
    messages: (d.messages ?? []).slice(-80),
    allProposals: d.proposals,
    monitors: d.monitors ?? [],
    owner: deskOwner(),
    notice: "Paper trading only. No real money, no brokerage. Not financial advice.",
  };
}
