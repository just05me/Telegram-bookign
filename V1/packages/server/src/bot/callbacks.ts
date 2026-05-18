import { Bot, Context } from 'grammy';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { mainMenuKeyboard, confirmCancelKeyboard, confirmRescheduleKeyboard, appointmentActionsKeyboard, optionsListKeyboard, optionsManageKeyboard, bookingWebAppKeyboard } from './keyboards';
import { sendAppointmentNotification } from '../lib/telegram';

export function registerCallbacks(bot: Bot) {
  bot.callbackQuery(/my_appointments/, myAppointmentsHandler);
  bot.callbackQuery(/settings/, settingsHandler);
  bot.callbackQuery(/availability/, availabilityHandler);
  bot.callbackQuery(/my_link/, myLinkHandler);
  bot.callbackQuery(/stats/, statsHandler);
  bot.callbackQuery(/cancel_appointment:(.+)/, cancelAppointmentHandler);
  bot.callbackQuery(/confirm_cancel:(.+)/, confirmCancelHandler);
  bot.callbackQuery(/reject_cancel:(.+)/, rejectCancelHandler);
  bot.callbackQuery(/confirm_reschedule:(.+)/, confirmRescheduleHandler);
  bot.callbackQuery(/reject_reschedule:(.+)/, rejectRescheduleHandler);
  bot.callbackQuery(/reschedule_appointment:(.+)/, rescheduleAppointmentHandler);
  bot.callbackQuery(/options_list/, optionsListHandler);
  bot.callbackQuery(/options_new/, optionsNewHandler);
  bot.callbackQuery(/options_edit:(.+)/, optionsEditHandler);
  bot.callbackQuery(/options_rename:(.+)/, optionsRenameHandler);
  bot.callbackQuery(/options_add_choice:(.+)/, optionsAddChoiceHandler);
  bot.callbackQuery(/options_delete:(.+)/, optionsDeleteHandler);
}

async function myAppointmentsHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();

  const tgId = ctx.from?.id;
  if (!tgId) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: { include: { appointments: { where: { status: { not: 'CANCELLED' } }, orderBy: { startTime: 'asc' } } } } },
  });

  if (!user?.organizer || user.organizer.appointments.length === 0) {
    await ctx.reply('У вас нет предстоящих встреч.');
    return;
  }

  const lines = user.organizer.appointments.slice(0, 10).map((a) => {
    const date = new Date(a.startTime).toLocaleDateString('ru-RU');
    const time = new Date(a.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const statusIcon = a.status === 'CONFIRMED' ? '✅' : a.status === 'CANCELLATION_REQUESTED' ? '⏳' : a.status === 'RESCHEDULE_REQUESTED' ? '🔄' : '📌';
    return `${statusIcon} ${date} ${time} — ${a.clientName} (${a.clientContact})`;
  });

  await ctx.reply(`📅 Ваши встречи:\n\n${lines.join('\n')}`);
}

async function settingsHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();

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

  const o = user.organizer;
  await ctx.reply(
    `⚙️ *Настройки календаря*\n\n` +
      `Название: ${o.title}\n` +
      `Длительность: ${o.defaultDuration} мин\n` +
      `Буфер до: ${o.bufferBefore} мин\n` +
      `Буфер после: ${o.bufferAfter} мин\n` +
      `Макс. встреч в день: ${o.maxMeetingsPerDay}\n` +
      `Дней для брони: ${o.bookingDeadlineDays}\n` +
      `Таймзона: ${o.timezone}\n\n` +
      `Настройка через WebApp: ${config.frontendUrl}/dashboard/settings`,
    { parse_mode: 'Markdown' }
  );
}

async function availabilityHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();

  const tgId = ctx.from?.id;
  if (!tgId) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: { include: { availabilitySlots: true } } },
  });

  if (!user?.organizer) {
    await ctx.reply('Сначала создайте календарь.');
    return;
  }

  const slots = user.organizer.availabilitySlots;
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  if (slots.length === 0) {
    await ctx.reply(
      '🕐 Рабочее время не настроено.\n\n' +
        `Настройте через WebApp: ${config.frontendUrl}/dashboard/availability`
    );
    return;
  }

  const lines = slots.map(
    (s) => `${dayNames[s.dayOfWeek]}: ${s.startTime}–${s.endTime}`
  );
  await ctx.reply(
    `🕐 *Ваше расписание:*\n\n${lines.join('\n')}\n\n` +
      `Изменить: ${config.frontendUrl}/dashboard/availability`,
    { parse_mode: 'Markdown' }
  );
}

async function myLinkHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();

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

  const bookingUrl = `${config.frontendUrl}/book/${user.organizer.slug}`;
  await ctx.reply(
    `🔗 *Ваша кнопка бронирования*\n\nПоделитесь этим сообщением с клиентами — они смогут записаться прямо внутри Telegram:`,
    { parse_mode: 'Markdown', reply_markup: bookingWebAppKeyboard(bookingUrl) }
  );
}

async function statsHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();

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

  const total = user.organizer.appointments.length;
  const confirmed = user.organizer.appointments.filter((a) => a.status === 'CONFIRMED').length;
  const cancelled = user.organizer.appointments.filter((a) => a.status === 'CANCELLED').length;

  await ctx.reply(
    `📊 *Статистика:*\n\n` +
      `Всего встреч: ${total}\n` +
      `Запланировано: ${confirmed}\n` +
      `Отменено: ${cancelled}`,
    { parse_mode: 'Markdown' }
  );
}

