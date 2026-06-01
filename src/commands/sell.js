import { startSell } from "../features/trading.js";

export default function register(bot) {
  bot.command("sell", async (ctx) => startSell(ctx));
}
