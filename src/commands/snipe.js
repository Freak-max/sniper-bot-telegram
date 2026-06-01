import { startSnipe } from "../features/trading.js";

export default function register(bot) {
  bot.command("snipe", async (ctx) => startSnipe(ctx));
}
