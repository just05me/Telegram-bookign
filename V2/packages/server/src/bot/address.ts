import { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { prisma } from '../lib/prisma';
import { sessionStore } from '../lib/session';
import { sendAppointmentNotification } from '../lib/telegram';

export async function handleAddressCallback(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const match = ctx.callbackQuery.data.match(/^add_address:(.+)/);
  if (!match) return;
  await ctx.answerCallbackQuery();

  const appointmentId = match[1];
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { organizer: { include: { user: true } } },
  });

  if (!appointment) {
    await ctx.reply('❌ Встреча не найдена.');
    return;
  }

  sessionStore.setAddress(tgId, {
    appointmentId,
    waitFor: 'address',
    organizerId: appointment.organizerId,
  });

  const currentLocation = appointment.location;
  const kb = new InlineKeyboard()
    .text('🏠 Меню', 'main_menu')
    .text('❌ Отменить', 'main_menu');

  if (currentLocation) {
    await ctx.reply(
      `📍 *Текущий адрес:* ${currentLocation}\n\nВведите новый адрес или место проведения:`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  } else {
    await ctx.reply(
      '📍 *Укажите адрес проведения*\n\nВведите адрес или место встречи:',
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  }
}

export async function handleAddressText(ctx: Context) {
  const tgId = ctx.from?.id;
  if (!tgId || !ctx.message?.text) return;

  const entry = sessionStore.getAddress(tgId);
  if (!entry) return;

  const text = ctx.message.text.trim();
  if (text.length < 1) {
    await ctx.reply('⚠️ Введите адрес:');
    return;
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: entry.appointmentId },
    include: {
      organizer: { include: { user: true } },
      client: true,
    },
  });

  if (!appointment) {
    await ctx.reply('❌ Встреча не найдена.');
    sessionStore.delete(tgId);
    return;
  }

  try {
    await prisma.appointment.update({
      where: { id: entry.appointmentId },
      data: { location: text },
    });

    sessionStore.delete(tgId);

    await ctx.reply('✅ Адрес сохранён!', {
      reply_markup: new InlineKeyboard()
        .text('📅 Мои встречи', 'my_appointments')
        .text('🏠 Меню', 'main_menu'),
    });

    // Notify the client about the address
    if (appointment.client?.telegramId) {
      const dateStr = new Date(appointment.startTime).toLocaleDateString('ru-RU');
      const timeStr = new Date(appointment.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

      const msg =
        `📍 *Адрес мероприятия*\n\n` +
        `*${appointment.organizer.title}*\n` +
        `📅 ${dateStr} в ${timeStr}\n` +
        `📍 *Адрес:* ${text}\n\n` +
        `Ждём вас!`;

      await sendAppointmentNotification(
        appointment.organizer.user,
        Number(appointment.client.telegramId),
        msg
      );
    }
  } catch (err) {
    console.error('Error saving address:', err);
    await ctx.reply('❌ Ошибка при сохранении адреса.');
  }
}
