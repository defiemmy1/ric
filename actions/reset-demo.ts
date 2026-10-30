import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { resetDesk } from "../server/ric/desk";

export default defineAction({
  description: "Reset THIS visitor's Ric desk to the starting state (3 agents, no trades, no monitors). Other visitors' desks are untouched. Only call when the user asks.",
  schema: z.object({}),
  run: async () => { await resetDesk(); return { message: "Demo desk reset to the starting state." }; },
});
