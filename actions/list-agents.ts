import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { readDesk, summarize } from "../server/ric/desk";

export default defineAction({
  description: "List Ric trading agents with id, name, preset, strategy, budget cap, used, remaining and pending proposal count.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => summarize(await readDesk()).agents,
});
