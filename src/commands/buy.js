import { startBuy } from "../features/trading.js";

export default function register(bot) {
  bot.command("buy", async (ctx) => startBuy(ctx));
}
