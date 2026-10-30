import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { writeDesk, addLog, post } from "../server/ric/desk";
import { addMonitor, parseMonitor } from "../server/ric/monitors";

export default defineAction({
  description: 'Create a named monitor from plain English, e.g. "check IPOs at 9 and 4", "monitor SOL every hour", "scan social posts every 30 minutes". Runs server-side on a cron cadence (Africa/Lagos), alerts only on NEW matches with why + links, silent otherwise. Monitors can never trade.',
  schema: z.object({ text: z.string().min(3).max(200).describe("Plain-English monitor request including a cadence (every N minutes/hours, hourly, at 9 and 4)") }),
  run: async ({ text }) => {
    const m = parseMonitor(text);
    if (!m) return { ok: false, message: 'Include what to watch and when, e.g. "monitor SOL every hour".' };
    let id = "", next = "";
    await writeDesk((d) => { const mon = addMonitor(d, m); id = mon.id; next = mon.nextRun; addLog(d, "monitor", `Monitor “${mon.name}” created: ${mon.human}.`); post(d, { role: "system", kind: "text", text: `Monitor “${mon.name}” created: ${mon.human} (Lagos time). Next run ${new Date(next).toLocaleString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}. It alerts only on new matches and can never trade.` }); });
    return { ok: true, id, nextRun: next, ...m };
  },
});
