import { Bot, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { prisma } from '../lib/prisma';
import { mainMenuKeyboard, startKeyboard, confirmCancelKeyboard, confirmRescheduleKeyboard, appointmentActionsKeyboard, bookingLinkKeyboard, appointmentDetailKeyboard, clientMenuKeyboard } from './keyboards';
import { sendAppointmentNotification } from '../lib/telegram';
import { escMarkdown } from '../lib/escape';
import { deleteCalendarEvent } from '../lib/google';
import { showSettings, handleSettingsEdit, handleSettingsText, handleGoogleConnect } from './settings';
import { showAvailability, handleAvailabilityCallback, handleAvailabilityText } from './availability';
import { showOptionsList, handleOptionsCallback, handleOptionsText, handleOptionsAddAnother } from './options';
import { handleAddressCallback } from './address';
import {
  startBooking,
  handleCalendarCallback,
  handleSlotCallback,
  handleOptionsCallback as handleBookingOptionsCallback,
  handleFormText,
  handleFormSkip,
  handleBookingConfirm,
  handleBookingCancel,
  handleBackToDate,
} from './booking';
import { sessionStore } from '../lib/session';

export function registerCallbacks(bot: Bot) {
  // Main menu navigation
  bot.callbackQuery(/my_appointments/, myAppointmentsHandler);
  bot.callbackQuery(/main_menu/, mainMenuHandler);
  bot.callbackQuery(/main_menu:force/, mainMenuForceHandler);
  bot.callbackQuery(/main_menu:ignore/, mainMenuIgnoreHandler);
  bot.callbackQuery(/settings/, settingsHandler);
  bot.callbackQuery(/availability/, availabilityHandler);
  bot.callbackQuery(/my_link/, myLinkHandler);
  bot.callbackQuery(/stats/, statsHandler);
  bot.callbackQuery(/options_list/, optionsListHandler);

  // Appointment actions
  bot.callbackQuery(/^add_address:(.+)/, handleAddressCallback);
  bot.callbackQuery(/cancel_appointment:(.+)/, cancelAppointmentHandler);
  bot.callbackQuery(/confirm_cancel:(.+)/, confirmCancelHandler);
  bot.callbackQuery(/reject_cancel:(.+)/, rejectCancelHandler);
  bot.callbackQuery(/confirm_reschedule:(.+)/, confirmRescheduleHandler);
  bot.callbackQuery(/reject_reschedule:(.+)/, rejectRescheduleHandler);
  bot.callbackQuery(/reschedule_appointment:(.+)/, rescheduleAppointmentHandler);

  // Appointment detail view
  bot.callbackQuery(/^appt_detail:(.+)/, appointmentDetailHandler);
  bot.callbackQuery(/^edit_note:(.+)/, editNoteHandler);

  // Booking info (for client menu)
  bot.callbackQuery(/booking_info$/, bookingInfoCallback);

  // Booking flow
  bot.callbackQuery(/^cal:/, handleCalendarCallback);
  bot.callbackQuery(/^slot:/, handleSlotCallback);
  bot.callbackQuery(/^bopt:/, handleBookingOptionsCallback);
  bot.callbackQuery(/^form:skip/, handleFormSkip);
  bot.callbackQuery(/^booking:confirm/, handleBookingConfirm);
  bot.callbackQuery(/^booking:cancel/, handleBookingCancel);
  bot.callbackQuery(/^booking:back_to_date/, handleBackToDate);

  // Settings flow
  bot.callbackQuery(/^set:edit:/, handleSettingsEdit);

  // Google Calendar connect
  bot.callbackQuery(/^google:connect$/, handleGoogleConnect);

  // Availability flow
  bot.callbackQuery(/^avail:/, handleAvailabilityCallback);

  // Options management flow
  bot.callbackQuery(/^opt:add_another:/, handleOptionsAddAnother);
  bot.callbackQuery(/^opt:new$|^opt:edit:|^opt:rename:|^opt:addchoice:|^opt:delete:|^opt:confirm_delete:|^opt:done_choices:/, (ctx) => {
    // Route to options management handler (separate from booking options)
    return handleOptionsManagerCallback(ctx);
  });
}

// ─── Main menu handlers ───────────────────────────────────────────

async function myAppointmentsHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});

  const tgId = ctx.from?.id;
  if (!tgId) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: true },
  });

  if (!user) {
    await ctx.reply('Пожалуйста, начните с команды /start');
    return;
  }

  // Fetch appointments where user is the organizer (booked with them)
  let orgAppointments: any[] = [];
  if (user.organizer) {
    orgAppointments = await prisma.appointment.findMany({
      where: { organizerId: user.organizer.id, status: { not: 'CANCELLED' } },
      orderBy: { startTime: 'asc' },
      take: 20,
    });
  }

  // Fetch appointments where user is the client (their own bookings)
  let clientAppointments: any[] = await prisma.appointment.findMany({
    where: { clientId: user.id, status: { not: 'CANCELLED' } },
    orderBy: { startTime: 'asc' },
    include: { organizer: true },
    take: 20,
  });

  // Fallback: for legacy appointments without clientId, try telegram username
  if (clientAppointments.length === 0 && ctx.from?.username) {
    clientAppointments = await prisma.appointment.findMany({
      where: {
        clientTelegram: { contains: ctx.from.username },
        status: { not: 'CANCELLED' },
      },
      orderBy: { startTime: 'asc' },
      include: { organizer: true },
      take: 20,
    });
  }

  if (orgAppointments.length === 0 && clientAppointments.length === 0) {
    await ctx.reply(
      '📅 У вас нет предстоящих встреч.',
      { reply_markup: new InlineKeyboard().text('🏠 Меню', 'main_menu') }
    );
    return;
  }

  const kb = new InlineKeyboard();

  // Client appointments (their own bookings with other organizers)
  for (const a of clientAppointments) {
    const date = new Date(a.startTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' });
    const time = new Date(a.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    kb.text(`📅 ${date} ${time} — ${a.organizer?.title || 'Встреча'}`, `appt_detail:${a.id}`);
    kb.row();
  }

  // Organizer appointments (clients booked with them)
  for (const a of orgAppointments) {
    const date = new Date(a.startTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' });
    const time = new Date(a.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    kb.text(`📅 ${date} ${time} — ${a.clientName}`, `appt_detail:${a.id}`);
    kb.row();
  }
  kb.text('🏠 Меню', 'main_menu');

  await ctx.reply('📅 *Ваши встречи:*\nНажмите на встречу для подробностей.', {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

async function mainMenuHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});

  const tgId = ctx.from?.id;
  if (!tgId) return;

  // Check for active non-booking session → show confirmation
  const session = sessionStore.get(tgId);
  if (session && session.type !== 'booking') {
    const kb = new InlineKeyboard()
      .text('🚫 Выйти без сохранения', 'main_menu:force')
      .row()
      .text('🔄 Продолжить', 'main_menu:ignore');
    await ctx.reply('⚠️ У вас есть незавершённое действие. Выйти без сохранения?', {
      reply_markup: kb,
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: true },
  });

  if (!user) {
    await ctx.reply('Пожалуйста, начните с команды /start');
    return;
  }

  if (!user.organizer) {
    if (user.role === 'CLIENT') {
      await ctx.reply('👋 Ваше меню:', { reply_markup: clientMenuKeyboard() });
      return;
    }
    await ctx.reply('У вас ещё нет календаря.', { reply_markup: startKeyboard() });
    return;
  }

  await ctx.reply('Главное меню:', { reply_markup: mainMenuKeyboard() });
}

async function mainMenuForceHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});

  const tgId = ctx.from?.id;
  if (!tgId) return;

  sessionStore.delete(tgId);

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: true },
  });

  if (!user?.organizer) {
    if (user?.role === 'CLIENT') {
      await ctx.reply('👋 Ваше меню:', { reply_markup: clientMenuKeyboard() });
      return;
    }
    await ctx.reply('У вас ещё нет календаря.', { reply_markup: startKeyboard() });
    return;
  }

  await ctx.reply('Главное меню:', { reply_markup: mainMenuKeyboard() });
}

