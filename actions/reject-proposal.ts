import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { decide, writeDesk, type DecideResult } from "../server/ric/desk";

export default defineAction({
  description: "Reject (deny) a pending proposal; its reserved budget is released. An optional reason is fed back to the agent: it is logged, shown on its strategy card, and the agent skips that asset for the rest of the day.",
  schema: z.object({ id: z.string().describe('Proposal id or "latest"'), reason: z.string().max(200).optional().describe("Why the user rejected it") }),
  run: async ({ id, reason }) => {
    let r!: DecideResult;
    await writeDesk((d) => { r = decide(d, id, false, reason); });
    return { id, ...r };
  },
});
