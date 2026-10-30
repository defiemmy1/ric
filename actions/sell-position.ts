import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { heldQty, proposeInto, writeDesk, type ProposeResult } from "../server/ric/desk";

export default defineAction({
  description: "Propose a paper SELL (or close) of a held position. Creates a pending/queued Approve card; never executes by itself. Refused if you sell more than you hold or the desk is paused. fraction=1 closes the position.",
  schema: z.object({
    asset: z.string().min(1).max(10).describe("Ticker, e.g. SOL"),
    qty: z.coerce.number().positive().optional().describe("Units to sell; omit to use fraction"),
    fraction: z.coerce.number().min(0.01).max(1).optional().describe("Share of the position to sell (1 = close); used when qty is omitted, defaults to 1"),
    agentId: z.string().optional().describe("Agent id or name; defaults to the agent that bought it"),
    reason: z.string().max(280).default("Sell requested").describe("Short why"),
  }),
  run: async ({ asset, qty, fraction, agentId, reason }) => {
    let res!: ProposeResult;
    await writeDesk((d) => {
      const A = asset.toUpperCase();
      const q = qty ?? Math.round(heldQty(d, A) * (fraction ?? 1) * 1e6) / 1e6;
      const owner = agentId ?? d.proposals.find((p) => p.asset === A && p.side === "buy" && p.status === "approved")?.agentId ?? d.agents[0]!.id;
      res = proposeInto(d, { side: "sell", agentId: owner, asset: A, qty: q || 0, reason });
    });
    return res;
  },
});
