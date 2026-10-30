import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { resizeProposal, writeDesk, type DecideResult } from "../server/ric/desk";

export default defineAction({
  description: "Change the size of the current pending card without approving it. Re-checks the per-trade max, daily cap and holdings in code.",
  schema: z.object({ id: z.string().describe('Proposal id or "latest"'), qty: z.coerce.number().positive().optional().describe("New quantity"), usd: z.coerce.number().positive().optional().describe("New size in USD") }),
  run: async ({ id, qty, usd }) => {
    let r!: DecideResult;
    await writeDesk((d) => { r = resizeProposal(d, id, { qty, usd }); });
    return { id, ...r };
  },
});
