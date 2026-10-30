import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { decide, resizeProposal, writeDesk, type DecideResult } from "../server/ric/desk";

export default defineAction({
  description: "Approve the current pending card (expired or queued cards are refused) so it fills in the paper portfolio. Optional qty or usd edits the size first; the new size goes through the same cap checks. The Approve button and typing 'yes' both call this. Only the user should approve; the agent must not call this unless the user explicitly says to approve that proposal.",
  schema: z.object({
    id: z.string().describe('Proposal id, or "latest" for the current pending card'),
    qty: z.coerce.number().positive().optional().describe("Edited quantity before approving"),
    usd: z.coerce.number().positive().optional().describe("Edited size in USD before approving"),
  }),
  run: async ({ id, qty, usd }) => {
    let r!: DecideResult;
    await writeDesk((d) => {
      if (qty || usd) { const s = resizeProposal(d, id, { qty, usd }); if (!s.ok) { r = s; return; } }
      r = decide(d, id, true);
    });
    return { id, ...r };
  },
});
