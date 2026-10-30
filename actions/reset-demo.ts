import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { resetDesk } from "../server/ric/desk";

export default defineAction({
  description: "Reset the Ric desk to the seeded demo state (3 agents, sample proposals). Destroys current paper data; only call when the user asks.",
  schema: z.object({}),
  run: async () => { await resetDesk(); return { message: "Demo desk reset." }; },
});
