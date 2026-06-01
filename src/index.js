import "dotenv/config";
import { run } from "@grammyjs/runner";
import { safeErr } from "./lib/log.js";

process.on("unhandledRejection", (err) => {
  console.error("[process] unhandledRejection", { error: safeErr(err) });
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException", { error: safeErr(err) });
  process.exit(1);
});

function isConflict(err) {
  const msg = safeErr(err).toLowerCase();
  return msg.includes("409") || msg.includes("conflict") || msg.includes("terminated by other getupdates");
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function boot() {
  console.log("[boot] start");

  try {
    const { cfg, logEnvSanity } = await import("./lib/config.js");
    const { connectDb, ensureIndexes } = await import("./lib/db.js");
    const { createBot } = await import("./bot.js");
    const { registerCommands } = await import("./commands/loader.js");
    const { startSnipeMonitor, stopSnipeMonitor } = await import("./services/snipes.js");

    logEnvSanity();

    if (!cfg.TELEGRAM_BOT_TOKEN) {
      console.error("[boot] TELEGRAM_BOT_TOKEN is required. Add it in your environment and redeploy.");
      process.exit(1);
    }

    await connectDb();
    await ensureIndexes();

    const bot = createBot(cfg.TELEGRAM_BOT_TOKEN);
    await registerCommands(bot);

    try {
      await bot.init();
      await bot.api.setMyCommands([
        { command: "start", description: "Open the main menu" },
        { command: "help", description: "Commands and safety notes" },
        { command: "wallet", description: "Create, import, or connect a wallet" },
        { command: "buy", description: "Start a confirmed buy flow" },
        { command: "sell", description: "Start a confirmed sell flow" },
        { command: "snipe", description: "Create a snipe target" },
        { command: "snipes", description: "Manage active snipes" },
        { command: "balance", description: "Show wallet balances" },
        { command: "positions", description: "Show tracked positions and PnL" },
        { command: "settings", description: "Edit trading defaults" },
        { command: "cancel", description: "Cancel the current flow" }
      ]);
    } catch (err) {
      console.warn("[boot] set commands failed", { error: safeErr(err) });
    }

    try {
      await bot.api.deleteWebhook({ drop_pending_updates: true });
      console.log("[polling] webhook cleared");
    } catch (err) {
      console.warn("[polling] deleteWebhook failed", { error: safeErr(err) });
    }

    startSnipeMonitor(bot);

    let runnerHandle = null;
    let stopping = false;
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      console.log("[boot] shutdown start");
      stopSnipeMonitor();
      try {
        await runnerHandle?.stop?.();
      } catch (err) {
        console.warn("[polling] runner stop failed", { error: safeErr(err) });
      }
      process.exit(0);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    let backoffMs = 2000;
    while (!stopping) {
      try {
        console.log("[polling] starting", { concurrency: 1 });
        runnerHandle = run(bot, { runner: { concurrency: 1 } });
        console.log("[polling] started");
        await runnerHandle.task();
        if (!stopping) {
          console.warn("[polling] runner stopped unexpectedly");
        }
        backoffMs = 2000;
      } catch (err) {
        const conflict = isConflict(err);
        console.warn("[polling] failure", { conflict, error: safeErr(err), backoffMs });
        if (!conflict && !stopping) {
          console.warn("[polling] retrying after failure");
        }
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs === 2000 ? 5000 : backoffMs * 2, 20000);
      }
    }
  } catch (err) {
    console.error("[boot] fatal", { code: err?.code, error: safeErr(err) });
    if (err?.code === "ERR_MODULE_NOT_FOUND") {
      console.error("[boot] Check ESM .js extensions and created files under src/.");
    }
    process.exit(1);
  }
}

boot();
