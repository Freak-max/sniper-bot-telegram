import { listSnipeMenu } from "../features/trading.js";

export default function register(bot) {
  bot.command("snipes", async (ctx) => listSnipeMenu(ctx));
}
