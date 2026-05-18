import { InlineKeyboard, Keyboard } from 'grammy';

export function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text('📅 Мои встречи', 'my_appointments')
    .text('⚙️ Настройки', 'settings')
    .row()
    .text('🕐 Расписание', 'availability')
    .text('🔗 Моя ссылка', 'my_link')
    .row()
    .text('🎯 Опции', 'options_list')
    .text('📊 Статистика', 'stats');
}

export function bookingWebAppKeyboard(bookingUrl: string) {
  return new InlineKeyboard().webApp('📅 Открыть календарь', bookingUrl);
}

export function optionsListKeyboard(groups: { id: string; title: string }[]) {
  const kb = new InlineKeyboard();
  groups.forEach((g) => {
    kb.text(`✏️ ${g.title}`, `options_edit:${g.id}`);
    kb.row();
  });
  kb.text('➕ Новая опция', 'options_new');
  return kb;
}

export function optionsManageKeyboard(groupId: string) {
  return new InlineKeyboard()
    .text('✏️ Название', `options_rename:${groupId}`)
    .text('➕ Вариант', `options_add_choice:${groupId}`)
    .row()
    .text('❌ Удалить', `options_delete:${groupId}`)
    .text('← Назад', 'options_list');
}

export function confirmCancelKeyboard(appointmentId: string) {
  return new InlineKeyboard()
    .text('✅ Подтвердить отмену', `confirm_cancel:${appointmentId}`)
    .text('❌ Отклонить', `reject_cancel:${appointmentId}`);
}

export function confirmRescheduleKeyboard(appointmentId: string) {
  return new InlineKeyboard()
    .text('✅ Подтвердить перенос', `confirm_reschedule:${appointmentId}`)
    .text('❌ Отклонить', `reject_reschedule:${appointmentId}`);
}

export function appointmentActionsKeyboard(appointmentId: string) {
  return new InlineKeyboard()
    .text('❌ Отменить', `cancel_appointment:${appointmentId}`)
    .text('🔄 Перенести', `reschedule_appointment:${appointmentId}`);
}

export function startKeyboard() {
  return new Keyboard()
    .text('📅 Создать календарь')
    .text('🔍 Забронировать встречу')
    .resized();
}
