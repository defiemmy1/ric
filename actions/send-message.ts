import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { handleMessage } from "../server/ric/brain";

export default defineAction({
  description: "Send a chat message to Ric's offline demo brain (deterministic, no AI model). It posts the user's message and Ric's reply, approval card, refusal or alert into the Ric thread. Understands: run research, buy N TICKER with AGENT, yes/no, pause/resume, status, create agent.",
  schema: z.object({ text: z.string().min(1).max(500).describe("The user's message") }),
  run: async ({ text }) => handleMessage(text),
});