async function mainMenuIgnoreHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();
  try {
    await ctx.deleteMessage();
  } catch {
    // Message may already be deleted
  }
}

async function settingsHandler(ctx: Context) {
  await showSettings(ctx);
}

async function availabilityHandler(ctx: Context) {
  await showAvailability(ctx);
}

async function myLinkHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});

  const tgId = ctx.from?.id;
  if (!tgId) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: true },
  });

  if (!user?.organizer) {
    await ctx.reply('Сначала создайте календарь.');
    return;
  }

  const slug = user.organizer.slug;
  const link = `https://t.me/${ctx.me?.username || 'bot'}?start=${slug}`;

  await ctx.reply(
    `🔗 *Ваша ссылка для бронирования*\n\nПоделитесь этой ссылкой с клиентами:\n${link}\n\nОни смогут записаться прямо в этом боте.`,
    { parse_mode: 'Markdown', reply_markup: bookingLinkKeyboard(slug) }
  );
}

async function statsHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});

  const tgId = ctx.from?.id;
  if (!tgId) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: { include: { appointments: true } } },
  });

  if (!user?.organizer) {
    await ctx.reply('Сначала создайте календарь.');
    return;
  }

  const appointments = user.organizer.appointments;
  const total = appointments.length;
  const confirmed = appointments.filter((a) => a.status === 'CONFIRMED').length;
  const cancelled = appointments.filter((a) => a.status === 'CANCELLED').length;
  const cancelRequested = appointments.filter((a) => a.status === 'CANCELLATION_REQUESTED').length;
  const rescheduled = appointments.filter((a) => a.status === 'RESCHEDULED').length;
  const rescheduleRequested = appointments.filter((a) => a.status === 'RESCHEDULE_REQUESTED').length;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const todayMeetings = appointments.filter((a) => {
    const s = new Date(a.startTime);
    return s >= todayStart && s < todayEnd && a.status !== 'CANCELLED';
  }).length;

  // Current week (Monday to Sunday)
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(todayStart.getTime() + mondayOffset * 86400000);
  const sunday = new Date(monday.getTime() + 7 * 86400000);
  const weekMeetings = appointments.filter((a) => {
    const s = new Date(a.startTime);
    return s >= monday && s < sunday && a.status !== 'CANCELLED';
  }).length;

  // Average participants
  const totalParticipants = appointments
    .filter((a) => a.status !== 'CANCELLED')
    .reduce((sum, a) => sum + a.participantsCount, 0);
  const activeCount = appointments.filter((a) => a.status !== 'CANCELLED').length;
  const avgParticipants = activeCount > 0 ? (totalParticipants / activeCount).toFixed(1) : '—';

  // Busiest date
  const dateCounts = new Map<string, number>();
  for (const a of appointments) {
    if (a.status === 'CANCELLED') continue;
    const d = new Date(a.startTime).toLocaleDateString('ru-RU');
    dateCounts.set(d, (dateCounts.get(d) || 0) + 1);
  }
  let busiestDate = '—';
  let maxCount = 0;
  for (const [date, count] of dateCounts) {
    if (count > maxCount) {
      maxCount = count;
      busiestDate = `${date} (${count})`;
    }
  }

  await ctx.reply(
    `📊 *Статистика:*\n\n` +
      `Всего встреч: ${total}\n` +
      `Запланировано: ${confirmed}\n` +
      `❌ Отменено: ${cancelled}\n` +
      `⏳ Ожидают отмены: ${cancelRequested}\n` +
      `🔄 Перенесено: ${rescheduled}\n` +
      `⏳ Ожидают переноса: ${rescheduleRequested}\n` +
      `📅 Сегодня: ${todayMeetings}\n` +
      `📅 На неделе: ${weekMeetings}\n` +
      `👥 Среднее участников: ${avgParticipants}\n` +
      `📌 Самая загруженная дата: ${busiestDate}`,
    { parse_mode: 'Markdown' }
  );
}

