import { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { prisma } from '../lib/prisma';
import { sessionStore } from '../lib/session';

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export async function showAvailability(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();

  const tgId = ctx.from?.id;
  if (!tgId) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: { include: { availabilitySlots: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] } } } },
  });

  if (!user?.organizer) {
    await ctx.reply('Сначала создайте календарь.');
    return;
  }

  const slots = user.organizer.availabilitySlots;
  const kb = new InlineKeyboard();

  if (slots.length === 0) {
    // Show day-by-day add buttons
    for (let d = 1; d <= 5; d++) {
      kb.text(`➕ ${DAY_NAMES[d]}`, `avail:add:${d}`);
    }
    kb.row();
    kb.text('➕ Сб', `avail:add:${6}`).text('➕ Вс', `avail:add:${0}`);
    kb.row();
    kb.text('🏠 Меню', 'main_menu');
    kb.text('◀️ Назад', 'main_menu');

    await ctx.editMessageText(
      '🕐 *Рабочее время*\n\nРасписание не настроено. Нажмите на день, чтобы добавить время:',
      { parse_mode: 'Markdown', reply_markup: kb }
    );
    return;
  }

  // Show current schedule grouped by day
  let msg = '🕐 *Расписание:*\n\n';
  for (let d = 0; d < 7; d++) {
    const daySlots = slots.filter(s => s.dayOfWeek === d);
    const times = daySlots.map(s => `${s.startTime}–${s.endTime}`).join(', ');
    msg += `*${DAY_NAMES[d]}*: ${times || '—'}\n`;
  }

  msg += '\nВыберите день для редактирования:';

  for (let d = 0; d < 7; d++) {
    kb.text(DAY_NAMES[d], `avail:day:${d}`);
  }
  kb.row();
  kb.text('⚡ Все дни', 'avail:all_days');
  kb.row();
  kb.text('🏠 Меню', 'main_menu');
  kb.text('◀️ Назад', 'main_menu');

  await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleAvailabilityCallback(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const parts = ctx.callbackQuery.data.split(':');
  if (parts[0] !== 'avail') return;
  await ctx.answerCallbackQuery();

  const tgId = ctx.from!.id;
  const action = parts[1];

  if (action === 'add') {
    const day = parseInt(parts[2]);
    sessionStore.setAvailability(tgId, {
      organizerId: '',
      action: 'add',
      dayOfWeek: day,
      waitFor: 'startTime',
    });

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(tgId) },
      include: { organizer: true },
    });

    if (!user?.organizer) return;
    const entry = sessionStore.getAvailability(tgId);
    if (entry) entry.organizerId = user.organizer.id;

    const kb = new InlineKeyboard()
      .text('🏠 Меню', 'main_menu')
      .text('❌ Отменить', 'availability');
    await ctx.editMessageText(
      `➕ Добавление времени на *${DAY_NAMES[day]}*\n\nВведите время начала (HH:mm), например 09:00:`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
    return;
  }

  if (action === 'day') {
    const day = parseInt(parts[2]);
    await showDaySlots(ctx, day);
    return;
  }

  if (action === 'all_days') {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(tgId) },
      include: { organizer: true },
    });
    if (!user?.organizer) return;

    sessionStore.setAvailability(tgId, {
      organizerId: user.organizer.id,
      action: 'add_all',
      waitFor: 'startTime',
    });

    const kb = new InlineKeyboard()
      .text('🏠 Меню', 'main_menu')
      .text('❌ Отменить', 'availability');
    await ctx.editMessageText(
      '⚡ *Добавление времени на все дни*\n\nВведите время начала (HH:mm), например 09:00:\n\n_Слот будет добавлен на все 7 дней недели._',
      { parse_mode: 'Markdown', reply_markup: kb }
    );
    return;
  }

  if (action === 'edit') {
    const slotId = parts[2];
    const slot = await prisma.availabilitySlot.findUnique({ where: { id: slotId } });
    if (!slot) {
      await ctx.editMessageText('❌ Слот не найден.');
      return;
    }

    sessionStore.setAvailability(tgId, {
      organizerId: slot.organizerId,
      action: 'edit',
      slotId,
      dayOfWeek: slot.dayOfWeek,
      waitFor: 'startTime',
    });

    const kb = new InlineKeyboard()
      .text('🏠 Меню', 'main_menu')
      .text('❌ Отменить', `avail:day:${slot.dayOfWeek}`);
    await ctx.editMessageText(
      `✏️ *Редактирование слота*\n\nТекущее: *${slot.startTime}*–*${slot.endTime}*\n\nВведите новое время начала (HH:mm), например ${slot.startTime}:`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
    return;
  }

  if (action === 'del') {
    const slotId = parts[2];
    await prisma.availabilitySlot.delete({ where: { id: slotId } });
    await ctx.editMessageText('✅ Слот удалён.');
    // Show updated availability
    const fakeCtx = { callbackQuery: { data: 'availability' }, answerCallbackQuery: () => Promise.resolve(), from: ctx.from } as any;
    await showAvailability({ ...ctx, callbackQuery: { ...ctx.callbackQuery, data: 'availability' } } as any);
    return;
  }
}

