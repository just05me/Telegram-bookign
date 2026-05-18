'use client';

import { useState } from 'react';

interface BookingFormData {
  name: string;
  contact: string;
  note: string;
  instagram: string;
  clientTelegram: string;
  phoneNumber: string;
  participantsCount: number;
}

interface BookingFormProps {
  onSubmit: (data: BookingFormData) => void;
  loading?: boolean;
}

export function BookingForm({ onSubmit, loading }: BookingFormProps) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [instagram, setInstagram] = useState('');
  const [clientTelegram, setClientTelegram] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+998');
  const [participantsCount, setParticipantsCount] = useState(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      contact: contact.trim(),
      note: note.trim(),
      instagram: instagram.trim(),
      clientTelegram: clientTelegram.trim(),
      phoneNumber: phoneNumber.trim(),
      participantsCount,
    });
  };

  const handlePhoneChange = (value: string) => {
    if (!value.startsWith('+998')) {
      setPhoneNumber('+998');
      return;
    }
    // Only allow digits after +998
    const digits = value.replace(/\D/g, '').slice(3);
    setPhoneNumber('+998' + digits);
  };

  const isValid = name.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Имя *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ваше имя"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Telegram (@username)
        </label>
        <input
          type="text"
          value={clientTelegram}
          onChange={(e) => setClientTelegram(e.target.value)}
          placeholder="@username"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Номер телефона
        </label>
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => handlePhoneChange(e.target.value)}
          placeholder="+998XXXXXXXXX"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Instagram
        </label>
        <input
          type="text"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
          placeholder="Ссылка или @username"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Контакты (телефон или email) *
        </label>
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Телефон или email"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Количество участников
        </label>
        <input
          type="number"
          value={participantsCount}
          onChange={(e) => setParticipantsCount(Math.max(1, parseInt(e.target.value) || 1))}
          min={1}
          max={100}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Заметка (необязательно)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Дополнительная информация..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={!isValid || loading}
        className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Бронирование...' : 'Записаться'}
      </button>
    </form>
  );
}
