'use client';

import { cn } from '@/lib/utils';
import type { SlotResult } from '@/lib/api';

interface TimeSlotsProps {
  slots: SlotResult[];
  selectedSlot: string | null;
  onSelect: (time: string) => void;
  loading?: boolean;
}

export function TimeSlots({ slots, selectedSlot, onSelect, loading }: TimeSlotsProps) {
  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        Загрузка доступного времени...
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        Нет доступных слотов на этот день
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {slots.map((slot) => {
        const key = slot.start;
        const isSelected = selectedSlot === key;

        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={cn(
              'py-3 px-2 rounded-lg text-sm font-medium transition-colors border',
              isSelected
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-900 border-gray-200 hover:border-blue-400 hover:bg-blue-50'
            )}
          >
            {slot.start}
          </button>
        );
      })}
    </div>
  );
}
