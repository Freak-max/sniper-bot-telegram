import { showPositions } from "../features/trading.js";

export default function register(bot) {
  bot.command("positions", async (ctx) => showPositions(ctx));
}
