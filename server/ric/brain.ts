/** Offline demo brain: a deterministic command interpreter over the same desk functions the actions use. */
import { addLog, resetDesk, createAgentInto, resizeProposal, decide, heldQty, getPreset, post, proposeInto, simPrice, summarize, writeDesk, type Desk } from "./desk";
import { analyzeAsset, deliver, researchRound, thesisFor, toReport as deliverReport } from "./research";
import { CRYPTO, isLive, readDesk } from "./desk";
import { coinMarkets, cryptoSeries, stockSeries } from "./market";
import { upcomingIpos } from "./stocks";
import { addMonitor, parseMonitor, runMonitor } from "./monitors";

const HELP = `I'm Ric. I run three strategy agents: Social Signals, Crypto and Stocks & IPOs. Try:
• "Run research on my agents" (each agent writes a thesis)
• "Should I buy SOL?" / "Analyze ETH" / "Analyze NVDA"
• "Suggest a crypto trade"
• "What's Social Signals seeing?" / "Watch @handle"
• "Upcoming IPOs"
• "Buy 3 NVDA with Social Signals" or "Buy $50 SOL"
• "yes" / "no" for the latest card · "Pause all" / "Resume" · "How am I doing?"
• "Sell half my SOL and buy ETH" (split into cards) · "Close my SOL"
• "Monitor SOL every hour" · "Check IPOs at 9 and 4" · "List monitors"`;

const say = (d: Desk, text: string, agentId?: string) => post(d, { role: agentId ? "agent" : "system", agentId, kind: "text", text });
function tradeClause(d: Desk, c: string, full: string) {
  const low = c.toLowerCase();
  const named = findAgent(d, c) ?? findAgent(d, full);
  const sym = (c.match(/\b(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|AVAX|LINK|TON)\b/i)?.[1] ?? c.match(/\$([A-Za-z]{1,6})\b/)?.[1] ?? c.match(/\b(?:buy|sell|close|get|purchase|long)\b(?:\s+(?:my|all|half|of|\$?[\d.,]+k?|shares?|worth|position|in))*\s+([A-Za-z]{1,6})\b/i)?.[1] ?? "NVDA").toUpperCase();
  const isSell = /\b(sell|close|exit|dump)\b/.test(low);
  const amt = c.match(/\$\s?([\d,.]+)(k?)/i); const num = c.match(/\b(\d+(?:\.\d+)?)\b(?!\s*%)/);
  const pctM = c.match(/(\d+(?:\.\d+)?)\s*%/);
  const price = simPrice(sym);
  const live = isLive(sym);
  const source = live ? (CRYPTO.has(sym) ? "LIVE PRICE (CoinGecko)" : "LIVE PRICE (Yahoo Finance)") : "Chat request (simulated price)";
  const round = (q: number) => (CRYPTO.has(sym) ? Math.round(q * 1e6) / 1e6 : Math.floor(q));
  if (isSell) {
    const held = heldQty(d, sym);
    let qty = /\b(all|close|everything|entire)\b/.test(low) ? held : /\bhalf\b/.test(low) ? held / 2 : pctM ? (held * parseFloat(pctM[1]!)) / 100 : amt ? (parseFloat(amt[1]!.replace(/,/g, "")) * (amt[2] ? 1000 : 1)) / price : num ? parseFloat(num[1]!) : held;
    qty = round(qty) || qty;
    const owner = d.proposals.find((p) => p.asset === sym && p.side === "buy" && p.status === "approved")?.agentId;
    const agent = named ?? d.agents.find((x) => x.id === owner) ?? (CRYPTO.has(sym) ? d.agents.find((x) => x.preset === "crypto") : d.agents.find((x) => x.preset === "ipo")) ?? d.agents[0]!;
    proposeInto(d, { side: "sell", agentId: agent.id, asset: sym, qty, reason: `Requested in chat: "${c.slice(0, 100)}"`, source, live });
    return;
  }
  const agent = named ?? (CRYPTO.has(sym) ? d.agents.find((x) => x.preset === "crypto") : d.agents.find((x) => x.preset === "ipo")) ?? d.agents[0]!;
  let qty = amt ? round((parseFloat(amt[1]!.replace(/,/g, "")) * (amt[2] ? 1000 : 1)) / price) || (CRYPTO.has(sym) ? 0 : 1) : num ? parseFloat(num[1]!) : 0;
  if (!qty) qty = Math.ceil((agent.budget * 5) / price);
  if (/ignore (your|the|its) (cap|limit)/i.test(full)) say(d, "You asked me to ignore my cap. I'll submit it, but the app checks every order in code.", agent.id);
  proposeInto(d, { agentId: agent.id, asset: sym, qty, reason: `Requested in chat: "${c.slice(0, 100)}"`, source, live });
}

