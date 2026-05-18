'use client';

import { useState } from 'react';

interface TimeSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DAYS = [0, 1, 2, 3, 4, 5, 6];

export default function AvailabilityPage() {
  const [slots, setSlots] = useState<TimeSlot[]>([
    { dayOfWeek: 1, startTime: '09:00', endTime: '18:00' },
    { dayOfWeek: 2, startTime: '09:00', endTime: '18:00' },
    { dayOfWeek: 3, startTime: '09:00', endTime: '18:00' },
    { dayOfWeek: 4, startTime: '09:00', endTime: '18:00' },
    { dayOfWeek: 5, startTime: '09:00', endTime: '18:00' },
  ]);
  const [saved, setSaved] = useState(false);

  const addSlot = (dayOfWeek: number) => {
    setSlots([...slots, { dayOfWeek, startTime: '09:00', endTime: '18:00' }]);
  };

  const removeSlot = (index: number) => {
    setSlots(slots.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: keyof TimeSlot, value: string | number) => {
    const updated = [...slots];
    updated[index] = { ...updated[index], [field]: value };
    setSlots(updated);
  };

  const handleSave = async () => {
    const orgId = sessionStorage.getItem('organizer_id');
    if (!orgId) {
      alert('Организатор не найден.');
      return;
    }

    try {
      const baseUrl = process.env['NEXT_PUBLIC_API_URL'] || '';
      const res = await fetch(`${baseUrl}/api/organizers/${orgId}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      alert('Ошибка сохранения');
    }
  };

  return (
    <div>
      <a href="/dashboard" className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block">
        ← Назад
      </a>
      <h1 className="text-2xl font-bold mb-6">🕐 Рабочее время</h1>

      <div className="space-y-3 mb-6">
        {DAYS.map((day) => {
          const daySlots = slots
            .map((s, i) => ({ ...s, index: i }))
            .filter((s) => s.dayOfWeek === day);

          return (
            <div key={day} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-sm">{DAY_NAMES[day]}</span>
                <button
                  onClick={() => addSlot(day)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  + Добавить
                </button>
              </div>

              {daySlots.length === 0 && (
                <p className="text-xs text-gray-400">Выходной</p>
              )}

              {daySlots.map((slot) => (
                <div key={slot.index} className="flex items-center gap-2 mt-2">
                  <input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) => updateSlot(slot.index, 'startTime', e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <span className="text-gray-400">—</span>
                  <input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => updateSlot(slot.index, 'endTime', e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <button
                    onClick={() => removeSlot(slot.index)}
                    className="text-red-500 text-sm hover:text-red-700 ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        {saved ? '✅ Сохранено!' : 'Сохранить'}
      </button>
    </div>
  );
}
