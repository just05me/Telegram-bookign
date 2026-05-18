import { Bot, BotError, GrammyError, HttpError } from 'grammy';
import { config } from '../config';
import { registerCommands } from './commands';
import { registerCallbacks } from './callbacks';

let _bot: Bot | null = null;

export function getBot(): Bot {
  if (!_bot) throw new Error('Bot not initialized. Call startBot() first.');
  return _bot;
}

export async function startBot(): Promise<Bot> {
  if (_bot) return _bot;

  const token = config.bot.token;
  if (!token) {
    console.warn('BOT_TOKEN not configured, bot will not start');
    return _bot as unknown as Bot;
  }

  _bot = new Bot(token);

  // Register handlers
  registerCommands(_bot);
  registerCallbacks(_bot);

  // Error handling
  _bot.catch((err: BotError) => {
    const ctx = err.ctx;
    console.error(`Bot error for update ${ctx.update.update_id}:`, err.error);
    if (err.error instanceof GrammyError) {
      console.error('Grammy error:', err.error.description);
    } else if (err.error instanceof HttpError) {
      console.error('HTTP error:', err.error.error);
    }
  });

  // Start in polling mode (no webhook URL configured).
  // NOT awaited — bot.start() resolves only when the bot is stopped,
  // so we fire-and-forget to avoid blocking Express startup.
  if (!config.bot.webhookUrl) {
    _bot
      .start({
        onStart: (botInfo) => {
          console.log(`Bot started as @${botInfo.username}`);
        },
      })
      .catch((err) => console.error('Bot polling error:', err));
  } else {
    // Webhook mode: initialise bot info but do not start polling.
    // The caller is responsible for registering the webhook endpoint.
    await _bot.init();
    console.log(`Bot initialised (webhook mode) as @${_bot.botInfo.username}`);
  }

  return _bot;
}
