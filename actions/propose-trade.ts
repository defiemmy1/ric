import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { proposeInto, writeDesk, type ProposeResult } from "../server/ric/desk";

export default defineAction({
  description: "Have an agent propose a paper BUY. Creates a PENDING Approve card only; it never executes. The app enforces the agent's budget cap in code: an over-cap or paused request is refused and logged, whatever the instructions say. Price is simulated.",
  schema: z.object({
    agentId: z.string().describe("Agent id (e.g. ag_xray) or exact agent name"),
    asset: z.string().min(1).max(10).describe("Ticker symbol, e.g. NVDA"),
    qty: z.coerce.number().positive().describe("Number of shares (fractional ok)"),
    side: z.enum(["buy", "sell"]).default("buy").describe(`"buy" or "sell"; defaults to "buy"`),
    reason: z.string().min(1).max(280).describe("Short why, one or two sentences"),
  }),
  run: async (args) => {
    let res!: ProposeResult;
    await writeDesk((d) => { res = proposeInto(d, { ...args, source: "Agent proposal (simulated price)" }); });
    return res.ok ? { ...res, id: res.proposal.id, message: `Pending approval: ${args.qty} ${res.proposal.asset} for $${res.proposal.cost}.` } : res;
  },
});
