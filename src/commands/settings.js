import { showSettings } from "../features/trading.js";

export default function register(bot) {
  bot.command("settings", async (ctx) => showSettings(ctx));
}
