import { Bot, Context, InlineKeyboard } from 'grammy';
import { prisma } from '../lib/prisma';
import { mainMenuKeyboard, startKeyboard, bookingLinkKeyboard, clientMenuKeyboard } from './keyboards';
import { generateSlug } from '../lib/slots';
import { startBooking } from './booking';

export function registerCommands(bot: Bot) {
  bot.command('start', startHandler);
  bot.command('menu', menuHandler);
  bot.command('book', bookCommandHandler);
  bot.command('my_bookings', myBookingsHandler);

  // Role selection callbacks (new user registration)
  bot.callbackQuery(/^role:organizer$/, roleOrganizerHandler);
  bot.callbackQuery(/^role:client$/, roleClientHandler);

  // Reply keyboard button handlers
  bot.hears('📅 Создать календарь', createCalendarHandler);
  bot.hears('🔍 Забронировать встречу', bookingInfoHandler);
}

async function startHandler(ctx: Context) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  // Check if there's a deep link parameter (e.g., /start <slug>)
  const args = ctx.match as string | undefined;
  if (args) {
    // Try to start booking flow with slug
    const organizer = await prisma.organizer.findUnique({
      where: { slug: args.trim(), isActive: true },
    });
    if (organizer) {
      await startBooking(ctx, args.trim());
      return;
    }
  }

  const existingUser = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
    include: { organizer: true },
  });

  if (existingUser?.organizer) {
    const slug = existingUser.organizer.slug;
    await ctx.reply(
      `👋 С возвращением, ${existingUser.firstName}!\n\nВаш календарь активен. Клиенты могут записаться через ссылку:\n\nhttps://t.me/${ctx.me.username}?start=${slug}`,
      { reply_markup: bookingLinkKeyboard(slug) }
    );
    await ctx.reply('Главное меню:', { reply_markup: mainMenuKeyboard() });
    return;
  }

  if (existingUser) {
    if (existingUser.role === 'CLIENT') {
      await ctx.reply('👋 Добро пожаловать!', {
        reply_markup: clientMenuKeyboard(),
      });
      return;
    }
    await ctx.reply(
      '👋 Вы уже зарегистрированы. Хотите создать календарь?',
      { reply_markup: startKeyboard() }
    );
    return;
  }

  // New user — show role selection
  const roleKb = new InlineKeyboard()
    .text('👤 Стать организатором', 'role:organizer')
    .text('📅 Записаться на встречу', 'role:client');

  await ctx.reply(
    '👋 *Добро пожаловать в Telegram Booking!*\n\n' +
      'Я помогу вам записываться на встречи или организовать свой календарь.\n\n' +
      'Кем вы хотите быть?',
    { parse_mode: 'Markdown', reply_markup: roleKb }
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
    if (user.role === 'CLIENT') {
      await ctx.reply('👋 Ваше меню:', { reply_markup: clientMenuKeyboard() });
      return;
    }
    await ctx.reply(
      'У вас ещё нет календаря. Нажмите "📅 Создать календарь" чтобы начать.',
      { reply_markup: startKeyboard() }
    );
    return;
  }

  await ctx.reply('Главное меню:', { reply_markup: mainMenuKeyboard() });
}

