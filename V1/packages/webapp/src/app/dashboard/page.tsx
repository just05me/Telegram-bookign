'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate, formatTime } from '@/lib/utils';

interface Appointment {
  id: string;
  clientName: string;
  clientContact: string;
  startTime: string;
  duration: number;
  status: string;
}

// Demo mode: show placeholder data until Telegram WebApp integration is active
export default function DashboardPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try to load from sessionStorage (set by Telegram WebApp init)
    const orgId = sessionStorage.getItem('organizer_id');
    if (orgId) {
      fetchAppointments(orgId);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchAppointments = async (orgId: string) => {
    try {
      const baseUrl = process.env['NEXT_PUBLIC_API_URL'] || '';
      const res = await fetch(`${baseUrl}/api/organizers/${orgId}/appointments`);
      if (res.ok) {
        const data = await res.json();
        setAppointments(data);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'CONFIRMED': return '✅ Подтверждено';
      case 'CANCELLATION_REQUESTED': return '⏳ Запрос отмены';
      case 'CANCELLED': return '❌ Отменено';
      case 'RESCHEDULE_REQUESTED': return '🔄 Запрос переноса';
      case 'RESCHEDULED': return '📅 Перенесено';
      default: return status;
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">📅 Мои встречи</h1>

      <div className="flex gap-2 mb-6">
        <a
          href="/dashboard/settings"
          className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-colors"
        >
          ⚙️ Настройки
        </a>
        <a
          href="/dashboard/availability"
          className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-colors"
        >
          🕐 Расписание
        </a>
        <a
          href="/dashboard/options"
          className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-colors"
        >
          🎯 Опции
        </a>
      </div>

      {loading ? (
        <p className="text-gray-500">Загрузка...</p>
      ) : appointments.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-2">У вас пока нет встреч</p>
          <p className="text-sm text-gray-400">
            Поделитесь ссылкой на ваш календарь, чтобы клиенты могли записаться
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map((a) => (
            <div key={a.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{a.clientName}</p>
                  <p className="text-sm text-gray-500">{a.clientContact}</p>
                </div>
                <span className="text-xs">{statusLabel(a.status)}</span>
              </div>
              <div className="mt-2 text-sm text-gray-500">
                {formatDate(a.startTime)} в {formatTime(a.startTime)} · {a.duration} мин
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
