import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory settings store whose mutateSetting serializes like the real one (one writer at a time per key).
const store = new Map<string, any>();
let chain: Promise<unknown> = Promise.resolve();
vi.mock("@agent-native/core/settings", () => ({
  getSetting: vi.fn(async (k: string) => store.get(k) ?? null),
  putSetting: vi.fn(async (k: string, v: any) => { store.set(k, v); }),
  listSettingsByPrefix: vi.fn(async () => []),
  mutateSetting: vi.fn((k: string, fn: (cur: any) => any) => { const run = chain.then(async () => { const v = await fn(store.get(k) ?? null); store.set(k, structuredClone(v)); return v; }); chain = run.catch(() => null); return run; }),
}));
vi.mock("@agent-native/core/server/request-context", () => ({ getRequestUserEmail: () => "dev@local.test" }));

import { createAgentInto, decide, deskOwner, proposeInto, readDesk, resizeProposal, seed, setLivePrice, spent, summarize, visitorStore, withOwner, writeDesk, type Agent, type Desk } from "../server/ric/desk";
import { deliver } from "../server/ric/research";
import { cryptoSeries, stockSeries, analyze } from "../server/ric/market";
import { ipoCalendar, stocksThesis } from "../server/ric/stocks";

const fresh = (): Desk => { const d = seed(); d.proposals = []; d.messages = []; return d; };
// Price 100 exactly; stock slippage 0.05% → est. fill 100.05; fee 0.10% → 1 share costs 100.15.
const ONE = 100.15;
const tAgent = (budget: number, max: number): Agent => ({ id: "ag_t", name: "Tester", preset: "custom", strategy: "test", budget, maxPerTrade: max, createdAt: new Date().toISOString() });
beforeEach(() => { store.clear(); setLivePrice("TST", 100); setLivePrice("TSB", 100); });

describe("cap edge cases", () => {
  it("a trade exactly at the per-trade max passes; one cent over is refused", () => {
    const d = fresh(); d.agents.push(tAgent(1000, ONE));
    expect(proposeInto(d, { agentId: "ag_t", asset: "TST", qty: 1, reason: "at limit" }).ok).toBe(true);
    const r = proposeInto(d, { agentId: "ag_t", asset: "TST", qty: 1.01, reason: "over" });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe("over_trade_max");
  });
  it("pending and queued cards hold budget; filling the cap exactly then one more is refused", () => {
    const d = fresh(); d.agents.push(tAgent(ONE * 2, 500));
    expect(proposeInto(d, { agentId: "ag_t", asset: "TST", qty: 1, reason: "a" }).ok).toBe(true); // pending
    const b = proposeInto(d, { agentId: "ag_t", asset: "TSB", qty: 1, reason: "b" }); // queued, still held
    expect(b.ok && b.queued).toBe(true);
    expect(spent(d, "ag_t")).toBeCloseTo(ONE * 2, 2);
    const c = proposeInto(d, { agentId: "ag_t", asset: "TST", qty: 0.01, reason: "c" });
    expect(c.ok).toBe(false); if (!c.ok) expect(c.code).toBe("over_cap");
    decide(d, "latest", false, "too risky"); // rejecting releases the hold
    expect(spent(d, "ag_t")).toBeCloseTo(ONE, 2);
  });
  it("each agent's cap is independent", () => {
    const d = fresh(); d.agents.push(tAgent(ONE, 500));
    expect(proposeInto(d, { agentId: "ag_t", asset: "TST", qty: 1, reason: "a" }).ok).toBe(true);
    decide(d, "latest", true);
    expect(proposeInto(d, { agentId: "ag_t", asset: "TST", qty: 1, reason: "b" }).ok).toBe(false);
    expect(proposeInto(d, { agentId: "ag_social", asset: "TST", qty: 1, reason: "other agent" }).ok).toBe(true);
    expect(spent(d, "ag_social")).toBeCloseTo(ONE, 2);
  });
  it("an approved sell releases cap by its cost basis; yesterday's fills don't count against today's daily cap", () => {
    const d = fresh(); d.agents.push(tAgent(ONE, 500));
    proposeInto(d, { agentId: "ag_t", asset: "TST", qty: 1, reason: "a" }); decide(d, "latest", true);
    proposeInto(d, { agentId: "ag_t", side: "sell", asset: "TST", qty: 1, reason: "exit" }); decide(d, "latest", true);
    expect(spent(d, "ag_t")).toBe(0);
    const old = new Date(Date.now() - 2 * 86400_000).toISOString();
    for (const p of d.proposals) { p.createdAt = old; p.decidedAt = old; }
    proposeInto(d, { agentId: "ag_t", asset: "TST", qty: 1, reason: "b" }); decide(d, "latest", true);
    for (const p of d.proposals.filter((x) => x.decidedAt !== old)) { p.createdAt = old; p.decidedAt = old; }
    expect(spent(d, "ag_t")).toBe(0); // new day
  });
  it("concurrent approvals of the same card fill once", async () => {
    await withOwner("conc", async () => {
      let id = ""; await writeDesk((d) => { const r = proposeInto(d, { agentId: "ag_crypto", asset: "TST", qty: 1, reason: "x" }); if (r.ok) id = r.proposal.id; });
      const rs: boolean[] = [];
      await Promise.all([1, 2, 3].map(() => writeDesk((d) => { rs.push(decide(d, id, true).ok); })));
      expect(rs.filter(Boolean)).toHaveLength(1);
      const d = await readDesk(); expect(d.proposals.filter((p) => p.status === "approved")).toHaveLength(1);
    });
  });
  it("concurrent proposals can't jointly exceed the cap", async () => {
    await withOwner("conc2", async () => {
      await writeDesk((d) => { d.agents.push(tAgent(ONE * 1.5, 500)); });
      await Promise.all([1, 2].map(() => writeDesk((d) => { proposeInto(d, { agentId: "ag_t", asset: "TST", qty: 1, reason: "race" }); })));
      const d = await readDesk(); expect(d.proposals.filter((p) => p.agentId === "ag_t")).toHaveLength(1);
    });
  });
});

