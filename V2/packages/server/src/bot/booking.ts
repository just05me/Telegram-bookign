import { Context, Keyboard, InlineKeyboard } from 'grammy';
import { prisma } from '../lib/prisma';
import { generateAvailableSlots } from '../lib/slots';
import { sessionStore, type BookingSession } from '../lib/session';
import { sendTelegramMessage } from '../lib/telegram';
import { escMarkdown } from '../lib/escape';

// ─── Calendar keyboard ─────────────────────────────────────────────

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export function buildCalendarKeyboard(year: number, month: number, minDate: Date, maxDate: Date, slug: string): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Navigation row
  const canGoPrev = new Date(year, month - 1, 1) >= new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const canGoNext = new Date(year, month + 1, 1) <= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

  if (canGoPrev) {
    kb.text('◀️', `cal:${slug}:${year}:${month - 1}`);
  }
  kb.text(`${MONTH_NAMES[month]} ${year}`, 'cal:ignore');
  if (canGoNext) {
    kb.text('▶️', `cal:${slug}:${year}:${month + 1}`);
  }
  kb.row();

  // Day headers
  for (const name of DAY_NAMES) {
    kb.text(name, 'cal:ignore');
  }
  kb.row();

  // Calculate days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const normMin = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
  const normMax = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());

  // Empty cells before first day
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const normDate = new Date(year, month, d);
    if (normDate < normMin || normDate < today || normDate > normMax) {
      cells.push(null); // disabled
    } else {
      cells.push(d);
    }
  }

  // Build rows of 7
  for (let i = 0; i < cells.length; i += 7) {
    const row = cells.slice(i, i + 7);
    for (const cell of row) {
      if (cell === null) {
        kb.text('·', 'cal:ignore');
      } else {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(cell).padStart(2, '0')}`;
        kb.text(String(cell), `cal:${slug}:select:${dateStr}`);
      }
    }
    kb.row();
  }

  return kb;
}

// ─── Start booking ─────────────────────────────────────────────────

export async function startBooking(ctx: Context, slug: string) {
  const organizer = await prisma.organizer.findUnique({
    where: { slug, isActive: true },
    include: { availabilitySlots: true },
  });

  if (!organizer) {
    await ctx.reply('❌ Организатор не найден или календарь неактивен.');
    return;
  }

  if (organizer.availabilitySlots.length === 0) {
    await ctx.reply('❌ У организатора пока не настроено рабочее расписание.');
    return;
  }

  const session: BookingSession = {
    organizerId: organizer.id,
    organizerSlug: slug,
    organizerTitle: organizer.title,
    date: null,
    time: null,
    selectedChoiceId: null,
    formData: {
      name: '',
      clientTelegram: '',
      phoneNumber: '',
      instagram: '',
      participantsCount: 1,
      note: '',
    },
    step: 'date',
  };

  sessionStore.setBooking(ctx.from!.id, session);

  const minDate = new Date();
  const maxDate = new Date(Date.now() + organizer.bookingDeadlineDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const kb = buildCalendarKeyboard(now.getFullYear(), now.getMonth(), minDate, maxDate, slug);

  const title = organizer.title || 'Календарь';
  let msg = `📅 *${escMarkdown(title)}*\n\n`;
  if (organizer.description) msg += `${escMarkdown(organizer.description)}\n\n`;
  msg += `Выберите дату для бронирования:\n*(Длительность: ${organizer.defaultDuration} мин)*`;

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

// ─── Handle calendar navigation ────────────────────────────────────

export async function handleCalendarCallback(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const parts = ctx.callbackQuery.data.split(':');
  if (parts[0] !== 'cal') return;
  await ctx.answerCallbackQuery();

  const slug = parts[1];
  const action = parts[2];

  if (action === 'ignore') return;

  const organizer = await prisma.organizer.findUnique({ where: { slug } });
  if (!organizer) {
    await ctx.editMessageText('❌ Организатор не найден.');
    return;
  }

  const minDate = new Date();
  const maxDate = new Date(Date.now() + organizer.bookingDeadlineDays * 24 * 60 * 60 * 1000);

  if (action === 'select') {
    const dateStr = parts[3]; // YYYY-MM-DD
    const session = sessionStore.getBooking(ctx.from!.id);
    if (session) {
      session.date = dateStr;
      session.step = 'time';
    }
    await showTimeSlots(ctx, slug, dateStr);
    return;
  }

  // Navigation: cal:slug:year:month
  const year = parseInt(parts[2]);
  const month = parseInt(parts[3]);

  const kb = buildCalendarKeyboard(year, month, minDate, maxDate, slug);
  await ctx.editMessageReplyMarkup({ reply_markup: kb });
}

// ─── Show time slots ───────────────────────────────────────────────

async function showTimeSlots(ctx: Context, slug: string, dateStr: string) {
  const organizer = await prisma.organizer.findUnique({
    where: { slug },
    include: { availabilitySlots: true },
  });

  if (!organizer) {
    await ctx.editMessageText('❌ Организатор не найден.');
    return;
  }

  const slots = await generateAvailableSlots(
    {
      id: organizer.id,
      slug: organizer.slug,
      defaultDuration: organizer.defaultDuration,
      bufferBefore: organizer.bufferBefore,
      bufferAfter: organizer.bufferAfter,
      maxMeetingsPerDay: organizer.maxMeetingsPerDay,
      bookingDeadlineDays: organizer.bookingDeadlineDays,
      timezone: organizer.timezone,
      availabilitySlots: organizer.availabilitySlots,
    },
    dateStr,
    organizer.timezone
  );

  if (slots.length === 0) {
    const kb = new InlineKeyboard().text('← Другая дата', `booking:back_to_date:${slug}`);
    await ctx.editMessageText('❌ На эту дату нет свободных слотов. Выберите другую дату.', {
      reply_markup: kb,
    });
    return;
  }

  const dateObj = new Date(dateStr + 'T00:00:00');
  const formattedDate = dateObj.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const kb = new InlineKeyboard();
  // Slots in rows of 3
  for (let i = 0; i < slots.length; i += 3) {
    const row = slots.slice(i, i + 3);
    for (const slot of row) {
      kb.text(slot.start, `slot:${slug}:${dateStr}:${slot.start}`);
    }
    kb.row();
  }
  kb.text('← Другая дата', `booking:back_to_date:${slug}`);
  kb.text('❌ Отменить', 'booking:cancel');

  await ctx.editMessageText(
    `📅 *${formattedDate}*\n\nВыберите время:\n*(Длительность: ${organizer.defaultDuration} мин)*`,
    { parse_mode: 'Markdown', reply_markup: kb }
  );
}

// ─── Handle slot selection ─────────────────────────────────────────

export async function handleSlotCallback(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const parts = ctx.callbackQuery.data.split(':');
  if (parts[0] !== 'slot') return;
  await ctx.answerCallbackQuery();

  const slug = parts[1];
  const dateStr = parts[2];
  // parts[3..] is the time (it contains a colon, split by ':')
  const time = parts.slice(3).join(':');

  const session = sessionStore.getBooking(ctx.from!.id);
  if (session) {
    session.time = time;
  }

  // Check if organizer has option groups
  const organizer = await prisma.organizer.findUnique({
    where: { slug },
    include: {
      bookingOptionGroups: {
        where: { isActive: true },
        include: { choices: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });

  if (!organizer) {
    await ctx.editMessageText('❌ Организатор не найден.');
    return;
  }

  const groups = organizer.bookingOptionGroups;

  if (groups.length > 0) {
    if (session) session.step = 'options';
    await showOptionsSelection(ctx, slug, dateStr, time, groups);
  } else {
    if (session) session.step = 'form_name';
    await askFormField(ctx, dateStr, time, 'name');
  }
}

// ─── Options selection ─────────────────────────────────────────────

async function showOptionsSelection(
  ctx: Context,
  slug: string,
  dateStr: string,
  time: string,
  groups: { id: string; title: string; choices: { id: string; label: string }[] }[]
) {
  const kb = new InlineKeyboard();
  for (const group of groups) {
    kb.text(group.title, 'bopt:ignore');
    kb.row();
    for (const choice of group.choices) {
      kb.text(choice.label, `bopt:c:${choice.id}`);
    }
    kb.row();
  }
  kb.text('⏭ Пропустить', 'bopt:skip');
  kb.text('❌ Отменить', 'booking:cancel');

  await ctx.editMessageText('🎯 *Выберите опцию:*', {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

export async function handleOptionsCallback(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const parts = ctx.callbackQuery.data.split(':');
  if (parts[0] !== 'bopt') return;
  await ctx.answerCallbackQuery();

  const session = sessionStore.getBooking(ctx.from!.id);
  if (!session || !session.date || !session.time) {
    await ctx.editMessageText('❌ Сессия бронирования устарела. Начните заново.');
    return;
  }

  const action = parts[1];
  const dateStr = session.date;
  const time = session.time;

  if (action === 'skip' || action === 'ignore') {
    if (action === 'skip') {
      session.step = 'form_name';
    }
    await askFormField(ctx, dateStr, time, 'name');
    return;
  }

  if (action === 'c') {
    const choiceId = parts[2];
    session.selectedChoiceId = choiceId;
    session.step = 'form_name';
    await askFormField(ctx, dateStr, time, 'name');
  }
}

// ─── Form handling ─────────────────────────────────────────────────

const FORM_QUESTIONS: Record<string, { question: string; required: boolean; field: keyof import('../lib/session').BookingFormData }> = {
  name: { question: '✏️ *Введите ваше имя:*', required: true, field: 'name' },
  telegram: { question: '📱 *Ваш Telegram* (@username)\n\n_Нажмите "Пропустить" если не хотите указывать_', required: false, field: 'clientTelegram' },
  instagram: { question: '📸 *Ваш Instagram*\n\n_Укажите ник (@nickname) или ссылку на профиль_\n_Нажмите "Пропустить" если не хотите указывать_', required: false, field: 'instagram' },
  phone: { question: '📞 *Ваш номер телефона*\n\n_Нажмите кнопку ниже, чтобы поделиться номером, или введите вручную_\n_Нажмите "Пропустить" если не хотите указывать_', required: false, field: 'phoneNumber' },
  participants: { question: '👥 *Количество участников*\n\n_Введите число (по умолчанию 1)_', required: false, field: 'participantsCount' },
  note: { question: '📝 *Заметка* (необязательно)\n\n_Напишите дополнительную информацию или нажмите "Пропустить"_', required: false, field: 'note' },
};

const FORM_STEPS = ['name', 'telegram', 'instagram', 'phone', 'participants', 'note'] as const;
type FormStep = typeof FORM_STEPS[number];

async function askFormField(ctx: Context, dateStr: string, time: string, step: FormStep) {
  const q = FORM_QUESTIONS[step];
  if (!q) return;

  const session = sessionStore.getBooking(ctx.from!.id);

  // Save which step we're on
  if (session) {
    const stepKey = `form_${step}` as BookingSession['step'];
    session.step = stepKey;
  }

  // Phone step uses reply keyboard with request_contact button
  if (step === 'phone') {
    const inlineKb = new InlineKeyboard()
      .text('⏭ Пропустить', 'form:skip:phone')
      .text('❌ Отменить', 'booking:cancel');

    try {
      await ctx.editMessageText(q.question, {
        parse_mode: 'Markdown',
        reply_markup: inlineKb,
      });
    } catch {
      // ignore
    }

    const phoneKb = new Keyboard()
      .requestContact('📱 Поделиться номером')
      .text('⏭ Пропустить')
      .resized()
      .oneTime();
    await ctx.reply('👇 Или нажмите кнопку ниже, чтобы поделиться номером:', {
      reply_markup: phoneKb,
    });
    return;
  }

  const kb = new InlineKeyboard();
  if (!q.required) {
    kb.text('⏭ Пропустить', `form:skip:${step}`);
  }
  kb.text('❌ Отменить', 'booking:cancel');

  try {
    await ctx.editMessageText(q.question, {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  } catch {
    await ctx.reply(q.question, {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  }
}

export async function handleFormText(ctx: Context) {
  const tgId = ctx.from?.id;
  if (!tgId) return;
  if (!ctx.message?.text) return;

  const session = sessionStore.getBooking(tgId);
  if (!session) return;
  if (session.step === 'done' || session.step === 'date' || session.step === 'time' || session.step === 'options' || session.step === 'confirm') return;

  // Determine which field we're collecting
  const stepMap: Record<string, FormStep> = {
    form_name: 'name',
    form_telegram: 'telegram',
    form_instagram: 'instagram',
    form_phone: 'phone',
    form_participants: 'participants',
    form_note: 'note',
  };

  const currentStep = stepMap[session.step];
  if (!currentStep) return;

  const text = ctx.message.text.trim();

  // Validate
  if (currentStep === 'name' && text.length < 1) {
    await ctx.reply('⚠️ Имя не может быть пустым. Введите имя:');
    return;
  }

  if (currentStep === 'instagram') {
    const lower = text.toLowerCase();
    // Accept @nickname, instagram.com/username, or just username
    if (!/^@[\w._]+$/.test(text) && !lower.startsWith('https://www.instagram.com/') && !lower.startsWith('https://instagram.com/') && !/^[\w._]+$/.test(text)) {
      await ctx.reply('⚠️ Укажите ник (@nickname) или ссылку на профиль Instagram:');
      return;
    }
    session.formData.instagram = text;
  } else if (currentStep === 'phone') {
    if (text === '⏭ Пропустить') {
      try { await ctx.reply('✅ Пропущено', { reply_markup: { remove_keyboard: true } }); } catch { /* ignore */ }
      const idx = FORM_STEPS.indexOf('phone');
      const nextIdx = idx + 1;
      if (nextIdx >= FORM_STEPS.length) {
        session.step = 'confirm';
        await showConfirmation(ctx, session);
      } else {
        const nextStep = FORM_STEPS[nextIdx];
        session.step = `form_${nextStep}` as BookingSession['step'];
        await askFormField(ctx, session.date!, session.time!, nextStep);
      }
      return;
    }
    // Manual phone input (fallback if user doesn't use the contact button)
    const cleaned = text.replace(/[\s\-\(\)]/g, '');
    if (cleaned.length < 5) {
      await ctx.reply('⚠️ Введите корректный номер телефона или нажмите "Поделиться номером":');
      return;
    }
    session.formData.phoneNumber = cleaned;
    // Remove reply keyboard from phone step
    try { await ctx.reply('✅ Номер принят', { reply_markup: { remove_keyboard: true } }); } catch { /* ignore */ }
  } else if (currentStep === 'participants') {
    const num = parseInt(text);
    if (isNaN(num) || num < 1) {
      await ctx.reply('⚠️ Введите число от 1:');
      return;
    }
    session.formData.participantsCount = num;
  } else {
    (session.formData as any)[FORM_QUESTIONS[currentStep].field] = text;
  }

  // Move to next step
  const currentIdx = FORM_STEPS.indexOf(currentStep);
  const nextIdx = currentIdx + 1;

  if (nextIdx >= FORM_STEPS.length) {
    // All fields collected - show confirmation
    session.step = 'confirm';
    await showConfirmation(ctx, session);
  } else {
    const nextStep = FORM_STEPS[nextIdx];
    session.step = `form_${nextStep}` as BookingSession['step'];
    await askFormField(ctx, session.date!, session.time!, nextStep);
  }
}

export async function handleFormSkip(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const parts = ctx.callbackQuery.data.split(':');
  if (parts[0] !== 'form' || parts[1] !== 'skip') return;
  await ctx.answerCallbackQuery();

  const tgId = ctx.from!.id;
  const session = sessionStore.getBooking(tgId);
  if (!session) return;
  if (session.step === 'done' || session.step === 'confirm') return;

  const stepMap: Record<string, FormStep> = {
    form_name: 'name',
    form_telegram: 'telegram',
    form_instagram: 'instagram',
    form_phone: 'phone',
    form_participants: 'participants',
    form_note: 'note',
  };

  const currentStep = stepMap[session.step];
  if (!currentStep) return;

  // Populate default if available
  if (currentStep === 'participants') {
    session.formData.participantsCount = 1;
  }

  // Remove reply keyboard when leaving phone step
  if (currentStep === 'phone') {
    try { await ctx.reply('✅ Пропущено', { reply_markup: { remove_keyboard: true } }); } catch { /* ignore */ }
  }

  const currentIdx = FORM_STEPS.indexOf(currentStep);
  const nextIdx = currentIdx + 1;

  if (nextIdx >= FORM_STEPS.length) {
    session.step = 'confirm';
    await showConfirmation(ctx, session);
  } else {
    const nextStep = FORM_STEPS[nextIdx];
    session.step = `form_${nextStep}` as BookingSession['step'];
    await askFormField(ctx, session.date!, session.time!, nextStep);
  }
}

// ─── Confirmation ──────────────────────────────────────────────────

async function showConfirmation(ctx: Context, session: BookingSession) {
  const dateObj = new Date(session.date! + 'T00:00:00');
  const formattedDate = dateObj.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  let msg = `📋 *Подтверждение бронирования*\n\n`;
  msg += `*${escMarkdown(session.organizerTitle)}*\n\n`;
  msg += `📅 *Дата:* ${formattedDate}\n`;
  msg += `⏰ *Время:* ${session.time}\n`;
  msg += `👤 *Имя:* ${escMarkdown(session.formData.name)}\n`;
  if (session.formData.clientTelegram) msg += `📱 *Telegram:* ${escMarkdown(session.formData.clientTelegram)}\n`;
  if (session.formData.phoneNumber) msg += `📞 *Телефон:* ${escMarkdown(session.formData.phoneNumber)}\n`;
  if (session.formData.instagram) msg += `📸 *Instagram:* ${escMarkdown(session.formData.instagram)}\n`;
  if (session.formData.participantsCount > 1) msg += `👥 *Участников:* ${session.formData.participantsCount}\n`;
  if (session.formData.note) msg += `📝 *Заметка:* ${escMarkdown(session.formData.note)}\n`;

  if (session.selectedChoiceId) {
    const choice = await prisma.bookingOptionChoice.findUnique({
      where: { id: session.selectedChoiceId },
      include: { group: true },
    });
    if (choice) {
      msg += `\n🎯 *${escMarkdown(choice.group.title)}:* ${escMarkdown(choice.label)}`;
    }
  }

  msg += `\n\nВсё верно?`;

  const kb = new InlineKeyboard()
    .text('✅ Подтвердить', `booking:confirm:${session.organizerSlug}`)
    .text('❌ Отменить', 'booking:cancel');

  try {
    await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: kb });
  } catch {
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });
  }
}

export async function handleBookingConfirm(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const parts = ctx.callbackQuery.data.split(':');
  if (parts[0] !== 'booking' || parts[1] !== 'confirm') return;
  await ctx.answerCallbackQuery();

  const slug = parts[2];
  const tgId = ctx.from!.id;
  const session = sessionStore.getBooking(tgId);
  if (!session) {
    await ctx.editMessageText('❌ Сессия бронирования устарела. Начните заново через ссылку организатора.');
    return;
  }

  if (!session.date || !session.time) {
    await ctx.editMessageText('❌ Ошибка: дата или время не выбраны.');
    sessionStore.delete(tgId);
    return;
  }

  const organizer = await prisma.organizer.findUnique({
    where: { slug },
    include: { user: true },
  });

  if (!organizer) {
    await ctx.editMessageText('❌ Организатор не найден.');
    sessionStore.delete(tgId);
    return;
  }

  const startTime = new Date(session.date + `T${session.time}:00Z`);
  const endTime = new Date(startTime.getTime() + organizer.defaultDuration * 60000);

  // Check for conflicts (race condition)
  const conflicting = await prisma.appointment.findFirst({
    where: {
      organizerId: organizer.id,
      status: { in: ['CONFIRMED', 'RESCHEDULE_REQUESTED'] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });

  if (conflicting) {
    await ctx.editMessageText('❌ К сожалению, это время уже занято. Попробуйте выбрать другое.');
    sessionStore.delete(tgId);
    return;
  }

  // Check daily limit
  const dayStart = new Date(session.date + 'T00:00:00Z');
  const dayEnd = new Date(session.date + 'T23:59:59Z');
  const dayCount = await prisma.appointment.count({
    where: {
      organizerId: organizer.id,
      status: { not: 'CANCELLED' },
      startTime: { gte: dayStart, lte: dayEnd },
    },
  });

  if (dayCount >= organizer.maxMeetingsPerDay) {
    await ctx.editMessageText('❌ У организатора лимит встреч на этот день исчерпан.');
    sessionStore.delete(tgId);
    return;
  }

  // Create appointment
  try {
    const appointment = await prisma.appointment.create({
      data: {
        organizerId: organizer.id,
        clientName: session.formData.name,
        clientContact: session.formData.phoneNumber || session.formData.clientTelegram || session.formData.name,
        clientTelegram: session.formData.clientTelegram || null,
        phoneNumber: session.formData.phoneNumber || null,
        instagram: session.formData.instagram || null,
        participantsCount: session.formData.participantsCount || 1,
        clientNote: session.formData.note || null,
        selectedChoiceId: session.selectedChoiceId || null,
        startTime,
        endTime,
        duration: organizer.defaultDuration,
      },
    });

    session.step = 'done';

    // Link appointment to client user
    let clientUser = await prisma.user.findUnique({
      where: { telegramId: BigInt(tgId) },
    });
    if (!clientUser) {
      clientUser = await prisma.user.create({
        data: {
          telegramId: BigInt(tgId),
          firstName: ctx.from?.first_name || '',
          lastName: ctx.from?.last_name || '',
          telegramUsername: ctx.from?.username || null,
          languageCode: ctx.from?.language_code || null,
          role: 'CLIENT',
        },
      });
    }
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { clientId: clientUser.id },
    });

    // Success message to client
    const dateStr = startTime.toLocaleDateString('ru-RU');
    const timeStr = startTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const successMsg = `✅ *Запись подтверждена!*\n\n📅 *${escMarkdown(session.organizerTitle)}*\n📆 ${dateStr} в ${timeStr}\n⏱ ${organizer.defaultDuration} мин\n\nСпасибо! Организатор уже уведомлён.`;

    const doneKb = new InlineKeyboard()
      .text('📅 Мои встречи', 'my_appointments')
      .text('🏠 Меню', 'main_menu');

    await ctx.editMessageText(successMsg, {
      parse_mode: 'Markdown',
      reply_markup: doneKb,
    });

    // Notify organizer
    let orgMsg = `📅 *Новая встреча*\n\n*${escMarkdown(session.formData.name)}*`;
    if (session.formData.clientTelegram) orgMsg += `\nTelegram: ${escMarkdown(session.formData.clientTelegram)}`;
    if (session.formData.phoneNumber) orgMsg += `\nТел: ${escMarkdown(session.formData.phoneNumber)}`;
    if (session.formData.instagram) orgMsg += `\nInstagram: ${escMarkdown(session.formData.instagram)}`;
    orgMsg += `\n${dateStr} в ${timeStr}`;
    orgMsg += `\nДлительность: ${organizer.defaultDuration} мин`;
    if (session.formData.participantsCount > 1) orgMsg += `\nУчастников: ${session.formData.participantsCount}`;
    if (session.formData.note) orgMsg += `\nЗаметка: ${escMarkdown(session.formData.note)}`;

    if (session.selectedChoiceId) {
      const choice = await prisma.bookingOptionChoice.findUnique({
        where: { id: session.selectedChoiceId },
        include: { group: true },
      });
      if (choice) {
        orgMsg += `\n${escMarkdown(choice.group.title)}: ${escMarkdown(choice.label)}`;
      }
    }

    const { appointmentActionsKeyboard } = await import('./keyboards');
    await sendTelegramMessage(
      Number(organizer.user.telegramId),
      orgMsg,
      appointmentActionsKeyboard(appointment.id)
    );

    sessionStore.delete(tgId);
  } catch (err) {
    console.error('Error creating appointment:', err);
    await ctx.editMessageText('❌ Произошла ошибка при бронировании. Попробуйте позже.');
    sessionStore.delete(tgId);
  }
}

// ─── Cancel booking ────────────────────────────────────────────────

export async function handleBookingCancel(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  if (ctx.callbackQuery.data !== 'booking:cancel') return;
  await ctx.answerCallbackQuery();

  const tgId = ctx.from!.id;
  sessionStore.delete(tgId);

  await ctx.editMessageText('❌ Бронирование отменено.');
}

// ─── Back to date ──────────────────────────────────────────────────

export async function handleBackToDate(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const parts = ctx.callbackQuery.data.split(':');
  if (parts[0] !== 'booking' || parts[1] !== 'back_to_date') return;
  await ctx.answerCallbackQuery();

  const slug = parts[2];
  const session = sessionStore.getBooking(ctx.from!.id);
  if (session) {
    session.date = null;
    session.time = null;
    session.step = 'date';
  }

  await startBooking(ctx, slug);
}

// ─── Handle shared contact (phone number) ─────────────────────────┐

export async function handleContactMessage(ctx: Context) {
  if (!ctx.message?.contact) return;
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const session = sessionStore.getBooking(tgId);
  if (!session) return;
  if (!session.step.startsWith('form_phone')) return;

  const phone = ctx.message.contact.phone_number || '';
  session.formData.phoneNumber = phone;

  // Remove reply keyboard
  try {
    await ctx.reply('✅ Номер получен!', {
      reply_markup: { remove_keyboard: true },
    });
  } catch { /* ignore */ }

  // Move to next step
  const currentIdx = FORM_STEPS.indexOf('phone');
  const nextIdx = currentIdx + 1;
  if (nextIdx >= FORM_STEPS.length) {
    session.step = 'confirm';
    await showConfirmation(ctx, session);
  } else {
    const nextStep = FORM_STEPS[nextIdx];
    session.step = `form_${nextStep}` as BookingSession['step'];
    await askFormField(ctx, session.date!, session.time!, nextStep);
  }
}
