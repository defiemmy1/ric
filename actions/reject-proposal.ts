import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { decide, writeDesk, type DecideResult } from "../server/ric/desk";

export default defineAction({
  description: "Reject a pending proposal; its reserved budget is released.",
  schema: z.object({ id: z.string().describe("Proposal id") }),
  run: async ({ id }) => {
    let r!: DecideResult;
    await writeDesk((d) => { r = decide(d, id, false); });
    return { id, ...r };
  },
});
