import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { analyzeAsset, deliver } from "../server/ric/research";
import { lastPublished, writeDesk } from "../server/ric/desk";

export default defineAction({
  description: "Analyze one asset (crypto via live CoinGecko, stocks via live Yahoo quote or simulated) and return a research brief: verdict BUY/HOLD/AVOID, confidence, evidence, counterevidence, sources, data labels. post=true also posts it in the Ric thread (BUY creates a pending Approve card through the cap check).",
  schema: z.object({
    symbol: z.string().min(1).max(10).describe("Ticker, e.g. SOL or NVDA"),
    post: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).default(true).describe("Post the brief to the Ric thread; defaults to true"),
  }),
  run: async ({ symbol, post }) => {
    const th = await analyzeAsset(symbol);
    let outcome = "not posted";
    if (post) await writeDesk((d) => { const a = d.agents.find((x) => x.preset === (/^(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|AVAX|LINK|TON)$/i.test(symbol) ? "crypto" : "ipo")) ?? d.agents[0]!; outcome = deliver(d, a, th.asset, th.brief, th.label); });
    return { ...th, outcome, reportId: post ? lastPublished.id : null, reportUrl: post ? `/r/${lastPublished.id}` : null };
  },
});