async function showDaySlots(ctx: Context, day: number) {
  const tgId = ctx.from!.id;
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: { include: { availabilitySlots: { where: { dayOfWeek: day }, orderBy: { startTime: 'asc' } } } } },
  });

  if (!user?.organizer) return;

  const slots = user.organizer.availabilitySlots;
  const kb = new InlineKeyboard();

  let msg = `🕐 *${DAY_NAMES[day]}*\n\n`;
  if (slots.length === 0) {
    msg += 'Нет рабочих часов.\n';
  } else {
    slots.forEach((s, i) => {
      msg += `${i + 1}. ${s.startTime}–${s.endTime}\n`;
      kb.text(`✏️ ${s.startTime}`, `avail:edit:${s.id}`);
      kb.text(`❌`, `avail:del:${s.id}`);
      kb.row();
    });
  }

  kb.text('➕ Добавить время', `avail:add:${day}`);
  kb.row();
  kb.text('🏠 Меню', 'main_menu');
  kb.row();
  kb.text('◀️ Назад к дням', 'availability');

  await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleAvailabilityText(ctx: Context) {
  const tgId = ctx.from?.id;
  if (!tgId || !ctx.message?.text) return;

  const entry = sessionStore.getAvailability(tgId);
  if (!entry) return;

  const text = ctx.message.text.trim();

  // Normalize time input: "9" → "09:00", "9:30" → "09:30", "09:00" → "09:00"
  function normalizeTime(input: string): string | null {
    const trimmed = input.trim();
    // HH:MM format
    const fullMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (fullMatch) {
      const h = parseInt(fullMatch[1]);
      const m = parseInt(fullMatch[2]);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
      return null;
    }
    // Just hour(s): "9", "09", "14"
    const hourOnly = trimmed.match(/^(\d{1,2})$/);
    if (hourOnly) {
      const h = parseInt(hourOnly[1]);
      if (h >= 0 && h <= 23) {
        return `${String(h).padStart(2, '0')}:00`;
      }
    }
    return null;
  }

  if (entry.waitFor === 'startTime') {
    const normalized = normalizeTime(text);
    if (!normalized) {
      await ctx.reply('⚠️ Введите время в формате HH:mm, например 9, 9:30 или 09:00:');
      return;
    }
    entry.startTime = normalized;
    entry.waitFor = 'endTime';

    const kb = new InlineKeyboard()
      .text('🏠 Меню', 'main_menu')
      .text('❌ Отменить', 'availability');
    await ctx.reply(
      `Время начала: *${normalized}*\n\nТеперь введите время окончания (HH:mm), например 18:00:`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
    return;
  }

  if (entry.waitFor === 'endTime') {
    const normalized = normalizeTime(text);
    if (!normalized) {
      await ctx.reply('⚠️ Введите время в формате HH:mm, например 18, 18:30 или 18:00:');
      return;
    }

    // Validate end > start
    if (normalized <= entry.startTime!) {
      await ctx.reply('⚠️ Время окончания должно быть позже времени начала:');
      return;
    }

    try {
      if (entry.action === 'edit' && entry.slotId) {
        await prisma.availabilitySlot.update({
          where: { id: entry.slotId },
          data: {
            startTime: entry.startTime!,
            endTime: normalized,
          },
        });
        sessionStore.delete(tgId);
        const day = entry.dayOfWeek!;
        const dayName = DAY_NAMES[day];
        await ctx.reply('✅ Слот обновлён!', {
          reply_markup: new InlineKeyboard()
            .text('🏠 Меню', 'main_menu')
            .text('🕐 Расписание', 'availability'),
        });
      } else if (entry.action === 'add_all') {
        // Create slot for all 7 days of the week
        for (let d = 0; d < 7; d++) {
          try {
            await prisma.availabilitySlot.create({
              data: {
                organizerId: entry.organizerId,
                dayOfWeek: d,
                startTime: entry.startTime!,
                endTime: normalized,
              },
            });
          } catch {
            // Skip if slot already exists for this day
          }
        }
        sessionStore.delete(tgId);
        await ctx.reply('✅ Время добавлено на все дни!', {
          reply_markup: new InlineKeyboard()
            .text('🏠 Меню', 'main_menu')
            .text('🕐 Расписание', 'availability'),
        });
      } else {
        await prisma.availabilitySlot.create({
          data: {
            organizerId: entry.organizerId,
            dayOfWeek: entry.dayOfWeek!,
            startTime: entry.startTime!,
            endTime: normalized,
          },
        });
        sessionStore.delete(tgId);
        await ctx.reply('✅ Время добавлено!', {
          reply_markup: new InlineKeyboard()
            .text('🏠 Меню', 'main_menu')
            .text('🕐 Расписание', 'availability'),
        });
      }
    } catch (err) {
      console.error('Error adding availability:', err);
      await ctx.reply('❌ Ошибка при сохранении. Возможно, такой слот уже существует.');
    }
  }
}
