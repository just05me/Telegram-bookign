'use client';

import type { BookingOptionGroup } from '@/lib/api';

interface OptionsSelectProps {
  groups: BookingOptionGroup[];
  selectedChoiceId: string | null;
  onSelect: (choiceId: string) => void;
}

export function OptionsSelect({ groups, selectedChoiceId, onSelect }: OptionsSelectProps) {
  if (groups.length === 0) return null;

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.id}>
          <h3 className="text-sm font-medium text-gray-700 mb-2">{group.title}</h3>
          <div className="space-y-2">
            {group.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => onSelect(choice.id)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  selectedChoiceId === choice.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-900 border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                }`}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