describe("edit size and rejection feedback", () => {
  it("resizing re-runs the cap check and updates the card", () => {
    const d = fresh(); d.agents.push(tAgent(1000, 300));
    proposeInto(d, { agentId: "ag_t", asset: "TST", qty: 1, reason: "a" });
    expect(resizeProposal(d, "latest", { usd: 1000 }).code).toBe("over_trade_max");
    const ok = resizeProposal(d, "latest", { qty: 2 }); expect(ok.ok).toBe(true);
    expect(d.proposals[0]!.qty).toBe(2); expect(d.proposals[0]!.cost).toBeCloseTo(200.3, 1);
    expect(decide(d, "latest", true).ok).toBe(true);
  });
  it("a rejection reason is logged, stored on the agent, and the agent skips that asset today", () => {
    const d = fresh();
    proposeInto(d, { agentId: "ag_crypto", asset: "TST", qty: 1, reason: "a" });
    decide(d, "latest", false, "too volatile this week");
    expect(d.log.at(-1)!.message).toMatch(/too volatile/);
    expect(d.agents.find((a) => a.id === "ag_crypto")!.feedback![0]!.reason).toBe("too volatile this week");
    const out = deliver(d, d.agents.find((a) => a.id === "ag_crypto")!, "TST", { verdict: "BUY", confidence: 0.5, summary: "s", evidence: ["e"], counter: [], dataGaps: [], sources: [], labels: [], agreeing: 1, title: "t" } as never, "LIVE");
    expect(out).toMatch(/skipped/); expect(d.proposals.filter((p) => p.status === "pending")).toHaveLength(0);
  });
});

describe("user-created agents", () => {
  it("creates an agent from plain English with its own cap, enforced by the same guard", () => {
    const d = fresh();
    const r = createAgentInto(d, { name: "DipBuyer", strategy: "buy ETH after a 5% drop", budget: 150, maxPerTrade: 120 });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.agent.preset).toBe("crypto"); expect(r.agent.custom).toBe(true);
    const over = proposeInto(d, { agentId: "DipBuyer", asset: "TST", qty: 1.3, reason: "x" });
    expect(over.ok).toBe(false); if (!over.ok) expect(over.code).toBe("over_trade_max");
    expect(createAgentInto(d, { name: "dipbuyer", strategy: "dup" }).ok).toBe(false);
    expect(createAgentInto(d, { name: "Big", strategy: "x y", budget: 50, maxPerTrade: 80 }).ok).toBe(false);
  });
});

describe("per-visitor desks and reset", () => {
  it("two browser cookies on the shared dev account get separate desks", async () => {
    expect(visitorStore.run("aaa", () => deskOwner())).toBe("visitor:aaa");
    await visitorStore.run("aaa", () => writeDesk((d) => { proposeInto(d, { agentId: "ag_crypto", asset: "TST", qty: 1, reason: "mine" }); }));
    const a = await visitorStore.run("aaa", () => readDesk()); const b = await visitorStore.run("bbb", () => readDesk());
    expect(a.proposals).toHaveLength(1); expect(b.proposals).toHaveLength(0);
    const { resetDesk } = await import("../server/ric/desk");
    const r = await visitorStore.run("aaa", () => resetDesk());
    expect(r.proposals).toHaveLength(0); expect(r.agents.map((x) => x.id)).toEqual(["ag_social", "ag_crypto", "ag_stocks"]);
  });
  it("dashboard summary reports used, held and remaining per agent", () => {
    const d = fresh(); d.agents.push(tAgent(1000, 500));
    proposeInto(d, { agentId: "ag_t", asset: "TST", qty: 1, reason: "a" });
    const a = summarize(d).agents.find((x) => x.id === "ag_t")!;
    expect(a.held).toBeCloseTo(ONE, 2); expect(a.remaining).toBeCloseTo(1000 - ONE, 2); expect(a.capPeriod).toMatch(/daily/);
  });
});

describe("data fallbacks are labelled", () => {
  it("CoinGecko, Yahoo and Nasdaq failures fall back to SIMULATED / SNAPSHOT labels", async () => {
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => { throw new Error("offline"); }) as never;
    try {
      const c = await cryptoSeries("ADA"); expect(c.live).toBe(false); expect(c.source).toMatch(/SIMULATED/);
      const s = await stockSeries("ZZZT"); expect(s.live).toBe(false); expect(s.source).toMatch(/SIMULATED/);
      const b = analyze(s); expect(b.labels.join(" ")).toMatch(/SIMULATED/); expect(b.dataGaps.join(" ")).toMatch(/SIMULATED/);
      const cal = await ipoCalendar(); expect(cal.live).toBe(false); expect(cal.rows[0]!.company).toMatch(/snapshot/i);
      const t = await stocksThesis(); expect(t.brief.labels.join(" ")).toMatch(/SNAPSHOT|SIMULATED/);
    } finally { globalThis.fetch = real; }
  });
});
