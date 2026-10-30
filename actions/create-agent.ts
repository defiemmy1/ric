import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { createAgentInto, writeDesk } from "../server/ric/desk";

export default defineAction({
  description: "Create a paper-trading agent from a plain-English strategy with its own daily cap and per-trade max (USD, paper). The app enforces the cap in code exactly like the built-in agents. Chat equivalent: 'create agent DipBuyer that buys ETH after a 5% drop, $300 cap, $100 per trade'.",
  schema: z.object({
    name: z.string().min(1).max(40).describe("Agent display name"),
    strategy: z.string().min(3).max(400).describe("Plain-English strategy, e.g. 'buy ETH after a 5% daily drop'"),
    budget: z.coerce.number().min(10).max(10000).optional().describe("Daily cap in USD (paper), default 500"),
    maxPerTrade: z.coerce.number().min(1).optional().describe("Per-trade maximum in USD; defaults to half the cap"),
    preset: z.enum(["x-accounts", "congress", "ipo", "crypto", "custom"]).optional().describe("Data source; inferred from the strategy if omitted"),
  }),
  run: async (input) => {
    let r!: ReturnType<typeof createAgentInto>;
    await writeDesk((d) => { r = createAgentInto(d, input); });
    return r.ok ? { id: r.agent.id, message: r.message } : { error: r.message };
  },
});
