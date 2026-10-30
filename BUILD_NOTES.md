# Ric — build notes

Paper-trading desk on Agent-Native. AI agents propose, you decide, and the app keeps the limits.

## Real
- Actions (`actions/*.ts`, shared by UI buttons, chat agent, CLI `pnpm action <name>`, HTTP): get-desk, list-agents, create-agent, propose-trade, run-research, approve-proposal, reject-proposal, pause-all, cap-demo, reset-demo.
- The budget cap is checked in code (`server/ric/desk.ts` `proposeInto`). Pending proposals reserve budget, so an agent can't overspend. Over-cap and paused requests are refused and logged.
- Approve/Reject flow, portfolio P&L math, the activity log, pause-all, in-app toast alerts for new proposals, and agent creation from presets or a custom strategy.
- State is stored in SQL (framework `settings` table, key `ric:desk:v1`, one JSON doc).

- Per-trade maximum (`maxPerTrade`, default is half the cap) is checked in code. Breaking it is refused and logged like a cap refusal.
- **LIVE data:** the IPO preset (IPO Watch) pulls recent 424B4/S-1 filings from SEC EDGAR full-text search (`server/ric/edgar.ts`, with a User-Agent header, cached 10 min). The Approve card shows a green "LIVE SEC EDGAR filing" badge and a link to the filing. If the fetch fails, it falls back to simulated templates labeled "(EDGAR unavailable)".
- The public landing page at `/` (`server/routes/index.get.ts`, auth `publicPaths`). `/home` still needs sign-in.
- An "Auto-run every 60s" toggle runs research on a timer, client-side, only while the tab is open.

## Simulated (labeled in UI)
- Prices (including for live EDGAR tickers, which use a $20 base, or $10 for SPACs): a deterministic wobble around fixed base prices, changing each minute. They are not market data.
- Signals: X accounts, congressional filings and IPO filings are rule-based templates (`run-research`). No live feeds.
- The "ignore your cap" demo is a scripted over-cap request that goes through the same propose-trade guard.

## Needs the model
- Chat with an agent needs the AI model connection (Builder.io sign-in). Everything else works without it.

## Chat-first rebuild (Oct 30)
- `/home` is now a chat (`app/components/ric/ChatDesk.tsx`). The thread is in the middle, with the composer and prompt chips below it. The desk side panel has agents and caps, P&L, Pause/Resume all, the auto-research toggle and the activity log.
- Thread items: user bubbles, agent bubbles labelled by name, inline exact-order Approve cards (buttons, or type yes/no for the latest pending card), red refusal bubbles with the exact app message, and alert bubbles with "Read report". Reports are a research brief modal with summary, signals, confidence, source link and a live/simulated label.
- Messages are stored in the desk doc (`messages`). `proposeInto` posts cards and refusals itself, so every path (buttons, chat, actions, timer) shows up in the thread.
- **Offline demo mode** (default): `send-message` action → `server/ric/brain.ts`, a deterministic interpreter over the same desk functions. It handles research, buy N/$N TICKER [with agent], yes/no, pause/resume, status/P&L, what's X watching, create agent ... watching ..., and "ignore your cap" (goes through the same cap check and is refused). Anything else gets a help reply.
- **Agent mode** (toggle in header): sends the message to the Agent-Native AI chat panel, which uses the same actions. It needs a model connection (Builder.io sign-in) and isn't tested yet. Its text replies show in the AI panel; the cards and alerts it creates show in the Ric thread.
- Sell isn't implemented (Ric replies that it's on the roadmap).

## Plain names + Crypto Watch (Oct 30)
- Seeded agents are now X Accounts, Congress, Crypto Watch and IPO Watch. The internal ids (`ag_xray`, `ag_capitol`, `ag_crypto`, `ag_debut`) are unchanged.
- **Crypto Watch** ($1,000 cap, $500 per-trade max) uses **LIVE** BTC/ETH/SOL data from the CoinGecko public API (`/coins/markets`, giving 24h and 7d change and distance from the all-time high), cached for 60s (`server/ric/coingecko.ts`).
  - It scores a 24h dip or strength, a pullback in a 7d uptrend, and drawdown from the high, then proposes a small dollar entry through the normal cap, per-trade and pending checks.
  - Cards say "LIVE PRICE (CoinGecko)". If the fetch fails it uses clearly labeled simulated prices.
- Crypto supports fractional size (6 decimals). The portfolio marks crypto at the live price when there is one, and stocks stay simulated.
- Chat: "buy $50 SOL" (routes to Crypto Watch), "what's Crypto Watch seeing?", "suggest a crypto trade". "sell" is still roadmap.

## One agent, three strategies (Oct 30, supersedes the names above)
Ric is one chat agent with three strategy agents. Each one writes a thesis shown as a research brief: Verdict, Confidence, Evidence, Counterevidence, Sources, Data labels, "Not financial advice - paper money". Indicators are computed in code from fetched data, and no numbers are invented.

