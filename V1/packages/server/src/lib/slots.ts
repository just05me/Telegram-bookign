import { prisma } from './prisma';
import type { SlotResult } from '../types';

interface OrganizerWithSlots {
  id: string;
  slug: string;
  defaultDuration: number;
  bufferBefore: number;
  bufferAfter: number;
  maxMeetingsPerDay: number;
  bookingDeadlineDays: number;
  timezone: string;
  availabilitySlots: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }[];
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) + '-' + Math.random().toString(36).slice(2, 6);
}

/**
 * Generate available time slots for a given organizer and date.
 *
 * Algorithm:
 * 1. Determine dayOfWeek for the requested date
 * 2. Find the AvailabilitySlot matching that day
 * 3. Check for ExceptionDate overrides
 * 4. Fetch existing appointments for that date
 * 5. Subtract buffer times from booked slots
 * 6. Divide the free range into slots of defaultDuration
 * 7. Apply maxMeetingsPerDay cap
 * 8. Return available slot list
 */
export async function generateAvailableSlots(
  organizer: OrganizerWithSlots,
  dateStr: string,
  _timezone: string
): Promise<SlotResult[]> {
  const date = new Date(dateStr + 'T00:00:00Z');
  const dayOfWeek = date.getUTCDay(); // 0=Sun

  // Check exception dates first
  const exception = await prisma.exceptionDate.findUnique({
    where: {
      organizerId_date: {
        organizerId: organizer.id,
        date: date,
      },
    },
  });

  if (exception && !exception.isAvailable) {
    return []; // Day off
  }

  // Get regular availability for this day of week
  const daySlots = organizer.availabilitySlots.filter(
    (s) => s.dayOfWeek === dayOfWeek
  );

  if (daySlots.length === 0) {
    return []; // No availability defined for this day
  }

  // Use exception time override if available
  const timeRanges = exception?.startTime
    ? [{ startTime: exception.startTime, endTime: exception.endTime! }]
    : daySlots;

  // Fetch existing appointments for this date (in organizer's timezone context)
  const dayStart = new Date(dateStr + 'T00:00:00Z');
  const dayEnd = new Date(dateStr + 'T23:59:59Z');

  const appointments = await prisma.appointment.findMany({
    where: {
      organizerId: organizer.id,
      status: { in: ['CONFIRMED', 'RESCHEDULE_REQUESTED', 'CANCELLATION_REQUESTED'] },
      startTime: { gte: dayStart },
      endTime: { lte: dayEnd },
    },
    orderBy: { startTime: 'asc' },
  });

  // Track booked slots with buffers
  const bookedRanges: { start: number; end: number }[] = appointments.map((a) => ({
    start: a.startTime.getTime() - organizer.bufferBefore * 60000,
    end: a.endTime.getTime() + organizer.bufferAfter * 60000,
  }));

  // Generate all possible slots from the time ranges
  const durationMs = organizer.defaultDuration * 60000;
  const allSlots: SlotResult[] = [];

  for (const range of timeRanges) {
    const [startH, startM] = range.startTime.split(':').map(Number);
    const [endH, endM] = range.endTime.split(':').map(Number);

    // Create date objects in UTC for the given date + time
    let slotStart = new Date(dateStr + `T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00Z`).getTime();
    const rangeEnd = new Date(dateStr + `T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00Z`).getTime();

    while (slotStart + durationMs <= rangeEnd) {
      const slotEnd = slotStart + durationMs;

      // Check if slot overlaps with any booked range
      const isBooked = bookedRanges.some(
        (b) => slotStart < b.end && slotEnd > b.start
      );

      if (!isBooked) {
        const fmt = (d: Date) =>
          `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

        allSlots.push({
          start: fmt(new Date(slotStart)),
          end: fmt(new Date(slotEnd)),
        });
      }

      slotStart += durationMs;
    }
  }

  // Apply maxMeetingsPerDay cap (only show slots up to the limit)
  const existingCount = appointments.filter(
    (a) => a.status === 'CONFIRMED' || a.status === 'RESCHEDULE_REQUESTED'
  ).length;

  const remainingSlots = organizer.maxMeetingsPerDay - existingCount;

  return allSlots.slice(0, remainingSlots > 0 ? remainingSlots : 0);
}