async function cancelAppointmentHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  const match = ctx.callbackQuery.data?.match(/cancel_appointment:(.+)/);
  if (!match) return;
  const appointmentId = match[1];
  await ctx.answerCallbackQuery();

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { organizer: { include: { user: true } }, client: true },
  });

  if (!appointment) {
    await ctx.reply('Встреча не найдена.');
    return;
  }

  // Update status
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: 'CANCELLATION_REQUESTED',
      cancellationRequestedBy: 'ORGANIZER',
    },
  });

  await ctx.reply('⏳ Запрос на отмену отправлен. Ожидайте подтверждения клиента.');

  // Notify client if they have Telegram
  if (appointment.client?.telegramId) {
    await sendAppointmentNotification(
      appointment.organizer.user,
      Number(appointment.client.telegramId),
      `⏳ Организатор хочет отменить встречу ${new Date(appointment.startTime).toLocaleDateString('ru-RU')}.\nПодтвердите или отклоните отмену.`,
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

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: 'CANCELLED' },
  });

  await ctx.reply('✅ Встреча отменена. Все стороны уведомлены.');
}

async function rejectCancelHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  const match = ctx.callbackQuery.data?.match(/reject_cancel:(.+)/);
  if (!match) return;
  const appointmentId = match[1];
  await ctx.answerCallbackQuery();

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: 'CONFIRMED', cancellationRequestedBy: null, cancellationReason: null },
  });

  await ctx.reply('❌ Отмена отклонена. Встреча остаётся в силе.');
}

async function confirmRescheduleHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  const match = ctx.callbackQuery.data?.match(/confirm_reschedule:(.+)/);
  if (!match) return;
  const appointmentId = match[1];
  await ctx.answerCallbackQuery();

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (!appointment?.rescheduleTargetTime) {
    await ctx.reply('Ошибка: новое время не указано.');
    return;
  }

  const duration = appointment.duration;
  const endTime = new Date(appointment.rescheduleTargetTime.getTime() + duration * 60000);

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
}

async function rejectRescheduleHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  const match = ctx.callbackQuery.data?.match(/reject_reschedule:(.+)/);
  if (!match) return;
  const appointmentId = match[1];
  await ctx.answerCallbackQuery();

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: 'CONFIRMED', rescheduleTargetTime: null },
  });

  await ctx.reply('❌ Перенос отклонён. Встреча остаётся на прежнем времени.');
}

async function rescheduleAppointmentHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();
  await ctx.reply('Функция переноса доступна через WebApp.');
}

// ─── Options handlers ────────────────────────────────────────

async function optionsListHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();

  const tgId = ctx.from?.id;
  if (!tgId) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: {
      organizer: {
        include: {
          bookingOptionGroups: {
            include: { choices: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      },
    },
  });

  if (!user?.organizer) {
    await ctx.reply('Сначала создайте календарь.');
    return;
  }

  const groups = user.organizer.bookingOptionGroups;

  if (groups.length === 0) {
    await ctx.reply(
      '🎯 У вас пока нет опций бронирования.\n\n' +
        'Опции — это дополнительные варианты, которые клиент выбирает при записи (например, тип услуги или пакет).\n\n' +
        `Управляйте опциями в веб-панели: ${config.frontendUrl}/dashboard/options`,
      { reply_markup: optionsListKeyboard([]) }
    );
    return;
  }

  const lines = groups.map((g) => {
    const choices = g.choices.map((c) => `  • ${c.label}`).join('\n');
    return `*${g.title}*\n${choices}`;
  });

  await ctx.reply(
    `🎯 *Ваши опции бронирования:*\n\n${lines.join('\n\n')}\n\n` +
      `Управляйте в веб-панели: ${config.frontendUrl}/dashboard/options`,
    {
      parse_mode: 'Markdown',
      reply_markup: optionsListKeyboard(
        groups.map((g) => ({ id: g.id, title: g.title }))
      ),
    }
  );
}

async function optionsNewHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();

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

  await ctx.reply(
    `➕ Создать новую опцию можно в веб-панели:\n\n${config.frontendUrl}/dashboard/options`,
    { reply_markup: optionsListKeyboard([]) }
  );
}

async function optionsEditHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  const match = ctx.callbackQuery.data?.match(/options_edit:(.+)/);
  if (!match) return;
  await ctx.answerCallbackQuery();

  const groupId = match[1];
  const group = await prisma.bookingOptionGroup.findUnique({
    where: { id: groupId },
    include: { choices: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!group) {
    await ctx.reply('Группа опций не найдена.');
    return;
  }

  const choices = group.choices.map((c, i) => `${i + 1}. ${c.label}`).join('\n');
  await ctx.reply(
    `🎯 *${group.title}*\n\nВарианты:\n${choices || '(нет вариантов)'}\n\n` +
      `Подробное редактирование: ${config.frontendUrl}/dashboard/options`,
    {
      parse_mode: 'Markdown',
      reply_markup: optionsManageKeyboard(groupId),
    }
  );
}

async function optionsRenameHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();
  await ctx.reply('Изменить название можно в веб-панели: ' + config.frontendUrl + '/dashboard/options');
}

async function optionsAddChoiceHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();
  await ctx.reply('Добавить варианты можно в веб-панели: ' + config.frontendUrl + '/dashboard/options');
}

async function optionsDeleteHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  const match = ctx.callbackQuery.data?.match(/options_delete:(.+)/);
  if (!match) return;
  await ctx.answerCallbackQuery();

  const groupId = match[1];

  try {
    // Clear appointment references
    await prisma.appointment.updateMany({
      where: {
        selectedChoiceId: {
          in: (await prisma.bookingOptionChoice.findMany({ where: { groupId }, select: { id: true } })).map((c) => c.id),
        },
      },
      data: { selectedChoiceId: null },
    });

    await prisma.bookingOptionGroup.delete({ where: { id: groupId } });
    await ctx.reply('✅ Группа опций удалена.');
  } catch {
    await ctx.reply('Ошибка при удалении.');
  }
}
