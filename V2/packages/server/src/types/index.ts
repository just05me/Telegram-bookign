export type UserRole = 'ORGANIZER' | 'CLIENT';
export type AppointmentStatus =
  | 'CONFIRMED'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLED'
  | 'RESCHEDULE_REQUESTED'
  | 'RESCHEDULED';
export type CancellationInitiator = 'ORGANIZER' | 'CLIENT';
export type ReminderType = 'BEFORE_1H' | 'BEFORE_3H' | 'BEFORE_1D';

export interface SlotResult {
  start: string; // HH:mm in organizer's timezone
  end: string;
}
