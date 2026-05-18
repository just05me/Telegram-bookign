import { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { prisma } from '../lib/prisma';
import { sessionStore } from '../lib/session';

export async function showOptionsList(ctx: Context) {
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
            orderBy: { createdAt: 'asc' },
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
  const kb = new InlineKeyboard();

  if (groups.length === 0) {
    await ctx.editMessageText(
      '🎯 *Опции бронирования*\n\nУ вас пока нет опций. Опции — это дополнительные услуги, которые клиент выбирает при записи.\n\nНажмите "➕ Создать", чтобы добавить:',
      { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('➕ Создать', 'opt:new').text('🏠 Меню', 'main_menu').text('◀️ Назад', 'main_menu') }
    );
    return;
  }

  let msg = '🎯 *Опции бронирования:*\n\n';
  groups.forEach((g, i) => {
    const choices = g.choices.map(c => `  • ${c.label}`).join('\n');
    msg += `*${i + 1}. ${g.title}*\n${choices}\n\n`;
  });

  groups.forEach(g => {
    kb.text(`✏️ ${g.title}`, `opt:edit:${g.id}`);
  });
  kb.row();
  kb.text('➕ Новая', 'opt:new');
  kb.text('🏠 Меню', 'main_menu');
  kb.text('◀️ Назад', 'main_menu');

  await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleOptionsCallback(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const parts = ctx.callbackQuery.data.split(':');
  if (parts[0] !== 'opt') return;
  await ctx.answerCallbackQuery();

  const tgId = ctx.from!.id;
  const action = parts[1];

  if (action === 'new') {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(tgId) },
      include: {
        organizer: {
          include: {
            bookingOptionGroups: {
              include: { choices: { orderBy: { sortOrder: 'asc' } } },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
    if (!user?.organizer) {
      await ctx.reply('Сначала создайте календарь.');
      return;
    }

    // Reuse existing group or create a new one
    const groups = user.organizer.bookingOptionGroups;
    const existingGroup = groups[0];
    const isNew = !existingGroup;
    const group = existingGroup ?? await prisma.bookingOptionGroup.create({
      data: {
        organizerId: user.organizer.id,
        title: 'Услуги',
      },
    });

    sessionStore.setOptions(tgId, {
      organizerId: user.organizer.id,
      action: 'new_group',
      groupId: group.id,
      waitFor: 'choice_label',
      choices: [],
    });

    const kb = new InlineKeyboard()
      .text('⏭ Завершить', `opt:done_choices:${group.id}`)
      .text('🏠 Меню', 'main_menu')
      .text('❌ Отменить', 'options_list');

    const title = isNew ? '✅ *Группа создана!*\n\n' : '';
    await ctx.editMessageText(
      `${title}Теперь добавьте варианты (по одному).\n\nВведите первый вариант:`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
    return;
  }

  if (action === 'edit') {
    const groupId = parts[2];
    await showOptionsEditMenu(ctx, groupId);
    return;
  }

  if (action === 'rename') {
    const groupId = parts[2];
    sessionStore.setOptions(tgId, {
      organizerId: '',
      action: 'edit_title',
      groupId,
      waitFor: 'title',
      choices: [],
    });

    const group = await prisma.bookingOptionGroup.findUnique({ where: { id: groupId } });
    if (!group) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(tgId) },
      include: { organizer: true },
    });
    if (user?.organizer) {
      const entry = sessionStore.getOptions(tgId);
      if (entry) entry.organizerId = user.organizer.id;
    }

    const kb = new InlineKeyboard()
      .text('🏠 Меню', 'main_menu')
      .text('❌ Отменить', `opt:edit:${groupId}`);
    await ctx.editMessageText(
      `✏️ *Изменение названия*\n\nТекущее: *${group.title}*\n\nВведите новое название:`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
    return;
  }

  if (action === 'addchoice') {
    const groupId = parts[2];
    sessionStore.setOptions(tgId, {
      organizerId: '',
      action: 'add_choice',
      groupId,
      waitFor: 'choice_label',
      choices: [],
    });

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(tgId) },
      include: { organizer: true },
    });
    if (user?.organizer) {
      const entry = sessionStore.getOptions(tgId);
      if (entry) entry.organizerId = user.organizer.id;
    }

    const group = await prisma.bookingOptionGroup.findUnique({
      where: { id: groupId },
      include: { choices: true },
    });

    let msg = `➕ *Добавление варианта*\n\nГруппа: *${group?.title}*\n`;
    if (group?.choices && group.choices.length > 0) {
      msg += `\nТекущие варианты:\n${group.choices.map((c, i) => `${i + 1}. ${c.label}`).join('\n')}`;
    }
    msg += '\n\nВведите название нового варианта:';

    const kb = new InlineKeyboard()
      .text('🏠 Меню', 'main_menu')
      .text('❌ Отменить', `opt:edit:${groupId}`);
    await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: kb });
    return;
  }

  if (action === 'delete') {
    const groupId = parts[2];

    const kb = new InlineKeyboard()
      .text('✅ Да, удалить', `opt:confirm_delete:${groupId}`)
      .text('❌ Нет', `opt:edit:${groupId}`);

    await ctx.editMessageText('⚠️ *Удалить эту группу опций?*\n\nЭто действие нельзя отменить.', {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
    return;
  }

  if (action === 'confirm_delete') {
    const groupId = parts[2];

    try {
      // Clear appointment references
      await prisma.appointment.updateMany({
        where: {
          selectedChoiceId: {
            in: (await prisma.bookingOptionChoice.findMany({ where: { groupId }, select: { id: true } })).map(c => c.id),
          },
        },
        data: { selectedChoiceId: null },
      });

      await prisma.bookingOptionGroup.delete({ where: { id: groupId } });
      const menuKb = new InlineKeyboard().text('🏠 Меню', 'main_menu');
      await ctx.editMessageText('✅ Группа опций удалена.', { reply_markup: menuKb });
    } catch {
      await ctx.editMessageText('❌ Ошибка при удалении.');
    }
    return;
  }

  if (action === 'done_choices') {
    sessionStore.delete(tgId);
    await showOptionsList(ctx);
    return;
  }
}

async function showOptionsEditMenu(ctx: Context, groupId: string) {
  const group = await prisma.bookingOptionGroup.findUnique({
    where: { id: groupId },
    include: { choices: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!group) {
    await ctx.editMessageText('❌ Группа не найдена.');
    return;
  }

  const choices = group.choices.map((c, i) => `${i + 1}. ${c.label}`).join('\n');
  const kb = new InlineKeyboard()
    .text('✏️ Название', `opt:rename:${groupId}`)
    .text('➕ Вариант', `opt:addchoice:${groupId}`)
    .row()
    .text('❌ Удалить', `opt:delete:${groupId}`)
    .text('🏠 Меню', 'main_menu')
    .text('◀️ Назад', 'options_list');

  await ctx.editMessageText(
    `🎯 *${group.title}*\n\nВарианты:\n${choices || '(нет вариантов)'}\n\nВыберите действие:`,
    { parse_mode: 'Markdown', reply_markup: kb }
  );
}

export async function handleOptionsText(ctx: Context) {
  const tgId = ctx.from?.id;
  if (!tgId || !ctx.message?.text) return;

  const session = sessionStore.getOptions(tgId);
  if (!session) return;

  const text = ctx.message.text.trim();

  if (session.waitFor === 'title' && session.action === 'edit_title') {
    if (text.length < 1 || text.length > 100) {
      await ctx.reply('⚠️ Название должно быть от 1 до 100 символов:');
      return;
    }

    await prisma.bookingOptionGroup.update({
      where: { id: session.groupId },
      data: { title: text },
    });
    sessionStore.delete(tgId);
    await ctx.reply('✅ Название обновлено!', {
      reply_markup: new InlineKeyboard()
        .text('🏠 Меню', 'main_menu')
        .text('🎯 Опции', 'options_list'),
    });
    return;
  }

  if (session.waitFor === 'choice_label') {
    if (text.length < 1) {
      await ctx.reply('⚠️ Название варианта не может быть пустым:');
      return;
    }

    if (session.groupId) {
      const count = await prisma.bookingOptionChoice.count({ where: { groupId: session.groupId } });

      await prisma.bookingOptionChoice.create({
        data: {
          groupId: session.groupId,
          label: text,
          sortOrder: count,
        },
      });

      session.choices.push(text);

      const kb = new InlineKeyboard()
        .text('➕ Ещё вариант', `opt:add_another:${session.groupId}`)
        .text('⏭ Завершить', `opt:done_choices:${session.groupId}`)
        .text('🏠 Меню', 'main_menu')
        .text('❌ Отменить', 'options_list');

      await ctx.reply(`✅ Добавлено: "${text}"\n\nМожете добавить ещё или завершить:`, {
        reply_markup: kb,
      });

      session.waitFor = 'choice_label';
    }
  }
}

export async function handleOptionsAddAnother(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;
  const parts = ctx.callbackQuery.data.split(':');
  if (parts[0] !== 'opt' || parts[1] !== 'add_another') return;
  await ctx.answerCallbackQuery();

  const tgId = ctx.from!.id;
  const groupId = parts[2];

  const entry = sessionStore.getOptions(tgId);
  if (entry) {
    entry.waitFor = 'choice_label';
  }

  const kb = new InlineKeyboard()
    .text('⏭ Завершить', `opt:done_choices:${groupId}`)
    .text('🏠 Меню', 'main_menu')
    .text('❌ Отменить', 'options_list');

  await ctx.editMessageText('Введите следующий вариант:', { reply_markup: kb });
}
