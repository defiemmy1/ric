import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { researchRound } from "../server/ric/research";

export default defineAction({
  description: "Run one research round for every agent in parallel (works with no AI model). IPO-preset agents use LIVE SEC EDGAR 424B4/S-1 filings (falls back to simulated); other presets use SIMULATED signals. Prices are simulated. Each agent may produce one sized-to-fit pending proposal. Respects pause and caps.",
  schema: z.object({}),
  run: async () => researchRound(),
});
