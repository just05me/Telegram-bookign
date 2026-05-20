import { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { prisma } from '../lib/prisma';
import { sessionStore } from '../lib/session';
import { escMarkdown } from '../lib/escape';

const SETTINGS_FIELDS = [
  { key: 'title', label: 'Название', min: 1, max: 100 },
  { key: 'description', label: 'Описание', min: 0, max: 500 },
  { key: 'defaultDuration', label: 'Длительность (мин)', min: 15, max: 120 },
  { key: 'bufferBefore', label: 'Буфер до (мин)', min: 0, max: 60 },
  { key: 'bufferAfter', label: 'Буфер после (мин)', min: 0, max: 60 },
  { key: 'maxMeetingsPerDay', label: 'Макс. встреч/день', min: 1, max: 50 },
  { key: 'bookingDeadlineDays', label: 'Дней для брони', min: 1, max: 365 },
] as const;

export async function showSettings(ctx: Context) {
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
  const kb = new InlineKeyboard()
    .text('✏️ Название', 'set:edit:title')
    .text('✏️ Описание', 'set:edit:description')
    .row()
    .text(`⏱ ${o.defaultDuration} мин`, `set:edit:defaultDuration`)
    .row()
    .text(`📥 Буфер до: ${o.bufferBefore} мин`, `set:edit:bufferBefore`)
    .text(`📤 Буфер после: ${o.bufferAfter} мин`, `set:edit:bufferAfter`)
    .row()
    .text(`📊 Макс/день: ${o.maxMeetingsPerDay}`, `set:edit:maxMeetingsPerDay`)
    .text(`📅 Дней: ${o.bookingDeadlineDays}`, `set:edit:bookingDeadlineDays`)
    .row()
    .text('🏠 Меню', 'main_menu')
    .text('◀️ Назад', 'main_menu');

  await ctx.editMessageText(
    `⚙️ *Настройки календаря*\n\n` +
      `Название: ${escMarkdown(o.title)}\n` +
      `Описание: ${escMarkdown(o.description) || '(нет)'}\n` +
      `Длительность: ${o.defaultDuration} мин\n` +
      `Буфер до: ${o.bufferBefore} мин\n` +
      `Буфер после: ${o.bufferAfter} мин\n` +
      `Макс. встреч в день: ${o.maxMeetingsPerDay}\n` +
      `Дней для брони: ${o.bookingDeadlineDays}\n` +
      `Нажмите на параметр, чтобы изменить:`,
    { parse_mode: 'Markdown', reply_markup: kb }
  );
}

export async function handleSettingsEdit(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const parts = ctx.callbackQuery.data.split(':');
  if (parts[0] !== 'set' || parts[1] !== 'edit') return;
  await ctx.answerCallbackQuery();

  const tgId = ctx.from!.id;
  const field = parts[2] as typeof SETTINGS_FIELDS[number]['key'];

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: true },
  });

  if (!user?.organizer) {
    await ctx.reply('Сначала создайте календарь.');
    return;
  }

  const setting = SETTINGS_FIELDS.find(s => s.key === field);
  if (!setting) return;

  sessionStore.setSettings(tgId, {
    organizerId: user.organizer.id,
    field: field as any,
  });

  const currentValue = (user.organizer as any)[field] || '';
  const kb = new InlineKeyboard().text('🏠 Меню', 'main_menu').text('❌ Отменить', 'settings');

  await ctx.editMessageText(
    `✏️ *Изменить ${setting.label.toLowerCase()}*\n\n` +
      `Текущее значение: *${currentValue}*\n\n` +
      `Введите новое значение (${setting.min}-${setting.max}):`,
    { parse_mode: 'Markdown', reply_markup: kb }
  );
}

export async function handleSettingsText(ctx: Context) {
  const tgId = ctx.from?.id;
  if (!tgId || !ctx.message?.text) return;

  const entry = sessionStore.getSettings(tgId);
  if (!entry) return;

  const text = ctx.message.text.trim();
  const setting = SETTINGS_FIELDS.find(s => s.key === entry.field);
  if (!setting) return;

  let value: string | number = text;

  // Validate numeric fields
  if (['defaultDuration', 'bufferBefore', 'bufferAfter', 'maxMeetingsPerDay', 'bookingDeadlineDays'].includes(entry.field)) {
    const num = parseInt(text);
    if (isNaN(num) || num < setting.min || num > setting.max) {
      await ctx.reply(`⚠️ Введите число от ${setting.min} до ${setting.max}:`);
      return;
    }
    value = num;
  } else if (entry.field === 'title') {
    if (text.length < 1 || text.length > 100) {
      await ctx.reply('⚠️ Название должно быть от 1 до 100 символов:');
      return;
    }
  } else if (entry.field === 'description') {
    if (text.length > 500) {
      await ctx.reply('⚠️ Описание должно быть до 500 символов:');
      return;
    }
  }

  try {
    await prisma.organizer.update({
      where: { id: entry.organizerId },
      data: { [entry.field]: value },
    });

    sessionStore.delete(tgId);
    await ctx.reply('✅ Настройка сохранена!', {
      reply_markup: new InlineKeyboard()
        .text('🏠 Меню', 'main_menu')
        .text('⚙️ Настройки', 'settings'),
    });
  } catch (err) {
    console.error('Error updating settings:', err);
    await ctx.reply('❌ Ошибка при сохранении.');
  }
}

