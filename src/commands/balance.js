import { showBalance } from "../features/trading.js";

export default function register(bot) {
  bot.command("balance", async (ctx) => showBalance(ctx));
}