const findAgent = (d: Desk, t: string) => d.agents.find((a) => new RegExp(`\\b${a.name.replace(/[^a-z0-9]/gi, ".?")}\\b`, "i").test(t));

function createFromText(d: Desk, t: string): boolean {
    const create = t.match(/create (?:an? )?(?:new )?agent (?:called |named )?["“]?([\w][\w &-]{0,30}?)["”]?(?:,| that| which| to| watching| for| with strategy:?|:)\s+(.+)/i);
    if (create) {
      let rest = create[2]!;
      const capM = rest.match(/\$\s?([\d,]+)\s*(?:daily |a day |per day )?(?:cap|budget|limit)|(?:cap|budget|limit)(?: of)?\s*\$\s?([\d,]+)/i);
      const maxM = rest.match(/\$\s?([\d,]+)\s*(?:max )?per[- ]trade|(?:max|maximum)\s*(?:of\s*)?\$\s?([\d,]+)/i);
      const num = (m: RegExpMatchArray | null) => (m ? Number((m[1] ?? m[2])!.replace(/,/g, "")) : undefined);
      rest = rest.replace(capM?.[0] ?? "\u0000", "").replace(maxM?.[0] ?? "\u0000", "").replace(/\s*(,|and|with)\s*(,|and|with)?\s*$/i, "").replace(/\s+(with|and)\s*$/i, "").trim();
      const r = createAgentInto(d, { name: create[1]!.trim(), strategy: rest, budget: num(capM), maxPerTrade: num(maxM) });
      say(d, r.ok ? r.message + ' Click its name for the strategy card, or say "run research".' : r.message, r.ok ? r.agent.id : undefined);
      return true;
    }
    return false;
}

