import * as cron from 'node-cron';
import { prisma } from './prisma';
import { sendTelegramMessage } from './telegram';

const REMINDER_INTERVALS: Record<string, { label: string; ms: number }> = {
  BEFORE_1D: { label: 'за 1 день', ms: 24 * 60 * 60 * 1000 },
  BEFORE_3H: { label: 'за 3 часа', ms: 3 * 60 * 60 * 1000 },
  BEFORE_1H: { label: 'за 1 час', ms: 60 * 60 * 1000 },
};

export function startReminderCron() {
  // Every 5 minutes, check for reminders that need to be sent
  cron.schedule('*/5 * * * *', async () => {
    try {
      await processReminders();
    } catch (err) {
      console.error('Reminder cron error:', err);
    }
  });

  console.log('Reminder cron started (every 5 minutes)');
}

async function processReminders() {
  // Find appointments starting soon that need reminders
  const now = Date.now();

  for (const [type, config] of Object.entries(REMINDER_INTERVALS)) {
    const targetTime = new Date(now + config.ms);

    // Find appointments that start around the reminder time
    const appointments = await prisma.appointment.findMany({
      where: {
        status: 'CONFIRMED',
        startTime: {
          gte: new Date(targetTime.getTime() - 5 * 60 * 1000),  // 5 min window
          lte: new Date(targetTime.getTime() + 5 * 60 * 1000),
        },
      },
      include: {
        organizer: { include: { user: true } },
        client: true,
      },
    });

    for (const appointment of appointments) {
      // Check if reminder was already sent
      const existing = await prisma.reminder.findFirst({
        where: {
          appointmentId: appointment.id,
          type,
          status: 'SENT',
        },
      });

      if (existing) continue;

      const dateStr = appointment.startTime.toLocaleDateString('ru-RU');
      const timeStr = appointment.startTime.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const message = `⏰ *Напоминание ${config.label}*\n\nВстреча: ${dateStr} в ${timeStr}\nС: ${appointment.clientName}\nКонтакты: ${appointment.clientContact}`;

      // Send to organizer
      if (appointment.organizer?.user?.telegramId) {
        await sendTelegramMessage(
          Number(appointment.organizer.user.telegramId),
          message
        );
      }

      // Send to client if they have Telegram
      if (appointment.client?.telegramId) {
        const clientMessage = `⏰ *Напоминание ${config.label}*\n\nВстреча: ${dateStr} в ${timeStr}`;
        await sendTelegramMessage(
          Number(appointment.client.telegramId),
          clientMessage
        );
      }

      // Record sent reminder
      await prisma.reminder.create({
        data: {
          appointmentId: appointment.id,
          type,
          scheduledFor: appointment.startTime,
          sentAt: new Date(),
          status: 'SENT',
        },
      });
    }
  }
}
