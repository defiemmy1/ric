import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { handleMessage } from "../server/ric/brain";
import { post, readDesk, writeDesk } from "../server/ric/desk";

export default defineAction({
  description: "Ric chat thread. mode=record only records the user's message (the AI agent then answers via post-reply and the desk actions). mode=offline runs Ric's deterministic offline interpreter (no AI model) as a fallback: it posts Ric's reply, approval card, refusal or alert, tagged 'offline fallback'.",
  schema: z.object({
    text: z.string().min(1).max(500).describe("The user's message"),
    mode: z.enum(["record", "offline"]).optional().describe("record = log the user message for the AI agent; offline = deterministic fallback interpreter (default)"),
    fallbackReason: z.string().max(120).optional().describe("Why the offline fallback ran, e.g. 'no model connected'"),
    alreadyRecorded: z.coerce.boolean().optional().describe("The user message was already recorded with mode=record"),
  }),
  run: async ({ text, mode, fallbackReason, alreadyRecorded }) => {
    if (mode === "record") { await writeDesk((d) => { post(d, { role: "user", kind: "text", text: text.trim().slice(0, 500) }); }); return { recorded: true }; }
    const before = new Set(((await readDesk()).messages ?? []).map((m) => m.id));
    const r = await handleMessage(text, { skipUserPost: !!alreadyRecorded });
    await writeDesk((d) => { for (const m of d.messages ?? []) if (!before.has(m.id) && m.role !== "user") { m.via = "offline-fallback"; m.note = fallbackReason ?? "no model connected"; } });
    return r;
  },
});
