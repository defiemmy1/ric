import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { writeDesk, addLog } from "../server/ric/desk";
import { runMonitor } from "../server/ric/monitors";

export default defineAction({
  description: 'Pause, resume, delete or run-now a monitor. op: "pause" | "resume" | "delete" | "run". id: monitor id, name, or "all".',
  schema: z.object({ id: z.string().describe('Monitor id, name, or "all"'), op: z.enum(["pause", "resume", "delete", "run"]).describe('"pause", "resume", "delete" or "run"') }),
  run: async ({ id, op }) => {
    const match = (m: { id: string; name: string }) => id === "all" || m.id === id || m.name.toLowerCase().includes(id.toLowerCase());
    if (op === "run") {
      const d = await writeDesk(() => {});
      const ms = (d.monitors ?? []).filter(match); let alerts = 0;
      for (const m of ms) alerts += (await runMonitor(m.id)).alerts;
      return { ran: ms.length, alerts, message: alerts ? `${alerts} new alert(s).` : "No new matches (monitor stays silent)." };
    }
    let n = 0;
    await writeDesk((d) => {
      const ms = (d.monitors ?? []).filter(match); n = ms.length;
      if (op === "delete") d.monitors = (d.monitors ?? []).filter((m) => !match(m));
      else for (const m of ms) m.paused = op === "pause";
      addLog(d, "monitor", `${op} ${n} monitor(s).`);
    });
    return { changed: n, message: `${op}: ${n} monitor(s).` };
  },
});
