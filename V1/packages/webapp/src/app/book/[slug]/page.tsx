'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CalendarView } from '@/components/booking/calendar-view';
import { TimeSlots } from '@/components/booking/time-slots';
import { BookingForm } from '@/components/booking/booking-form';
import { OptionsSelect } from '@/components/booking/options-select';
import { publicApi } from '@/lib/api';
import type { OrganizerProfile, SlotResult, BookingOptionGroup } from '@/lib/api';

type Step = 'date' | 'time' | 'options' | 'form' | 'loading';

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [organizer, setOrganizer] = useState<OrganizerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('date');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotResult[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);

  const optionGroups: BookingOptionGroup[] = organizer?.bookingOptionGroups ?? [];
  const hasOptions = optionGroups.length > 0;

  useEffect(() => {
    if (!slug) return;
    publicApi.getOrganizer(slug)
      .then(setOrganizer)
      .catch(() => setError('Организатор не найден'));
  }, [slug]);

  const loadSlots = useCallback(async (date: Date) => {
    if (!slug || !organizer) return;
    setSlotsLoading(true);
    try {
      const dateStr = date.toISOString().split('T')[0];
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const data = await publicApi.getSlots(slug, dateStr, tz);
      setSlots(data.slots);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [slug, organizer]);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setStep('time');
    loadSlots(date);
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    setSelectedChoiceId(null);
    if (hasOptions) {
      setStep('options');
    } else {
      setStep('form');
    }
  };

  const handleChoiceSelect = (choiceId: string) => {
    setSelectedChoiceId(choiceId);
  };

  const handleOptionsContinue = () => {
    setStep('form');
  };

  const handleBookingSubmit = async (data: { name: string; contact: string; note: string; instagram: string; clientTelegram: string; phoneNumber: string; participantsCount: number }) => {
    if (!organizer || !selectedDate || !selectedTime) return;

    setBookingLoading(true);
    try {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const startTime = new Date(selectedDate);
      startTime.setHours(hours, minutes, 0, 0);

      const result = await publicApi.createAppointment({
        organizerId: organizer.id,
        clientName: data.name,
        clientContact: data.contact,
        clientNote: data.note || undefined,
        instagram: data.instagram || undefined,
        clientTelegram: data.clientTelegram || undefined,
        phoneNumber: data.phoneNumber || undefined,
        participantsCount: data.participantsCount,
        selectedChoiceId: selectedChoiceId || undefined,
        startTime: startTime.toISOString(),
        duration: organizer.defaultDuration,
      });

      router.push(`/book/${slug}/success?id=${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка бронирования');
      setBookingLoading(false);
    }
  };

  const minDate = new Date();
  const maxDate = organizer
    ? new Date(Date.now() + organizer.bookingDeadlineDays * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold text-red-600 mb-2">Ошибка</h2>
        <p className="text-gray-500">{error}</p>
      </div>
    );
  }

  if (!organizer) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Загрузка...</p>
      </div>
    );
  }

  const stepLabels = ['date', 'time', ...(hasOptions ? ['options'] : []), 'form'];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">{organizer.title}</h1>
        {organizer.description && (
          <p className="text-gray-500 mt-1">{organizer.description}</p>
        )}
        <p className="text-sm text-gray-400 mt-1">
          Длительность: {organizer.defaultDuration} мин
        </p>
      </div>

      {/* Steps indicator */}
      <div className="flex justify-center gap-2 mb-6">
        {stepLabels.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i + 1}
            </div>
            {i < stepLabels.length - 1 && <div className="w-8 h-0.5 bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Step: Date selection */}
      {step === 'date' && (
        <CalendarView
          selectedDate={selectedDate}
          onSelect={handleDateSelect}
          minDate={minDate}
          maxDate={maxDate}
        />
      )}

      {/* Step: Time selection */}
      {step === 'time' && (
        <div>
          <button
            onClick={() => setStep('date')}
            className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
          >
            ← Назад к датам
          </button>
          <TimeSlots
            slots={slots}
            selectedSlot={selectedTime}
            onSelect={handleTimeSelect}
            loading={slotsLoading}
          />
        </div>
      )}

      {/* Step: Options selection (only if organizer has options) */}
      {step === 'options' && hasOptions && (
        <div>
          <button
            onClick={() => setStep('time')}
            className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
          >
            ← Назад ко времени
          </button>

          <OptionsSelect
            groups={optionGroups}
            selectedChoiceId={selectedChoiceId}
            onSelect={handleChoiceSelect}
          />

          <button
            onClick={handleOptionsContinue}
            className="w-full mt-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Далее
          </button>
        </div>
      )}

      {/* Step: Form */}
      {step === 'form' && (
        <div>
          <button
            onClick={() => hasOptions ? setStep('options') : setStep('time')}
            className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
          >
            ← Назад
          </button>

          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Дата:</span>{' '}
              {selectedDate?.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Время:</span> {selectedTime}
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Длительность:</span>{' '}
              {organizer.defaultDuration} мин
            </p>
            {selectedChoiceId && optionGroups.map(g => {
              const choice = g.choices.find(c => c.id === selectedChoiceId);
              return choice ? (
                <p key={g.id} className="text-sm text-gray-600">
                  <span className="font-medium">{g.title}:</span> {choice.label}
                </p>
              ) : null;
            })}
          </div>

          <BookingForm onSubmit={handleBookingSubmit} loading={bookingLoading} />

          {error && (
            <p className="text-red-600 text-sm mt-2 text-center">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
