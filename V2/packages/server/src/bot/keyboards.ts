import { InlineKeyboard, Keyboard } from 'grammy';
import { config } from '../config';

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

export function startKeyboard() {
  return new Keyboard()
    .text('📅 Создать календарь')
    .text('🔍 Забронировать встречу')
    .resized();
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
    .text('📍 Адрес', `add_address:${appointmentId}`)
    .text('❌ Отменить', `cancel_appointment:${appointmentId}`)
    .text('🔄 Перенести', `reschedule_appointment:${appointmentId}`);
}

export function appointmentDetailKeyboard(appointmentId: string, isOrganizer: boolean) {
  const kb = new InlineKeyboard();
  if (isOrganizer) {
    kb.text('📍 Адрес', `add_address:${appointmentId}`);
    kb.text('📝 Заметка', `edit_note:${appointmentId}`);
    kb.row();
  }
  kb.text('❌ Отменить', `cancel_appointment:${appointmentId}`);
  kb.text('🔄 Перенести', `reschedule_appointment:${appointmentId}`);
  kb.row();
  kb.text('◀️ Назад', 'my_appointments');
  kb.text('🏠 Меню', 'main_menu');
  return kb;
}

export function clientMenuKeyboard() {
  return new InlineKeyboard()
    .text('📅 Мои встречи', 'my_appointments');
}

export function bookingLinkKeyboard(slug: string) {
  const botUsername = config.botUsername || process.env['BOT_USERNAME'] || 'bot';
  const link = `https://t.me/${botUsername}?start=${slug}`;
  return new InlineKeyboard().url('📅 Записаться', link);
}
