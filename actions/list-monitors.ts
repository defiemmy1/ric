import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { readDesk } from "../server/ric/desk";

export default defineAction({
  description: "List monitors with id, name, kind, cadence, next run, paused flag and alert count.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => ((await readDesk()).monitors ?? []).map(({ seen, ...m }) => ({ ...m, seenCount: seen.length })),
});
