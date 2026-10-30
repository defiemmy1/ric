import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { getPreset, writeDesk, addLog } from "../server/ric/desk";

export default defineAction({
  description: 'Create a paper-trading agent. preset: "x-accounts", "congress", "ipo" or "custom" (custom needs a plain-English strategy). budget is the hard cap in USD the app enforces.',
  schema: z.object({
    name: z.string().min(1).max(40).describe("Agent display name"),
    preset: z.enum(["x-accounts", "congress", "ipo", "custom"]).describe('Strategy preset: "x-accounts", "congress", "ipo", or "custom"'),
    strategy: z.string().max(400).optional().describe("Plain-English strategy; required for custom, overrides preset text otherwise"),
    maxPerTrade: z.coerce.number().min(1).optional().describe("Per-trade maximum in USD; defaults to half the budget"),
    budget: z.coerce.number().min(10).max(100000).describe("Hard budget cap in USD (paper money)"),
  }),
  run: async ({ name, preset, strategy, budget, maxPerTrade }) => {
    const id = "ag_" + Date.now().toString(36);
    const text = strategy?.trim() || getPreset(preset).strategy || "Custom rule-based strategy.";
    await writeDesk((d) => {
      d.agents.push({ id, name, preset, strategy: text, budget, maxPerTrade: maxPerTrade ?? Math.round(budget / 2), createdAt: new Date().toISOString() });
      addLog(d, "agent", `Created agent ${name} (${getPreset(preset).label}) with a $${budget} cap.`, id);
    });
    return { id, message: `Created ${name} with a $${budget} cap.` };
  },
});
