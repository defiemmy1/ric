import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { readDesk, summarize } from "../server/ric/desk";
import { strategyCard } from "../server/ric/strategy";
import { coinMarkets } from "../server/ric/market";

export default defineAction({
  description: "Read the whole Ric paper-trading desk: agents with budget cap/used/remaining, recent proposals (pending/approved/rejected), simulated portfolio with P&L, paused flag, and the activity log.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => { let quotes: any[] = [], err: string | null = null;
    try { quotes = (await coinMarkets()).filter((x: any) => ["BTC", "ETH", "SOL"].includes(x.symbol)); } catch (e) { err = (e as Error).message; }
    const d = await readDesk();
    const sum = summarize(d);
    return { ...sum, agents: sum.agents.map((a) => ({ ...a, card: strategyCard(a, d) })), watch: d.watch ?? [], crypto: { quotes, live: !err, error: err } }; },
});