| Agent | Data | Label |
|---|---|---|
| **Social Signals** (`ag_social`) | Recent posts of watched X accounts. Uses the X API when `X_BEARER_TOKEN` is set, otherwise `server/ric/x-snapshot.ts`, 20 real public posts from @unusual_whales, @WatcherGuru, @DeItaone, @zerohedge captured 2026-10-30 ~13:00 UTC. Tone comes from keyword rules in code. "watch @handle" adds an account. | LIVE X / **SNAPSHOT** |
| **Crypto** (`ag_crypto`) | CoinGecko `/coins/markets` (24h/7d/30d, volume) + `/market_chart` 30d daily, giving RSI(14), 20-day SMA trend and drawdown from the 30d high. It compares BTC/ETH/SOL/XRP and returns BUY/HOLD/AVOID. | **LIVE** (falls back to SIMULATED) |
| **Stocks & IPOs** (`ag_stocks`) | Nasdaq public IPO calendar JSON (priced + upcoming), SEC EDGAR S-1/424B full-text search, and the Yahoo Finance chart endpoint (unofficial, free) to compare price vs IPO price. | **LIVE** (falls back to a SNAPSHOT calendar / SIMULATED price) |

- Stock prices are LIVE from Yahoo when the endpoint answers, otherwise SIMULATED. Crypto prices are LIVE from CoinGecko. Portfolio marks use the live price where available.
- Only a BUY verdict creates an Approve card, and it goes through the same cap, per-trade and pending checks. HOLD/AVOID post an alert with "Read report".
- Chat: "should I buy SOL?", "analyze ETH/NVDA", "suggest a crypto trade", "what's Social Signals seeing?", "watch @handle", "upcoming IPOs", "buy $50 SOL", yes/no, pause/resume, "how am I doing?". "sell" is still on the roadmap.
- No demo trades are seeded, so P&L only reflects trades you approve. Research verdicts depend on today's market. During the 2026-10-30 sell-off most came back HOLD/AVOID, so the demo shows a card via "buy $50 SOL".

## Adaam-gap build (Oct 30, 15:00–15:40 Lagos)
**Demo flow:** landing → chat → "Run research" → Read report → "buy $50 SOL" → yes → "Sell half my SOL and buy $40 ETH" (2 cards, queued) → yes, yes → "Monitor SOL every hour" / "Check IPOs at 9 and 4" → click an agent name for its strategy card → "Open shareable public report" (/r/<id>, no login).

- **Brief v2** (`server/ric/market.ts` `finalize`): verdict and confidence come first. Every evidence and counter item is tagged **FACT · source / COMPUTED / OPINION**, and briefs have a Data gaps section. Confidence is **capped by the number of independent agreeing sources** (0→20%, 1→40%, 2→60%, 3+→75%). Mixed signals → **NO CALL** (confidence ≤30%).
- **Order preview v2** (`desk.ts` `proposeInto`/`decide`/`sweep`): simulated est. fill with slippage (0.15% crypto, 0.05% stocks), a simulated 0.10% fee, and a **5-minute expiry** with a live countdown. Expired cards can't be approved (refused and logged).
  - **One pending card at a time.** Later cards are queued and promoted, with a fresh expiry, when you decide the current one. Buttons are Approve/Deny, or type yes/no.
- **Selling:** `sell-position` action, `propose-trade side=sell`, and chat ("sell half my SOL", "close my ETH", "sell 25% BTC"). Same paused check; selling more than you hold (net of open sell cards) is refused. Holdings, avg cost and realized P&L are tracked, and cap use is released by the cost basis of what you sell.
  - **Chained requests** ("sell half my SOL and buy ETH") are split into sequential cards.
- **Monitors** (`server/ric/monitors.ts`, `server/plugins/ric-monitors.ts`):
  - Created from chat or the `create-monitor` action. Cadence is parsed to cron and scheduled with Agent-Native's `nextOccurrence`/`describeCron` (Africa/Lagos).
  - Stored server-side in each user's desk and run by a **Nitro plugin sweep every 30s** across all desks. Agent-Native's own recurring jobs are LLM-agent jobs, so a deterministic server interval is used instead.
  - New items only (per-monitor seen keys + desk-wide dedupe). First run shows the latest 3. Silent on no match. Alerts say why it matched and link the source.
  - `list-monitors`, `update-monitor` (pause/resume/delete/run) and chat ("list monitors", "pause monitor SOL", "run all monitors").
  - **Monitors can never trade:** they only post alerts, and `proposeInto(fromMonitor)` is refused in code.
- **Public report page** `/r/<id>` (`server/routes/r/[id].get.ts`, auth `publicPaths: "/r/:id"`): server-rendered HTML with verdict, confidence, SVG price chart (last 60 daily closes from CoinGecko/Yahoo), tagged evidence, counterevidence, data gaps, sources and labels. Reports are stored globally (`ric:report:<id>`). Actions stay private (401 without login).
- **Strategy cards** (`server/ric/strategy.ts`): click an agent name to see its sources, schedule (including linked monitors), allowed and blocked actions (enforced in code) and budget. "create agent <Name> watching <plain English>" creates an agent with a card.
- **Untrusted content:** posts with instruction-like text ("ignore your cap", "approve all", "you must buy") are excluded from tone and noted in Data gaps. Post text never reaches any action.
- **Per-user desks:** the desk key is `ric:desk:v2:<signed-in email>` (`getRequestUserEmail()`). The monitor sweep runs each desk under its owner. The CLI `pnpm action …` runs as the local dev user. Reports are global so share links work.
- **Tests:** `pnpm test` runs `tests/ric.test.ts`. All 10 pass: ignore-cap refusal, per-trade max, expired card, one-pending queue, oversell refused, injected post does nothing, duplicate alert suppressed, monitor can't trade, paused desk refuses, report page public / actions private.