// ─── Options list handler (delegates to options module) ────────────

async function optionsListHandler(ctx: Context) {
  await showOptionsList(ctx);
}

// ─── Options manager callback router ───────────────────────────────

async function handleOptionsManagerCallback(ctx: Context) {
  await handleOptionsCallback(ctx);
}

// ─── Appointment action handlers ───────────────────────────────────

async function cancelAppointmentHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  const match = ctx.callbackQuery.data?.match(/cancel_appointment:(.+)/);
  if (!match) return;
  const appointmentId = match[1];
  await ctx.answerCallbackQuery();

  const tgId = ctx.from?.id;
  if (!tgId) return;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { organizer: { include: { user: true } }, client: true },
  });

  if (!appointment) {
    await ctx.reply('Встреча не найдена.');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: true },
  });
  const isOrganizer = !!user?.organizer && appointment.organizerId === user.organizer.id;
  const requestedBy = isOrganizer ? 'ORGANIZER' : 'CLIENT';

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: 'CANCELLATION_REQUESTED',
      cancellationRequestedBy: requestedBy,
    },
  });

  await ctx.reply('⏳ Запрос на отмену отправлен. Ожидайте подтверждения другой стороны.');

  // Notify the other party
  const dateLabel = new Date(appointment.startTime).toLocaleDateString('ru-RU');
  if (isOrganizer && appointment.client?.telegramId) {
    await sendAppointmentNotification(
      appointment.organizer.user,
      Number(appointment.client.telegramId),
      `⏳ Организатор хочет отменить встречу ${dateLabel}.\nПодтвердите или отклоните отмену.`,
      confirmCancelKeyboard(appointmentId)
    );
  } else if (!isOrganizer && appointment.organizer.user?.telegramId) {
    await sendAppointmentNotification(
      appointment.organizer.user,
      Number(appointment.organizer.user.telegramId),
      `⏳ Клиент хочет отменить встречу ${dateLabel}.\nПодтвердите или отклоните отмену.`,
      confirmCancelKeyboard(appointmentId)
    );
  }
}