export async function handleMessage(text: string) {
  const t = text.trim();
  await writeDesk((d) => { post(d, { role: "user", kind: "text", text: t.slice(0, 500) }); });
  const low = t.toLowerCase();
  if (/^(reset|reset (the )?(demo|desk)|start over)\b/.test(low)) { await resetDesk(); return { handled: "reset" }; }
  if (/\bcreate (an? )?(new )?agent\b/i.test(t)) {
    await writeDesk((d) => { if (!createFromText(d, t)) say(d, 'Try: create agent DipBuyer that buys ETH after a 5% drop, $300 cap, $100 per trade'); });
    return { handled: "create" };
  }

  if (/\b(research|scan|look for|find (me )?trades)\b/.test(low) && !/(every|hourly|daily|at \d)/.test(low)) {
    const r = await researchRound();
    await writeDesk((d) => say(d, `Research round done. ${r.results.map((x) => `${x.agent}: ${x.outcome}`).join(" · ")}. Tap "Read report" on any alert for the full brief.`));
    return { handled: "research" };
  }
  if (/\b(list|show|my)\s+monitors?\b|^monitors\??$/.test(low)) {
    await writeDesk((d) => say(d, (d.monitors ?? []).length ? `Your monitors:\n${d.monitors!.map((m) => `• ${m.name} — ${m.human}${m.paused ? " (PAUSED)" : `, next ${new Date(m.nextRun).toLocaleString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })} Lagos`} · ${m.hits} alert(s)`).join("\n")}\nMonitors only alert; they can never trade.` : 'No monitors yet. Try "monitor SOL every hour" or "check IPOs at 9 and 4".'));
    return { handled: "monitors" };
  }
  const mop = low.match(/\b(pause|resume|delete|remove|run|stop)\s+(?:the\s+)?(?:(all)\s+)?monitors?\s*(.*)$/) ?? low.match(/\b(pause|resume|delete|remove|run)\s+(?:the\s+)?(.+?)\s+monitor\b/);
  if (mop) {
    const op = mop[1] === "remove" ? "delete" : mop[1] === "stop" ? "pause" : mop[1]!;
    const target = (mop[2] ?? mop[3] ?? "").trim() || "all";
    const match = (m: { name: string }) => target === "all" || m.name.toLowerCase().includes(target.toLowerCase());
    if (op === "run") {
      const ms = ((await readDesk()).monitors ?? []).filter(match); let n = 0;
      for (const m of ms) n += (await runMonitor(m.id)).alerts;
      await writeDesk((d) => say(d, n ? `Ran ${ms.length} monitor(s): ${n} new alert(s) above.` : `Ran ${ms.length} monitor(s): nothing new matched, so they stay silent.`));
      return { handled: "monitor-run" };
    }
    await writeDesk((d) => { const ms = (d.monitors ?? []).filter(match); if (op === "delete") d.monitors = (d.monitors ?? []).filter((m) => !match(m)); else ms.forEach((m) => (m.paused = op === "pause")); say(d, `${op === "delete" ? "Deleted" : op === "pause" ? "Paused" : "Resumed"} ${ms.length} monitor(s).`); });
    return { handled: "monitor-op" };
  }
  const pm = parseMonitor(t);
  if (pm) {
    let monId = "";
    await writeDesk((d) => { const m = addMonitor(d, pm); monId = m.id; addLog(d, "monitor", `Monitor “${m.name}” created: ${m.human}.`); say(d, `Monitor “${m.name}” created: ${m.human} (Lagos time). Next run ${new Date(m.nextRun).toLocaleString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}. It alerts only on new matches, stays silent otherwise, and can never trade. Running a first check now…`); });
    const r = await runMonitor(monId);
    if (!r.alerts) await writeDesk((d) => say(d, `First check done: nothing matched (${r.checked} item(s) looked at). I'll stay quiet until something new matches.`));
    return { handled: "monitor-create" };
  }
  const agentOf = (d: Desk, preset: string) => d.agents.find((x) => x.preset === preset);
  const w = t.match(/\b(?:watch|follow|add)\s+@?([A-Za-z0-9_]{1,15})\b/i);
  if (w && /@|watch @|follow/i.test(t)) {
    await writeDesk((d) => {
      const h = w[1]!; d.watch = [...new Set([...(d.watch ?? []), h])];
      const live = !!process.env.X_BEARER_TOKEN; // guard:allow-env-credential — app-wide read-only X API key set by the deployer, not per-user
      say(d, `Social Signals now watches @${h}. Watching: ${d.watch.map((x) => "@" + x).join(", ")}. ${live ? "Live X API is on." : "No X_BEARER_TOKEN is set, so I use a labeled snapshot of real posts; new handles show posts only once live X is connected."}`, agentOf(d, "x-accounts")?.id);
    });
    return { handled: "watch" };
  }
  const an = t.match(/\b(?:should i (?:buy|get)|analy[sz]e|thoughts on|what about|look at)\s+\$?([A-Za-z]{1,6})\b/i);
  const sug = /suggest (a |me a )?crypto|crypto (trade|idea)/.test(low);
  if (an || sug) {
    const d0 = await readDesk();
    const sym = an?.[1]!.toUpperCase();
    const a = sym ? (CRYPTO.has(sym) ? agentOf(d0, "crypto") : agentOf(d0, "ipo")) : agentOf(d0, "crypto");
    if (!a) { await writeDesk((d) => say(d, "No matching agent. Create one first.")); return { handled: "none" }; }
    const th = sym ? await analyzeAsset(sym) : await thesisFor(a, d0);
    await writeDesk((d) => { const ag = d.agents.find((x) => x.id === a.id)!; deliver(d, ag, th.asset, th.brief, th.label); });
    return { handled: "analyze" };
  }
  if (/upcoming ipos?|ipo calendar|new ipos?/.test(low)) {
    const u = await upcomingIpos();
    await writeDesk((d) => say(d, `${u.live ? "LIVE Nasdaq IPO calendar" : "SNAPSHOT IPO calendar"}, upcoming:\n${u.rows.slice(0, 6).map((r) => `• ${r.company} (${r.ticker}) ~${r.date} at $${r.price || "?"}, ${r.offer}`).join("\n") || "none listed"}\nUpcoming deals can't be bought until they list; Stocks & IPOs proposes after pricing.`, agentOf(d, "ipo")?.id));
    return { handled: "ipos" };
  }
  if (/(social signals?|crypto|stocks)/.test(low) && /(seeing|watching|see|doing|looking)/.test(low)) {
    const d0 = await readDesk();
    const a = /social/.test(low) ? agentOf(d0, "x-accounts") : /crypto/.test(low) ? agentOf(d0, "crypto") : agentOf(d0, "ipo");
    if (a) {
      if (a.preset === "crypto") {
        let lines = "";
        try { lines = (await coinMarkets()).slice(0, 6).map((x: any) => `• ${x.symbol} $${x.price.toLocaleString()} · 24h ${x.ch24.toFixed(1)}% · 7d ${x.ch7d.toFixed(1)}% · 30d ${x.ch30d.toFixed(1)}%`).join("\n"); lines = "LIVE from CoinGecko:\n" + lines; } catch { lines = "CoinGecko is unreachable right now (no numbers shown rather than invented ones)."; }
        await writeDesk((d) => say(d, `${lines}\nSay "analyze SOL" or "suggest a crypto trade" for a full brief.`, a.id));
      } else {
        const th = await thesisFor(a, d0);
        await writeDesk((d) => { const ag = d.agents.find((x) => x.id === a.id)!; post(d, { role: "agent", agentId: ag.id, kind: "alert", text: `${ag.name} is watching ${a.preset === "x-accounts" ? (d.watch ?? []).map((x) => "@" + x).join(", ") : "the Nasdaq IPO calendar and SEC filings"}. Current read: ${th.brief.verdict}${th.asset ? " " + th.asset : ""} (${Math.round(th.brief.confidence * 100)}%).`, report: (deliverReport(th.brief)) }); });
      }
      return { handled: "agent-status" };
    }
  }
  if (/\b(buy|sell|close|purchase)\b/.test(low)) {
    const syms = new Set((t.match(/\$?\b[A-Za-z]{2,6}\b/g) ?? []).map((x) => x.replace("$", "").toUpperCase()).filter((x) => CRYPTO.has(x) || /^[A-Z]{2,5}$/.test(x) && t.includes(x)));
    await Promise.all([...syms].slice(0, 4).map((S) => (CRYPTO.has(S) ? cryptoSeries(S) : stockSeries(S)).catch(() => null)));
  }

  let handled = "help";
  await writeDesk((d) => {
    if (/^(yes|y|yep|approve|ok|okay|confirm|do it|go)\b/.test(low)) { handled = "approve"; const r = decide(d, "latest", true); if (!r.ok && r.code !== "expired") say(d, r.message); return; }
    if (/^(no|n|nope|reject|deny|cancel|skip)\b/.test(low)) { handled = "reject"; const why = t.replace(/^\s*(no|n|nope|reject|deny|cancel|skip)\b[\s,.:;-]*(because|since|reason:?)?\s*/i, "").trim(); const r = decide(d, "latest", false, why || undefined); if (!r.ok) say(d, r.message); return; }
    const rs = low.match(/^(?:resize|make it|change (?:the )?size to|change it to|size)\s*(?:to\s*)?(\$)?\s*([\d.]+)/);
    if (rs) { handled = "resize"; const v = Number(rs[2]); const r = resizeProposal(d, "latest", rs[1] ? { usd: v } : { qty: v }); if (r.ok) { say(d, r.message); const p = d.proposals.find((x) => x.status === "pending"); if (p) post(d, { role: "agent", agentId: p.agentId, kind: "card", text: "Updated card.", proposalId: p.id }); } else if (r.code === "none") say(d, r.message); return; }
    const creating = /\bcreate (an? )?(new )?agent\b/i.test(t);
    if (!creating && /\b(resume|unpause|restart)\b/.test(low)) { handled = "resume"; d.paused = false; addLog(d, "resume", "Agents resumed."); return say(d, "Agents resumed. They can propose again."); }
    if (!creating && /\b(pause|stop|halt|freeze)\b/.test(low)) { handled = "pause"; d.paused = true; addLog(d, "pause", "All agents paused by user."); return say(d, "All agents paused. The app now refuses every new proposal until you say resume."); }
    const clauses = t.split(/\s*(?:,|;|\band then\b|\bthen\b|\band\b)\s*(?=(?:buy|sell|close|get|purchase)\b)/i).filter(Boolean);
    let tradeClauses = clauses.filter((c) => /\b(buy|sell|close|purchase|long)\b/i.test(c));
    if (!tradeClauses.length && /ignore (your|the|its) (cap|limit)/i.test(t)) tradeClauses = [t];
    if (tradeClauses.length) {
      handled = tradeClauses.length > 1 ? "chain" : "trade";
      if (tradeClauses.length > 1) say(d, `Splitting your request into ${tradeClauses.length} separate cards. You approve them one at a time.`);
      for (const c of tradeClauses) tradeClause(d, c, t);
      return;
    }
    if (/(watching|strategy|what does|doing for me)/.test(low) && findAgent(d, t)) {
      handled = "agent"; const a = findAgent(d, t)!; const s = summarize(d).agents.find((x) => x.id === a.id)!;
      return say(d, `${a.name} (${getPreset(a.preset).label}): ${a.strategy} Cap $${a.budget}, $${s.remaining} left, max $${s.maxPerTrade} per trade, ${s.pending} pending.${a.preset === "ipo" ? " Uses live SEC EDGAR filings." : " Signals are simulated."}`, a.id);
    }
    if (/(how am i|p&l|pnl|portfolio|status|doing|balance)/.test(low)) {
      handled = "status"; const s = summarize(d);
      const pos = s.portfolio.positions.map((x) => `${x.asset} ${x.qty} (${x.pnl >= 0 ? "+" : ""}${x.pnl})`).join(", ") || "no positions";
      return say(d, `Paper portfolio: invested $${s.portfolio.invested}, worth $${s.portfolio.value}, P&L ${s.portfolio.pnl >= 0 ? "+$" : "-$"}${Math.abs(s.portfolio.pnl)}. Positions: ${pos}. ${s.agents.map((a) => `${a.name} $${a.remaining} left`).join(" · ")}. ${s.paused ? "Desk is PAUSED." : ""} ${s.portfolio.priceSource}.`);
    }
    say(d, `I didn't catch that. ${HELP}`);
  });
  return { handled };
}
