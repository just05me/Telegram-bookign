import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { generateAvailableSlots } from '../lib/slots';

export const slotsRouter = Router();

// GET /api/organizers/:slug/slots?date=YYYY-MM-DD&timezone=...
slotsRouter.get('/:slug/slots', async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const date = req.query.date as string | undefined;
    const timezone = req.query.timezone as string | undefined;

    if (!date) {
      res.status(400).json({ error: 'date query parameter required (YYYY-MM-DD)' });
      return;
    }

    const organizer = await prisma.organizer.findUnique({
      where: { slug },
      include: { availabilitySlots: true },
    });

    if (!organizer || !organizer.isActive) {
      res.status(404).json({ error: 'Organizer not found' });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgWithSlots = organizer as any;

    const slots = await generateAvailableSlots(
      {
        id: orgWithSlots.id,
        slug: orgWithSlots.slug,
        defaultDuration: orgWithSlots.defaultDuration,
        bufferBefore: orgWithSlots.bufferBefore,
        bufferAfter: orgWithSlots.bufferAfter,
        maxMeetingsPerDay: orgWithSlots.maxMeetingsPerDay,
        bookingDeadlineDays: orgWithSlots.bookingDeadlineDays,
        timezone: orgWithSlots.timezone,
        availabilitySlots: orgWithSlots.availabilitySlots,
      },
      date,
      timezone || organizer.timezone
    );

    res.json({ slots, date, timezone: organizer.timezone });
  } catch (err) {
    console.error('GET /slots error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
