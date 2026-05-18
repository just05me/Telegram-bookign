'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface CalendarViewProps {
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
  minDate: Date;
  maxDate: Date;
}

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export function CalendarView({ selectedDate, onSelect, minDate, maxDate }: CalendarViewProps) {
  const [viewDate, setViewDate] = useState(new Date());

  const weeks = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Adjust first day of week to Monday (0 = Monday)
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const days: (Date | null)[] = [];
    for (let i = 0; i < startDow; i++) days.push(null);

    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }

    // Fill remaining cells
    while (days.length % 7 !== 0) days.push(null);

    const result: (Date | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [viewDate]);

  const isDisabled = (date: Date) => {
    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const normMin = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
    const normMax = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
    return normalized < normMin || normalized > normMax || normalized < new Date();
  };

  const isSelected = (date: Date) => {
    if (!selectedDate) return false;
    return (
      date.getFullYear() === selectedDate.getFullYear() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getDate() === selectedDate.getDate()
    );
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const canGoPrev = viewDate > new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const canGoNext = viewDate < new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          disabled={!canGoPrev}
          className="p-2 text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
        >
          ←
        </button>
        <h3 className="font-semibold text-lg">
          {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
        </h3>
        <button
          onClick={nextMonth}
          disabled={!canGoNext}
          className="p-2 text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((name) => (
          <div key={name} className="text-center text-xs text-gray-500 font-medium py-2">
            {name}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="space-y-1">
        {weeks.map((week, i) => (
          <div key={i} className="grid grid-cols-7">
            {week.map((date, j) => {
              if (!date) return <div key={j} />;

              const disabled = isDisabled(date);

              return (
                <button
                  key={j}
                  onClick={() => !disabled && onSelect(date)}
                  disabled={disabled}
                  className={cn(
                    'w-full aspect-square flex items-center justify-center rounded-full text-sm transition-colors',
                    isSelected(date) && 'bg-blue-600 text-white font-medium',
                    !isSelected(date) && isToday(date) && 'border border-blue-600 text-blue-600',
                    !isSelected(date) && !isToday(date) && !disabled && 'hover:bg-gray-100 text-gray-900',
                    disabled && 'text-gray-300 cursor-not-allowed'
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