async function confirmCancelHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  const match = ctx.callbackQuery.data?.match(/confirm_cancel:(.+)/);
  if (!match) return;
  const appointmentId = match[1];
  await ctx.answerCallbackQuery();

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { organizer: { include: { user: true } }, client: true },
  });

  if (!appointment) {
    await ctx.reply('❌ Встреча не найдена.');
    return;
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: 'CANCELLED' },
  });

  // Delete Google Calendar event if it exists
  if (appointment.googleEventId && appointment.organizer?.googleRefreshToken) {
    try {
      await deleteCalendarEvent(appointment.organizer.googleRefreshToken, appointment.googleEventId);
    } catch (err) {
      console.error('Failed to delete Google Calendar event:', err);
    }
  }

  await ctx.reply('✅ Встреча отменена.');

  // Notify the other party that cancellation was confirmed
  const dateStr = new Date(appointment.startTime).toLocaleDateString('ru-RU');
  const timeStr = new Date(appointment.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const msg = `❌ *Встреча отменена*\n\n*${appointment.organizer.title}*\n📅 ${dateStr} в ${timeStr}\n\nОтмена подтверждена.`;

  if (appointment.client?.telegramId) {
    await sendAppointmentNotification(
      appointment.organizer.user,
      Number(appointment.client.telegramId),
      msg
    );
  }
  if (appointment.organizer.user?.telegramId) {
    await sendAppointmentNotification(
      appointment.client || appointment.organizer.user,
      Number(appointment.organizer.user.telegramId),
      msg
    );
  }
}

async function rejectCancelHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  const match = ctx.callbackQuery.data?.match(/reject_cancel:(.+)/);
  if (!match) return;
  const appointmentId = match[1];
  await ctx.answerCallbackQuery();

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { organizer: { include: { user: true } }, client: true },
  });

  if (!appointment) {
    await ctx.reply('❌ Встреча не найдена.');
    return;
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: 'CONFIRMED', cancellationRequestedBy: null, cancellationReason: null },
  });

  await ctx.reply('❌ Отмена отклонена. Встреча остаётся в силе.');

  // Notify the other party that cancellation was rejected
  const dateStr = new Date(appointment.startTime).toLocaleDateString('ru-RU');
  const timeStr = new Date(appointment.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const msg = `✅ *Отмена отклонена*\n\n*${appointment.organizer.title}*\n📅 ${dateStr} в ${timeStr}\n\nВстреча остаётся в силе.`;

  if (appointment.client?.telegramId) {
    await sendAppointmentNotification(
      appointment.organizer.user,
      Number(appointment.client.telegramId),
      msg
    );
  }
  if (appointment.organizer.user?.telegramId) {
    await sendAppointmentNotification(
      appointment.client || appointment.organizer.user,
      Number(appointment.organizer.user.telegramId),
      msg
    );
  }
}

