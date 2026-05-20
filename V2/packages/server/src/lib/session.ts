import { prisma } from './prisma';

export interface BookingFormData {
  name: string;
  clientTelegram: string;
  phoneNumber: string;
  instagram: string;
  participantsCount: number;
  note: string;
}

export interface BookingSession {
  organizerId: string;
  organizerSlug: string;
  organizerTitle: string;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:mm
  selectedChoiceId: string | null;
  formData: BookingFormData;
  step: 'date' | 'time' | 'options' | 'form_name' | 'form_contact' | 'form_telegram' | 'form_phone' | 'form_instagram' | 'form_participants' | 'form_note' | 'confirm' | 'done';
}

interface SettingsSession {
  organizerId: string;
  field: 'title' | 'description' | 'duration' | 'bufferBefore' | 'bufferAfter' | 'maxMeetingsPerDay' | 'bookingDeadlineDays';
}

interface AvailabilitySession {
  organizerId: string;
  action: 'add' | 'delete' | 'edit' | 'add_all';
  dayOfWeek?: number;
  slotId?: string;
  waitFor?: 'startTime' | 'endTime';
  startTime?: string;
}

interface OptionsSession {
  organizerId: string;
  action: 'new_group' | 'edit_title' | 'add_choice' | 'delete_group';
  groupId?: string;
  waitFor?: 'title' | 'choice_label' | 'more_choices';
  choices: string[];
}

interface AddressSession {
  appointmentId: string;
  waitFor: 'address';
  organizerId: string;
}

interface NoteSession {
  appointmentId: string;
  waitFor: 'note';
  organizerId: string;
}

interface RescheduleSession {
  appointmentId: string;
  organizerId: string;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:mm
  step: 'date' | 'time';
}

type SessionEntry = {
  type: 'booking';
  data: BookingSession;
} | {
  type: 'settings';
  data: SettingsSession;
} | {
  type: 'availability';
  data: AvailabilitySession;
} | {
  type: 'options';
  data: OptionsSession;
} | {
  type: 'address';
  data: AddressSession;
} | {
  type: 'note';
  data: NoteSession;
} | {
  type: 'reschedule';
  data: RescheduleSession;
};

class SessionStore {
  private cache = new Map<number, SessionEntry>();
  private proxyCache = new WeakMap<object, object>();

  async init(): Promise<void> {
    const rows = await prisma.session.findMany();
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data) as { type: string; data: unknown };
        this.cache.set(Number(row.telegramId), parsed as SessionEntry);
      } catch {
        // Skip corrupted rows
      }
    }
    console.log(`Session store loaded ${rows.length} sessions from DB`);
  }

  private async persist(telegramId: number, entry: SessionEntry | null): Promise<void> {
    try {
      if (entry === null) {
        await prisma.session.delete({ where: { telegramId: BigInt(telegramId) } }).catch(() => {});
      } else {
        await prisma.session.upsert({
          where: { telegramId: BigInt(telegramId) },
          create: { telegramId: BigInt(telegramId), type: entry.type, data: JSON.stringify(entry) },
          update: { type: entry.type, data: JSON.stringify(entry) },
        });
      }
    } catch (err) {
      console.error('Failed to persist session:', err);
    }
  }

  private autoPersist<T extends object>(telegramId: number, entry: SessionEntry, data: T): T {
    // Return cached proxy if one exists for this data object
    const cached = this.proxyCache.get(data);
    if (cached) return cached as T;

    const store = this;
    const proxy = new Proxy(data, {
      set(target, prop, value) {
        Reflect.set(target, prop, value);
        store.persist(telegramId, entry);
        return true;
      },
      get(target, prop) {
        const val = Reflect.get(target, prop);
        // Deep-proxy nested objects so nested mutations also trigger persist
        if (val !== null && typeof val === 'object' && !(val instanceof Date) && !Array.isArray(val)) {
          return store.autoPersist(telegramId, entry, val);
        }
        return val;
      },
    });

    this.proxyCache.set(data, proxy);
    return proxy;
  }

  get(telegramId: number): SessionEntry | undefined {
    return this.cache.get(telegramId);
  }

  set(telegramId: number, entry: SessionEntry): void {
    this.cache.set(telegramId, entry);
    this.persist(telegramId, entry);
  }

  delete(telegramId: number): void {
    this.cache.delete(telegramId);
    this.persist(telegramId, null);
  }

  getBooking(telegramId: number): BookingSession | undefined {
    const entry = this.cache.get(telegramId);
    if (entry?.type !== 'booking') return undefined;
    return this.autoPersist(telegramId, entry, entry.data);
  }

  setBooking(telegramId: number, data: BookingSession): void {
    this.cache.set(telegramId, { type: 'booking', data });
    this.persist(telegramId, { type: 'booking', data });
  }

  getSettings(telegramId: number): SettingsSession | undefined {
    const entry = this.cache.get(telegramId);
    if (entry?.type !== 'settings') return undefined;
    return this.autoPersist(telegramId, entry, entry.data);
  }

  setSettings(telegramId: number, data: SettingsSession): void {
    this.cache.set(telegramId, { type: 'settings', data });
    this.persist(telegramId, { type: 'settings', data });
  }

  getAvailability(telegramId: number): AvailabilitySession | undefined {
    const entry = this.cache.get(telegramId);
    if (entry?.type !== 'availability') return undefined;
    return this.autoPersist(telegramId, entry, entry.data);
  }

  setAvailability(telegramId: number, data: AvailabilitySession): void {
    this.cache.set(telegramId, { type: 'availability', data });
    this.persist(telegramId, { type: 'availability', data });
  }

  getOptions(telegramId: number): OptionsSession | undefined {
    const entry = this.cache.get(telegramId);
    if (entry?.type !== 'options') return undefined;
    return this.autoPersist(telegramId, entry, entry.data);
  }

  setOptions(telegramId: number, data: OptionsSession): void {
    this.cache.set(telegramId, { type: 'options', data });
    this.persist(telegramId, { type: 'options', data });
  }

  getAddress(telegramId: number): AddressSession | undefined {
    const entry = this.cache.get(telegramId);
    if (entry?.type !== 'address') return undefined;
    return this.autoPersist(telegramId, entry, entry.data);
  }

  setAddress(telegramId: number, data: AddressSession): void {
    this.cache.set(telegramId, { type: 'address', data });
    this.persist(telegramId, { type: 'address', data });
  }

  getNote(telegramId: number): NoteSession | undefined {
    const entry = this.cache.get(telegramId);
    if (entry?.type !== 'note') return undefined;
    return this.autoPersist(telegramId, entry, entry.data);
  }

  setNote(telegramId: number, data: NoteSession): void {
    this.cache.set(telegramId, { type: 'note', data });
    this.persist(telegramId, { type: 'note', data });
  }

  /** Force-persist the current session for a telegramId, used when data was mutated directly */
  save(telegramId: number): void {
    const entry = this.cache.get(telegramId);
    if (entry) this.persist(telegramId, entry);
  }

  getReschedule(telegramId: number): RescheduleSession | undefined {
    const entry = this.cache.get(telegramId);
    if (entry?.type !== 'reschedule') return undefined;
    return this.autoPersist(telegramId, entry, entry.data);
  }

  setReschedule(telegramId: number, data: RescheduleSession): void {
    this.cache.set(telegramId, { type: 'reschedule', data });
    this.persist(telegramId, { type: 'reschedule', data });
  }
}

export const sessionStore = new SessionStore();
