import { defineNitroPlugin } from "@agent-native/core/server";
import { sweepMonitors } from "../ric/monitors";

/** Server-side monitor schedule: sweep due monitors every 30s (cron cadences are evaluated per monitor). */
export default defineNitroPlugin(() => {
  const g = globalThis as { __ricMonitorTimer?: ReturnType<typeof setInterval> };
  if (g.__ricMonitorTimer) clearInterval(g.__ricMonitorTimer);
  console.log("[ric] monitor sweep armed (30s)");
  g.__ricMonitorTimer = setInterval(() => { void sweepMonitors(); }, 30_000);
});
