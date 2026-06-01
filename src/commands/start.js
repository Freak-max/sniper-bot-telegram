import { showMain } from "../features/trading.js";

export default function register(bot) {
  bot.command("start", async (ctx) => showMain(ctx));
}
