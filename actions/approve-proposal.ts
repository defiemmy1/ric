import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { decide, writeDesk, type DecideResult } from "../server/ric/desk";

export default defineAction({
  description: "Approve the current pending card (expired or queued cards are refused) so it fills in the paper portfolio. Only the user should approve; the agent must not call this unless the user explicitly says to approve that proposal.",
  schema: z.object({ id: z.string().describe("Proposal id") }),
  run: async ({ id }) => {
    let r!: DecideResult;
    await writeDesk((d) => { r = decide(d, id, true); });
    return { id, ...r };
  },
});
