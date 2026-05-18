import { getBot } from '../bot';

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: unknown
) {
  try {
    const bot = getBot();
    const opts: Record<string, unknown> = { parse_mode: 'Markdown' };
    if (replyMarkup) opts['reply_markup'] = replyMarkup;

    await bot.api.sendMessage(chatId, text, opts as never);
  } catch (err) {
    console.error(`Failed to send message to ${chatId}:`, err);
  }
}

export async function sendAppointmentNotification(
  _user: { firstName: string },
  chatId: number,
  message: string,
  keyboard?: unknown
) {
  await sendTelegramMessage(chatId, message, keyboard);
}
