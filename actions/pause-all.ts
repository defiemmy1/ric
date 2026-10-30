import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { writeDesk, addLog } from "../server/ric/desk";

export default defineAction({
  description: "Pause (paused=true) or resume (paused=false) every agent at once. While paused, all proposals are refused by the app.",
  schema: z.object({ paused: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).describe("true to pause all agents, false to resume") }),
  run: async ({ paused }) => {
    await writeDesk((d) => { d.paused = paused; addLog(d, paused ? "pause" : "resume", paused ? "All agents paused by user." : "Agents resumed."); });
    return { paused, message: paused ? "All agents paused." : "Agents resumed." };
  },
});
