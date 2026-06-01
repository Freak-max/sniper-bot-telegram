import { cancelFlow } from "../features/trading.js";

export default function register(bot) {
  bot.command("cancel", async (ctx) => cancelFlow(ctx));
}
