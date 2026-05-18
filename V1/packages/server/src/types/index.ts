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

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}
