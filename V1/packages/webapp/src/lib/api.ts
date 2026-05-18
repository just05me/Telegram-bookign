const API_BASE = process.env['NEXT_PUBLIC_API_URL'] || '';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE}/api${path}`;
  const { method = 'GET', body, headers = {} } = options;

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const res = await fetch(url, config);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed with status ${res.status}`);
  }

  return res.json();
}

export interface BookingOptionChoice {
  id: string;
  label: string;
}

export interface BookingOptionGroup {
  id: string;
  title: string;
  choices: BookingOptionChoice[];
}

export interface OrganizerProfile {
  id: string;
  slug: string;
  title: string;
  description?: string;
  defaultDuration: number;
  bookingDeadlineDays: number;
  timezone: string;
  isActive: boolean;
  bookingOptionGroups?: BookingOptionGroup[];
}

export interface SlotResult {
  start: string;
  end: string;
}

export interface SlotsResponse {
  slots: SlotResult[];
  date: string;
  timezone: string;
}

export interface Appointment {
  id: string;
  organizerId: string;
  clientName: string;
  clientContact: string;
  clientNote?: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: string;
  createdAt: string;
}

// Public API
export const publicApi = {
  getOrganizer: (slug: string) =>
    request<OrganizerProfile>(`/organizers/${slug}`),

  getSlots: (slug: string, date: string, timezone?: string) => {
    const params = new URLSearchParams({ date });
    if (timezone) params.set('timezone', timezone);
    return request<SlotsResponse>(`/organizers/${slug}/slots?${params}`);
  },

  createAppointment: (data: {
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
  }) => request<Appointment>('/appointments', { method: 'POST', body: data }),

  cancelAppointment: (id: string, requestedBy: string, reason?: string) =>
    request<{ success: boolean; status: string }>(`/appointments/${id}/cancel`, {
      method: 'POST',
      body: { requestedBy, reason },
    }),

  confirmCancel: (id: string) =>
    request<{ success: boolean; status: string }>(`/appointments/${id}/confirm-cancel`, {
      method: 'POST',
    }),

  rescheduleAppointment: (id: string, newStartTime: string) =>
    request<{ success: boolean; status: string }>(`/appointments/${id}/reschedule`, {
      method: 'POST',
      body: { newStartTime },
    }),
};

// Organizer API (needs auth)
export const organizerApi = {
  create: (data: { telegramId: string; title: string; timezone?: string }) =>
    request<OrganizerProfile>('/organizers', { method: 'POST', body: data }),

  updateSettings: (id: string, data: Partial<OrganizerProfile & { bufferBefore: number; bufferAfter: number; maxMeetingsPerDay: number; bookingDeadlineDays: number }>) =>
    request<OrganizerProfile>(`/organizers/${id}/settings`, { method: 'POST', body: data }),

  setAvailability: (id: string, slots: { dayOfWeek: number; startTime: string; endTime: string }[]) =>
    request(`/organizers/${id}/availability`, { method: 'POST', body: { slots } }),

  getAppointments: (id: string) =>
    request<Appointment[]>(`/organizers/${id}/appointments`),
};
