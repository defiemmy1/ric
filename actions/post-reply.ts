import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { post, writeDesk } from "../server/ric/desk";

export default defineAction({
  description: "Post Ric's answer into the Ric chat thread on /home. Call this once at the end of every turn that started with [Ric desk], with your reply in plain text (cards, refusals and alerts from other actions appear automatically). Never claim a trade executed unless approve-proposal returned ok.",
  schema: z.object({ text: z.string().min(1).max(4000).describe("Ric's reply to show in the thread") }),
  run: async ({ text }) => { await writeDesk((d) => { post(d, { role: "system", kind: "text", text: text.trim(), via: "agent" }); }); return { posted: true }; },
});
