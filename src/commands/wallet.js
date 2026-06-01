import { showWallet } from "../features/trading.js";

export default function register(bot) {
  bot.command("wallet", async (ctx) => showWallet(ctx));
}
