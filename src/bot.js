import { Bot, session } from "grammy";
import { registerTradingFeature } from "./features/trading.js";
import { safeErr } from "./lib/log.js";

export function createBot(token) {
  const bot = new Bot(token);

  bot.use(session({ initial: () => ({ flow: null }) }));

  bot.catch((err) => {
    console.error("[telegram] bot error", {
      updateId: err.ctx?.update?.update_id,
      error: safeErr(err.error)
    });
  });

  registerTradingFeature(bot);

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message?.text || "";
    if (text.startsWith("/")) return next();
    return next();
  });

  return bot;
}
