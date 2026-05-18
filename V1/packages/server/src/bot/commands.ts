import { Bot, Context } from 'grammy';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { mainMenuKeyboard, startKeyboard, bookingWebAppKeyboard } from './keyboards';
import { generateSlug } from '../lib/slots';

export function registerCommands(bot: Bot) {
  bot.command('start', startHandler);
  bot.command('menu', menuHandler);

  // Reply keyboard button handlers
  bot.hears('📅 Создать календарь', createCalendarHandler);
  bot.hears('🔍 Забронировать встречу', bookingInfoHandler);
}

async function startHandler(ctx: Context) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const existingUser = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: true },
  });

  if (existingUser?.organizer) {
    const bookingUrl = `${config.frontendUrl}/book/${existingUser.organizer.slug}`;
    await ctx.reply(
      `👋 С возвращением, ${existingUser.firstName}!\n\nВаш календарь активен. Клиенты могут записаться через кнопку ниже:`,
      { reply_markup: bookingWebAppKeyboard(bookingUrl) }
    );
    await ctx.reply('Главное меню:', { reply_markup: mainMenuKeyboard() });
    return;
  }

  if (existingUser) {
    await ctx.reply(
      '👋 Вы уже зарегистрированы. Хотите создать календарь?',
      { reply_markup: startKeyboard() }
    );
    return;
  }

  // New user — create account
  await prisma.user.create({
    data: {
      telegramId: BigInt(tgId),
      firstName: ctx.from?.first_name || '',
      lastName: ctx.from?.last_name || '',
      telegramUsername: ctx.from?.username || null,
      languageCode: ctx.from?.language_code || null,
      role: 'ORGANIZER',
    },
  });

  await ctx.reply(
    '👋 Добро пожаловать в Telegram Booking!\n\n' +
      'Я помогу вам организовать запись на встречи через Telegram.\n\n' +
      'Нажмите "📅 Создать календарь", чтобы начать.',
    { reply_markup: startKeyboard() }
  );
}

async function menuHandler(ctx: Context) {
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

  if (!user.organizer) {
    await ctx.reply(
      'У вас ещё нет календаря. Нажмите "📅 Создать календарь" чтобы начать.',
      { reply_markup: startKeyboard() }
    );
    return;
  }

  await ctx.reply('Главное меню:', { reply_markup: mainMenuKeyboard() });
}

async function createCalendarHandler(ctx: Context) {
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

  if (user.organizer) {
    await ctx.reply(
      `✅ Ваш календарь уже создан!\n\nСсылка для бронирования:\n${config.frontendUrl}/book/${user.organizer.slug}`,
      { reply_markup: mainMenuKeyboard() }
    );
    return;
  }

  // Auto-create calendar based on Telegram name
  const firstName = ctx.from?.first_name || 'Пользователь';
  const title = `${firstName}'s Calendar`;
  const slug = generateSlug(title);

  await prisma.organizer.create({
    data: {
      userId: user.id,
      slug,
      title,
    },
  });

  const bookingUrl = `${config.frontendUrl}/book/${slug}`;
  await ctx.reply(
    `🎉 Календарь создан!\n\n` +
      `Название: *${title}*\n\n` +
      `Поделитесь кнопкой ниже с клиентами, чтобы они могли записаться прямо в Telegram:`,
    { parse_mode: 'Markdown', reply_markup: bookingWebAppKeyboard(bookingUrl) }
  );
  await ctx.reply('Используйте меню для настройки расписания и параметров.', {
    reply_markup: mainMenuKeyboard(),
  });
}

async function bookingInfoHandler(ctx: Context) {
  await ctx.reply(
    '🔍 Чтобы забронировать встречу, перейдите по ссылке организатора.\n\n' +
      'Если вы организатор — используйте "📅 Создать календарь" и поделитесь своей ссылкой с клиентами.'
  );
}
