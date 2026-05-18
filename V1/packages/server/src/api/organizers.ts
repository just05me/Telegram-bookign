import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { generateSlug } from '../lib/slots';
import { checkRateLimit } from '../lib/rate-limit';

export const organizersRouter = Router();

// GET /api/organizers/by-telegram/:telegramId — look up organizer by Telegram user ID
// Must be registered BEFORE the :slug wildcard route
organizersRouter.get('/by-telegram/:telegramId', async (req: Request, res: Response) => {
  try {
    const telegramId = req.params.telegramId as string;

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      include: { organizer: true },
    });

    if (!user?.organizer) {
      res.status(404).json({ error: 'Organizer not found' });
      return;
    }

    res.json({ id: user.organizer.id, slug: user.organizer.slug, title: user.organizer.title });
  } catch (err) {
    console.error('GET /organizers/by-telegram/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/organizers/:slug
organizersRouter.get('/:slug', async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const organizer = await prisma.organizer.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        defaultDuration: true,
        bookingDeadlineDays: true,
        timezone: true,
        isActive: true,
        bookingOptionGroups: {
          where: { isActive: true },
          include: { choices: { orderBy: { sortOrder: 'asc' }, select: { id: true, label: true } } },
        },
      },
    });

    if (!organizer || !organizer.isActive) {
      res.status(404).json({ error: 'Organizer not found' });
      return;
    }

    res.json(organizer);
  } catch (err) {
    console.error('GET /organizers/:slug error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/organizers
organizersRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { telegramId, title, timezone } = req.body as {
      telegramId: string;
      title: string;
      timezone?: string;
    };

    if (!telegramId || !title) {
      res.status(400).json({ error: 'telegramId and title required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.role !== 'ORGANIZER') {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ORGANIZER' },
      });
    }

    const existing = await prisma.organizer.findUnique({
      where: { userId: user.id },
    });
    if (existing) {
      res.status(409).json({ error: 'Organizer already exists', slug: existing.slug });
      return;
    }

    const slug = generateSlug(title);

    const organizer = await prisma.organizer.create({
      data: {
        userId: user.id,
        slug,
        title,
        timezone: timezone || 'UTC',
      },
    });

    res.status(201).json(organizer);
  } catch (err) {
    console.error('POST /organizers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/organizers/:id/settings
organizersRouter.post('/:id/settings', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const data = req.body as {
      title?: string;
      description?: string;
      defaultDuration?: number;
      bufferBefore?: number;
      bufferAfter?: number;
      maxMeetingsPerDay?: number;
      bookingDeadlineDays?: number;
      timezone?: string;
    };

    const organizer = await prisma.organizer.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.defaultDuration !== undefined && { defaultDuration: data.defaultDuration }),
        ...(data.bufferBefore !== undefined && { bufferBefore: data.bufferBefore }),
        ...(data.bufferAfter !== undefined && { bufferAfter: data.bufferAfter }),
        ...(data.maxMeetingsPerDay !== undefined && { maxMeetingsPerDay: data.maxMeetingsPerDay }),
        ...(data.bookingDeadlineDays !== undefined && { bookingDeadlineDays: data.bookingDeadlineDays }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
      },
    });

    res.json(organizer);
  } catch (err) {
    console.error('POST /organizers/:id/settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/organizers/:id/availability
organizersRouter.post('/:id/availability', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { slots } = req.body as { slots: { dayOfWeek: number; startTime: string; endTime: string }[] };

    if (!Array.isArray(slots)) {
      res.status(400).json({ error: 'slots array required' });
      return;
    }

    await prisma.availabilitySlot.deleteMany({ where: { organizerId: id } });

    if (slots.length > 0) {
      await prisma.availabilitySlot.createMany({
        data: slots.map((s) => ({
          organizerId: id,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
      });
    }

    const created = await prisma.availabilitySlot.findMany({ where: { organizerId: id } });
    res.json(created);
  } catch (err) {
    console.error('POST /organizers/:id/availability error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/organizers/:id/appointments
organizersRouter.get('/:id/appointments', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const appointments = await prisma.appointment.findMany({
      where: { organizerId: id },
      orderBy: { startTime: 'desc' },
    });

    res.json(appointments);
  } catch (err) {
    console.error('GET /organizers/:id/appointments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
