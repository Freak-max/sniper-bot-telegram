import { cfg } from "../lib/config.js";
import { safeErr } from "../lib/log.js";
import { listActiveSnipes, updateSnipe } from "./store.js";
import { getTokenRisk } from "./chain.js";

let running = false;
let timer = null;
let cycle = 0;
let lastMemLog = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function monitorLoop() {
  console.log("[snipes] poll started", { pollMs: cfg.SNIPE_POLL_MS });
  while (running) {
    cycle += 1;
    console.log("[snipes] poll cycle", { cycle });

    try {
      const snipes = await listActiveSnipes();
      for (const snipe of snipes) {
        try {
          const risk = await getTokenRisk(snipe.tokenAddress);
          await updateSnipe(snipe._id, {
            lastCheck: {
              at: new Date(),
              riskFlags: risk.flags || [],
              liquidityWarning: Boolean(risk.liquidityWarning),
              riskyWarning: Boolean(risk.riskyWarning)
            }
          });
        } catch (err) {
          console.warn("[snipes] item failure", { snipeId: snipe._id, error: safeErr(err) });
        }
      }

      const now = Date.now();
      if (now - lastMemLog > 60000) {
        lastMemLog = now;
        const m = process.memoryUsage();
        console.log("[mem]", { rssMB: Math.round(m.rss / 1e6), heapUsedMB: Math.round(m.heapUsed / 1e6) });
      }
    } catch (err) {
      console.warn("[snipes] poll failure", { error: safeErr(err) });
    }

    await sleep(Math.max(5000, cfg.SNIPE_POLL_MS || 15000));
  }
}

export function startSnipeMonitor() {
  if (running) return;
  running = true;
  timer = monitorLoop().catch((err) => {
    running = false;
    console.error("[snipes] monitor crashed", { error: safeErr(err) });
  });
}

export function stopSnipeMonitor() {
  running = false;
  return timer;
}