async function confirmRescheduleHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  const match = ctx.callbackQuery.data?.match(/confirm_reschedule:(.+)/);
  if (!match) return;
  const appointmentId = match[1];
  await ctx.answerCallbackQuery();

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { organizer: { include: { user: true } }, client: true },
  });

  if (!appointment?.rescheduleTargetTime) {
    await ctx.reply('Ошибка: новое время не указано.');
    return;
  }

  const endTime = new Date(appointment.rescheduleTargetTime.getTime() + appointment.duration * 60000);

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: 'RESCHEDULED',
      startTime: appointment.rescheduleTargetTime,
      endTime: endTime,
      rescheduleTargetTime: null,
    },
  });

  await ctx.reply('✅ Встреча перенесена.');

  const newDate = new Date(appointment.rescheduleTargetTime).toLocaleDateString('ru-RU');
  const newTime = new Date(appointment.rescheduleTargetTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const msg = `🔄 *Встреча перенесена*\n\n*${appointment.organizer.title}*\n📅 ${newDate} в ${newTime}\n\nНовое время подтверждено.`;

  if (appointment.client?.telegramId) {
    await sendAppointmentNotification(
      appointment.organizer.user,
      Number(appointment.client.telegramId),
      msg
    );
  }
  if (appointment.organizer.user?.telegramId) {
    await sendAppointmentNotification(
      appointment.client || appointment.organizer.user,
      Number(appointment.organizer.user.telegramId),
      msg
    );
  }
}

async function rejectRescheduleHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  const match = ctx.callbackQuery.data?.match(/reject_reschedule:(.+)/);
  if (!match) return;
  const appointmentId = match[1];
  await ctx.answerCallbackQuery();

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { organizer: { include: { user: true } }, client: true },
  });

  if (!appointment) {
    await ctx.reply('❌ Встреча не найдена.');
    return;
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: 'CONFIRMED', rescheduleTargetTime: null },
  });

  await ctx.reply('❌ Перенос отклонён. Встреча остаётся на прежнем времени.');

  const dateStr = new Date(appointment.startTime).toLocaleDateString('ru-RU');
  const timeStr = new Date(appointment.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const msg = `✅ *Перенос отклонён*\n\n*${appointment.organizer.title}*\n📅 ${dateStr} в ${timeStr}\n\nВстреча остаётся на прежнем времени.`;

  if (appointment.client?.telegramId) {
    await sendAppointmentNotification(
      appointment.organizer.user,
      Number(appointment.client.telegramId),
      msg
    );
  }
  if (appointment.organizer.user?.telegramId) {
    await sendAppointmentNotification(
      appointment.client || appointment.organizer.user,
      Number(appointment.organizer.user.telegramId),
      msg
    );
  }
}

async function rescheduleAppointmentHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();
  await ctx.reply('🔄 Функция переноса будет доступна в ближайшее время.');
}

// ─── Organizer note ──────────────────────────────────────────────

