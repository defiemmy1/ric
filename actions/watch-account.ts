import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { writeDesk } from "../server/ric/desk";

export default defineAction({
  description: "Add an X handle to the Social Signals watch list (without @).",
  schema: z.object({ handle: z.string().regex(/^@?[A-Za-z0-9_]{1,15}$/).describe("X handle, e.g. unusual_whales") }),
  run: async ({ handle }) => {
    const h = handle.replace(/^@/, "");
    const d = await writeDesk((d) => { d.watch = [...new Set([...(d.watch ?? []), h])]; });
    return { watch: d.watch, message: `Watching @${h}.` };
  },
});
