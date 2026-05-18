import { Bot, BotError, GrammyError, HttpError } from 'grammy';
import { config } from '../config';
import { registerCommands } from './commands';
import { registerCallbacks } from './callbacks';
import { handleFormText, handleContactMessage } from './booking';
import { handleSettingsText } from './settings';
import { handleAvailabilityText } from './availability';
import { handleOptionsText } from './options';
import { handleAddressText } from './address';
import { handleNoteText } from './callbacks';

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

  // Text message handlers (session-based conversations)
  _bot.on('message:text', async (ctx) => {
    // Each handler checks for its own session type internally
    // and silently returns if no active session matches
    await handleSettingsText(ctx).catch(() => {});
    await handleAvailabilityText(ctx).catch(() => {});
    await handleOptionsText(ctx).catch(() => {});
    await handleAddressText(ctx).catch(() => {});
    await handleNoteText(ctx).catch(() => {});
    await handleFormText(ctx).catch(() => {});
  });

  // Handle shared contact (phone number from Telegram button)
  _bot.on('message:contact', async (ctx) => {
    await handleContactMessage(ctx).catch(() => {});
  });

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

  // Start in polling mode.
  if (!config.bot.webhookUrl) {
    _bot
      .start({
        onStart: (botInfo) => {
          config.botUsername = botInfo.username;
          console.log(`Bot started as @${botInfo.username}`);
        },
      })
      .catch((err) => console.error('Bot polling error:', err));
  } else {
    await _bot.init();
    config.botUsername = _bot.botInfo.username;
    console.log(`Bot initialised (webhook mode) as @${_bot.botInfo.username}`);
  }

  return _bot;
}

