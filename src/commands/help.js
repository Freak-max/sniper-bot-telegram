import { showHelp } from "../features/trading.js";

export default function register(bot) {
  bot.command("help", async (ctx) => showHelp(ctx));
}