async function editNoteHandler(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const match = ctx.callbackQuery.data.match(/^edit_note:(.+)/);
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

  sessionStore.setNote(tgId, {
    appointmentId,
    waitFor: 'note',
    organizerId: appointment.organizerId,
  });

  const currentNote = appointment.organizerNote;
  const kb = new InlineKeyboard()
    .text('🏠 Меню', 'main_menu');

  if (currentNote) {
    await ctx.reply(
      `📝 *Текущая заметка:* ${escMarkdown(currentNote)}\n\nВведите новый текст или отправьте пустое сообщение, чтобы удалить заметку:`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  } else {
    await ctx.reply(
      '📝 *Напишите заметку*\n\nВведите текст заметки (только для вас):',
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  }
}

export async function handleNoteText(ctx: Context) {
  const tgId = ctx.from?.id;
  if (!tgId || !ctx.message?.text) return;

  const entry = sessionStore.getNote(tgId);
  if (!entry) return;

  const text = ctx.message.text.trim();

  const appointment = await prisma.appointment.findUnique({
    where: { id: entry.appointmentId },
    include: { organizer: { include: { user: true } } },
  });

  if (!appointment) {
    await ctx.reply('❌ Встреча не найдена.');
    sessionStore.delete(tgId);
    return;
  }

  try {
    const noteText = text || null; // empty text removes the note
    await prisma.appointment.update({
      where: { id: entry.appointmentId },
      data: { organizerNote: noteText },
    });

    sessionStore.delete(tgId);

    const msg = noteText
      ? '✅ Заметка сохранена!'
      : '🗑️ Заметка удалена.';

    await ctx.reply(msg, {
      reply_markup: new InlineKeyboard()
        .text('📅 Мои встречи', 'my_appointments')
        .text('🏠 Меню', 'main_menu'),
    });
  } catch (err) {
    console.error('Error saving note:', err);
    await ctx.reply('❌ Ошибка при сохранении заметки.');
  }
}

// ─── Appointment detail view ─────────────────────────────────────

async function appointmentDetailHandler(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const match = ctx.callbackQuery.data.match(/^appt_detail:(.+)/);
  if (!match) return;
  await ctx.answerCallbackQuery();

  const appointmentId = match[1];
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      organizer: true,
      selectedChoice: { include: { group: true } },
    },
  });

  if (!appointment) {
    await ctx.editMessageText('❌ Встреча не найдена.').catch(() => {});
    return;
  }

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: true },
  });
  if (!user) {
    await ctx.reply('Пожалуйста, начните с команды /start');
    return;
  }

  const isOrganizer = user.organizer?.id === appointment.organizerId;
  const isLinkedClient = appointment.clientId !== null && appointment.clientId === user.id;
  const isTelegramMatch = !isLinkedClient && appointment.clientTelegram != null && ctx.from?.username != null &&
    appointment.clientTelegram.replace('@', '').toLowerCase().includes(ctx.from.username.toLowerCase());

  if (!isOrganizer && !isLinkedClient && !isTelegramMatch) {
    await ctx.editMessageText('❌ У вас нет доступа к этой встрече.').catch(() => {});
    return;
  }

  const dateStr = new Date(appointment.startTime).toLocaleDateString('ru-RU');
  const timeStr = new Date(appointment.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const endTimeStr = new Date(appointment.endTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const statusLabels: Record<string, string> = {
    CONFIRMED: '✅ Подтверждено',
    CANCELLATION_REQUESTED: '⏳ Ожидает отмены',
    CANCELLED: '❌ Отменено',
    RESCHEDULE_REQUESTED: '🔄 Ожидает переноса',
    RESCHEDULED: '🔄 Перенесено',
  };

  let msg = `📅 *Полная информация о встрече*\n\n`;
  msg += `*${escMarkdown(appointment.organizer.title)}*\n`;
  msg += `📆 *Дата:* ${dateStr}\n`;
  msg += `⏰ *Время:* ${timeStr} – ${endTimeStr}\n`;
  msg += `👤 *Имя:* ${escMarkdown(appointment.clientName)}\n`;
  if (appointment.clientTelegram) msg += `📱 *Telegram:* ${escMarkdown(appointment.clientTelegram)}\n`;
  if (appointment.phoneNumber) msg += `📞 *Телефон:* ${escMarkdown(appointment.phoneNumber)}\n`;
  if (appointment.instagram) msg += `📸 *Instagram:* ${escMarkdown(appointment.instagram)}\n`;
  if (appointment.participantsCount > 1) msg += `👥 *Участников:* ${appointment.participantsCount}\n`;
  if (appointment.clientNote) msg += `📝 *Заметка:* ${escMarkdown(appointment.clientNote)}\n`;
  if (appointment.location) msg += `📍 *Адрес:* ${escMarkdown(appointment.location)}\n`;
  if (appointment.selectedChoice) {
    msg += `🎯 *${escMarkdown(appointment.selectedChoice.group.title)}:* ${escMarkdown(appointment.selectedChoice.label)}\n`;
  }
  if (isOrganizer && appointment.organizerNote) {
    msg += `\n📝 *Заметка:* ${escMarkdown(appointment.organizerNote)}`;
  }
  msg += `\n📌 *Статус:* ${statusLabels[appointment.status] || appointment.status}`;

  const kb = appointmentDetailKeyboard(appointmentId, isOrganizer);

  try {
    await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: kb });
  } catch {
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });
  }
}

// ─── Booking info callback ──────────────────────────────────────

async function bookingInfoCallback(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});

  await ctx.reply(
    '🔍 *Как забронировать встречу*\n\n' +
    '1. Организатор отправляет вам ссылку на своего бота\n' +
    '2. Нажмите на ссылку или откройте бота\n' +
    '3. Выберите дату и время\n' +
    '4. Заполните форму\n' +
    '5. Готово! ✅',
    { parse_mode: 'Markdown' }
  );
}
