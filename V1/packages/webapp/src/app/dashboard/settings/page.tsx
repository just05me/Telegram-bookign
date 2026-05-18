'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  // In production, these would be loaded from the API
  const [title, setTitle] = useState('Мой календарь');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('30');
  const [bufferBefore, setBufferBefore] = useState('0');
  const [bufferAfter, setBufferAfter] = useState('5');
  const [maxPerDay, setMaxPerDay] = useState('10');
  const [bookingDays, setBookingDays] = useState('60');

  const handleSave = async () => {
    const orgId = sessionStorage.getItem('organizer_id');
    if (!orgId) {
      alert('Организатор не найден. Используйте бота для настройки.');
      return;
    }

    try {
      const baseUrl = process.env['NEXT_PUBLIC_API_URL'] || '';
      const res = await fetch(`${baseUrl}/api/organizers/${orgId}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          defaultDuration: parseInt(duration),
          bufferBefore: parseInt(bufferBefore),
          bufferAfter: parseInt(bufferAfter),
          maxMeetingsPerDay: parseInt(maxPerDay),
          bookingDeadlineDays: parseInt(bookingDays),
        }),
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
      <h1 className="text-2xl font-bold mb-6">⚙️ Настройки календаря</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Длительность (мин)
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              min={15}
              max={120}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Макс. встреч/день
            </label>
            <input
              type="number"
              value={maxPerDay}
              onChange={(e) => setMaxPerDay(e.target.value)}
              min={1}
              max={50}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Буфер до (мин)
            </label>
            <input
              type="number"
              value={bufferBefore}
              onChange={(e) => setBufferBefore(e.target.value)}
              min={0}
              max={60}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Буфер после (мин)
            </label>
            <input
              type="number"
              value={bufferAfter}
              onChange={(e) => setBufferAfter(e.target.value)}
              min={0}
              max={60}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Дней для бронирования
          </label>
          <input
            type="number"
            value={bookingDays}
            onChange={(e) => setBookingDays(e.target.value)}
            min={1}
            max={365}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <button
          onClick={handleSave}
          className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          {saved ? '✅ Сохранено!' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
