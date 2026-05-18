import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { checkRateLimit } from '../lib/rate-limit';
import { sendTelegramMessage } from '../lib/telegram';

export const appointmentsRouter = Router();

// POST /api/appointments — create booking
appointmentsRouter.post('/', async (req: Request, res: Response) => {
  try {
    // Rate limit: 10 per minute per IP
    const ip = req.ip || 'unknown';
    const limit = checkRateLimit(`booking:${ip}`, 10, 60_000);
    if (!limit.allowed) {
      res.status(429).json({ error: 'Too many requests. Try again later.' });
      return;
    }

    const { organizerId, clientName, clientContact, startTime, duration, clientNote, instagram, clientTelegram, phoneNumber, participantsCount, selectedChoiceId } = req.body as {
      organizerId: string;
      clientName: string;
      clientContact: string;
      startTime: string;
      duration: number;
      clientNote?: string;
      instagram?: string;
      clientTelegram?: string;
      phoneNumber?: string;
      participantsCount?: number;
      selectedChoiceId?: string;
    };

    if (!organizerId || !clientName || !clientContact || !startTime || !duration) {
      res.status(400).json({ error: 'Missing required fields: organizerId, clientName, clientContact, startTime, duration' });
      return;
    }

    // Verify organizer exists and get settings
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      include: { user: true },
    });

    if (!organizer || !organizer.isActive) {
      res.status(404).json({ error: 'Organizer not found or inactive' });
      return;
    }

    const start = new Date(startTime);
    const end = new Date(start.getTime() + duration * 60000);

    // Race condition check: verify slot is still available
    const conflicting = await prisma.appointment.findFirst({
      where: {
        organizerId,
        status: { in: ['CONFIRMED', 'RESCHEDULE_REQUESTED'] },
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });

    if (conflicting) {
      res.status(409).json({ error: 'This time slot is no longer available' });
      return;
    }

    // Check daily limit
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(start);
    dayEnd.setHours(23, 59, 59, 999);

    const dayCount = await prisma.appointment.count({
      where: {
        organizerId,
        status: { not: 'CANCELLED' },
        startTime: { gte: dayStart, lte: dayEnd },
      },
    });

    if (dayCount >= organizer.maxMeetingsPerDay) {
      res.status(409).json({ error: 'Daily limit reached for this organizer' });
      return;
    }

    const appointment = await prisma.appointment.create({
      data: {
        organizerId,
        clientName,
        clientContact,
        clientNote: clientNote || null,
        instagram: instagram || null,
        clientTelegram: clientTelegram || null,
        phoneNumber: phoneNumber || null,
        participantsCount: participantsCount || 1,
        selectedChoiceId: selectedChoiceId || null,
        startTime: start,
        endTime: end,
        duration,
      },
    });

    // Notify organizer via Telegram
    const dateStr = start.toLocaleDateString('ru-RU');
    const timeStr = start.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    let message = `📅 *Новая встреча*\n\n${clientName}`;
    if (clientTelegram) message += `\nTelegram: ${clientTelegram}`;
    if (phoneNumber) message += `\nТел: ${phoneNumber}`;
    if (instagram) message += `\nInstagram: ${instagram}`;
    message += `\n${dateStr} в ${timeStr}\nДлительность: ${duration} мин`;
    if (participantsCount && participantsCount > 1) message += `\nУчастников: ${participantsCount}`;
    if (clientNote) message += `\nЗаметка: ${clientNote}`;

    // Add selected choice if any
    if (selectedChoiceId) {
      const choice = await prisma.bookingOptionChoice.findUnique({ where: { id: selectedChoiceId }, include: { group: true } });
      if (choice) {
        message += `\n${choice.group.title}: ${choice.label}`;
      }
    }

    await sendTelegramMessage(Number(organizer.user.telegramId), message);

    res.status(201).json(appointment);
  } catch (err) {
    console.error('POST /appointments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/appointments/:id
appointmentsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const appointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    res.json(appointment);
  } catch (err) {
    console.error('GET /appointments/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appointments/:id/cancel
appointmentsRouter.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { requestedBy, reason } = req.body as { requestedBy?: string; reason?: string };

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { organizer: { include: { user: true } }, client: true },
    });

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    await prisma.appointment.update({
      where: { id },
      data: {
        status: 'CANCELLATION_REQUESTED',
        cancellationRequestedBy: requestedBy || 'CLIENT',
        cancellationReason: reason || null,
      },
    });

    if (requestedBy === 'CLIENT' && appointment.organizer?.user?.telegramId) {
      await sendTelegramMessage(
        Number(appointment.organizer.user.telegramId),
        `⏳ Клиент ${appointment.clientName} хочет отменить встречу ${new Date(appointment.startTime).toLocaleDateString('ru-RU')}.\nПричина: ${reason || 'не указана'}\n\nПодтвердите отмену в боте.`
      );
    }

    res.json({ success: true, status: 'CANCELLATION_REQUESTED' });
  } catch (err) {
    console.error('POST /appointments/:id/cancel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appointments/:id/confirm-cancel
appointmentsRouter.post('/:id/confirm-cancel', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { organizer: { include: { user: true } }, client: true },
    });

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    await prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    const message = `✅ Встреча ${new Date(appointment.startTime).toLocaleDateString('ru-RU')} отменена.`;
    if (appointment.organizer?.user?.telegramId) {
      await sendTelegramMessage(Number(appointment.organizer.user.telegramId), message);
    }
    if (appointment.client?.telegramId) {
      await sendTelegramMessage(Number(appointment.client.telegramId), message);
    }

    res.json({ success: true, status: 'CANCELLED' });
  } catch (err) {
    console.error('POST /appointments/:id/confirm-cancel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appointments/:id/reschedule
appointmentsRouter.post('/:id/reschedule', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { newStartTime } = req.body as { newStartTime?: string };

    if (!newStartTime) {
      res.status(400).json({ error: 'newStartTime required' });
      return;
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { organizer: { include: { user: true } } },
    });

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    const newStart = new Date(newStartTime);
    const newEnd = new Date(newStart.getTime() + appointment.duration * 60000);

    // Check conflict
    const conflicting = await prisma.appointment.findFirst({
      where: {
        organizerId: appointment.organizerId,
        status: { in: ['CONFIRMED', 'RESCHEDULE_REQUESTED'] },
        id: { not: id },
        startTime: { lt: newEnd },
        endTime: { gt: newStart },
      },
    });

    if (conflicting) {
      res.status(409).json({ error: 'Selected time slot is no longer available' });
      return;
    }

    await prisma.appointment.update({
      where: { id },
      data: {
        status: 'RESCHEDULE_REQUESTED',
        rescheduleTargetTime: newStart,
      },
    });

    if (appointment.organizer?.user?.telegramId) {
      const dateStr = newStart.toLocaleDateString('ru-RU');
      const timeStr = newStart.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      await sendTelegramMessage(
        Number(appointment.organizer.user.telegramId),
        `🔄 Клиент хочет перенести встречу на ${dateStr} ${timeStr}.\n\nПодтвердите или отклоните в боте.`
      );
    }

    res.json({ success: true, status: 'RESCHEDULE_REQUESTED' });
  } catch (err) {
    console.error('POST /appointments/:id/reschedule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appointments/:id/confirm-reschedule
appointmentsRouter.post('/:id/confirm-reschedule', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const appointment = await prisma.appointment.findUnique({ where: { id } });

    if (!appointment?.rescheduleTargetTime) {
      res.status(400).json({ error: 'No reschedule target time set' });
      return;
    }

    const end = new Date(appointment.rescheduleTargetTime.getTime() + appointment.duration * 60000);

    await prisma.appointment.update({
      where: { id },
      data: {
        status: 'RESCHEDULED',
        startTime: appointment.rescheduleTargetTime,
        endTime: end,
        rescheduleTargetTime: null,
      },
    });

    res.json({ success: true, status: 'RESCHEDULED' });
  } catch (err) {
    console.error('POST /appointments/:id/confirm-reschedule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