async function bookCommandHandler(ctx: Context) {
  const args = ctx.match as string | undefined;
  if (!args) {
    await ctx.reply(
      'ℹ️ Использование: /book <ссылка_организатора>\n\n' +
      'Например: /book имя-организатора'
    );
    return;
  }

  await startBooking(ctx, args.trim());
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
    const slug = user.organizer.slug;
    await ctx.reply(
      `✅ Ваш календарь уже создан!\n\nСсылка для бронирования:\nhttps://t.me/${ctx.me.username}?start=${slug}`,
      { reply_markup: mainMenuKeyboard() }
    );
    return;
  }

  // Auto-create calendar based on Telegram name
  const firstName = ctx.from?.first_name || 'Пользователь';
  const title = `Календарь ${firstName}`;
  const slug = generateSlug(title);

  await prisma.organizer.create({
    data: {
      userId: user.id,
      slug,
      title,
    },
  });

  await ctx.reply(
    `🎉 Календарь создан!\n\n` +
      `Название: *${title}*\n\n` +
      `Поделитесь этой ссылкой с клиентами:\nhttps://t.me/${ctx.me.username}?start=${slug}\n\n` +
      `Клиенты смогут записаться прямо в этом боте.`,
    { parse_mode: 'Markdown', reply_markup: bookingLinkKeyboard(slug) }
  );
  await ctx.reply('Используйте меню для настройки расписания и параметров.', {
    reply_markup: mainMenuKeyboard(),
  });
}

async function roleOrganizerHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});

  const tgId = ctx.from?.id;
  if (!tgId) return;

  const existing = await prisma.user.findUnique({ where: { telegramId: BigInt(tgId) } });
  if (existing) {
    await ctx.reply('Вы уже зарегистрированы.');
    return;
  }

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
    '👋 Вы выбрали роль организатора!\n\n' +
      'Нажмите "📅 Создать календарь", чтобы начать.',
    { reply_markup: startKeyboard() }
  );
}

async function roleClientHandler(ctx: Context) {
  if (!ctx.callbackQuery) return;
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});

  const tgId = ctx.from?.id;
  if (!tgId) return;

  const existing = await prisma.user.findUnique({ where: { telegramId: BigInt(tgId) } });
  if (existing) {
    await ctx.reply('Вы уже зарегистрированы.');
    return;
  }

  await prisma.user.create({
    data: {
      telegramId: BigInt(tgId),
      firstName: ctx.from?.first_name || '',
      lastName: ctx.from?.last_name || '',
      telegramUsername: ctx.from?.username || null,
      languageCode: ctx.from?.language_code || null,
      role: 'CLIENT',
    },
  });

  await ctx.reply(
    '👋 Вы выбрали роль участника!\n\n' +
      'Попросите у организатора ссылку на бота, чтобы записаться на встречу.\n\n' +
      'Или воспользуйтесь командой /book <slug> для бронирования.',
    { reply_markup: new InlineKeyboard().text('🏠 Меню', 'main_menu') }
  );
}

async function myBookingsHandler(ctx: Context) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgId) },
  });

  if (!user) {
    await ctx.reply('Пожалуйста, начните с команды /start');
    return;
  }

  const appointments = await prisma.appointment.findMany({
    where: { clientId: user.id, status: { not: 'CANCELLED' } },
    orderBy: { startTime: 'asc' },
    include: { organizer: true },
    take: 20,
  });

  if (appointments.length === 0) {
    await ctx.reply(
      '📅 У вас нет предстоящих встреч. Используйте ссылку организатора, чтобы записаться.',
      { reply_markup: new InlineKeyboard().text('🏠 Меню', 'main_menu') }
    );
    return;
  }

  const kb = new InlineKeyboard();
  for (const a of appointments) {
    const date = new Date(a.startTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' });
    const time = new Date(a.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    kb.text(`📅 ${date} ${time} — ${a.organizer?.title || 'Встреча'}`, `appt_detail:${a.id}`);
    kb.row();
  }
  kb.text('🏠 Меню', 'main_menu');

  await ctx.reply('📅 *Мои записи:*\nНажмите на встречу для подробностей.', {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

async function bookingInfoHandler(ctx: Context) {
  await ctx.reply(
    '🔍 *Как забронировать встречу*\n\n' +
      '1. Организатор отправляет вам ссылку на своего бота\n' +
      '2. Нажмите на ссылку или откройте бота\n' +
      '3. Выберите дату и время\n' +
      '4. Заполните форму\n' +
      '5. Готово! ✅\n\n' +
      'Если вы организатор — используйте "📅 Создать календарь" и настройте своё расписание.'
  );
}
