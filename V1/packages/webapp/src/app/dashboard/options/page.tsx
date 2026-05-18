'use client';

import { useEffect, useState, useCallback } from 'react';

interface Choice {
  label: string;
  sortOrder: number;
}

interface OptionGroup {
  id: string;
  title: string;
  choices: { id: string; label: string; sortOrder: number }[];
}

export default function OptionsPage() {
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [choices, setChoices] = useState<Choice[]>([{ label: '', sortOrder: 0 }]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = process.env['NEXT_PUBLIC_API_URL'] || '';
  const orgId = typeof window !== 'undefined' ? sessionStorage.getItem('organizer_id') : null;

  const fetchGroups = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${baseUrl}/api/organizers/${orgId}/options`);
      if (res.ok) {
        setGroups(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [orgId, baseUrl]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const resetForm = () => {
    setTitle('');
    setChoices([{ label: '', sortOrder: 0 }]);
    setEditingId(null);
    setError(null);
  };

  const handleEdit = (group: OptionGroup) => {
    setTitle(group.title);
    setChoices(group.choices.map((c) => ({ label: c.label, sortOrder: c.sortOrder })));
    setEditingId(group.id);
    setError(null);
  };

  const addChoice = () => {
    setChoices([...choices, { label: '', sortOrder: choices.length }]);
  };

  const removeChoice = (index: number) => {
    if (choices.length <= 1) return;
    setChoices(choices.filter((_, i) => i !== index));
  };

  const updateChoice = (index: number, value: string) => {
    const updated = [...choices];
    updated[index] = { ...updated[index], label: value };
    setChoices(updated);
  };

  const handleSave = async () => {
    if (!orgId) {
      setError('Организатор не найден. Используйте бота для настройки.');
      return;
    }
    if (!title.trim()) {
      setError('Введите название группы опций');
      return;
    }
    const validChoices = choices.filter((c) => c.label.trim());
    if (validChoices.length < 1) {
      setError('Добавьте хотя бы один вариант');
      return;
    }

    try {
      const res = await fetch(`${baseUrl}/api/organizers/${orgId}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: editingId,
          title: title.trim(),
          choices: validChoices.map((c, i) => ({ label: c.label.trim(), sortOrder: i })),
        }),
      });

      if (res.ok) {
        setSaved(true);
        setError(null);
        resetForm();
        fetchGroups();
        setTimeout(() => setSaved(false), 2000);
      } else {
        const err = await res.json();
        setError(err.error || 'Ошибка сохранения');
      }
    } catch {
      setError('Ошибка сохранения');
    }
  };

  const handleDelete = async (groupId: string) => {
    if (!confirm('Удалить эту группу опций?')) return;
    try {
      const res = await fetch(`${baseUrl}/api/organizers/${orgId}/options/${groupId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setGroups(groups.filter((g) => g.id !== groupId));
      }
    } catch {
      setError('Ошибка удаления');
    }
  };

  if (!orgId) {
    return (
      <div>
        <a href="/dashboard" className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block">
          ← Назад
        </a>
        <h1 className="text-2xl font-bold mb-6">🎯 Опции бронирования</h1>
        <p className="text-gray-500">
          Организатор не найден. Используйте бота для настройки календаря.
        </p>
      </div>
    );
  }

  return (
    <div>
      <a href="/dashboard" className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block">
        ← Назад
      </a>
      <h1 className="text-2xl font-bold mb-6">🎯 Опции бронирования</h1>

      {loading ? (
        <p className="text-gray-500">Загрузка...</p>
      ) : (
        <>
          {/* Existing groups */}
          {groups.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Существующие опции</h2>
              <div className="space-y-3">
                {groups.map((group) => (
                  <div key={group.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{group.title}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          {group.choices.map((c) => c.label).join(', ')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(group)}
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(group.id)}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add / Edit form */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">
              {editingId ? 'Редактировать опции' : 'Создать новые опции'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название / вопрос
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Выберите пакет"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Варианты
                </label>
                <div className="space-y-2">
                  {choices.map((choice, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={choice.label}
                        onChange={(e) => updateChoice(i, e.target.value)}
                        placeholder={`Вариант ${i + 1}`}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <button
                        onClick={() => removeChoice(i)}
                        disabled={choices.length <= 1}
                        className="px-3 py-2 text-red-500 hover:text-red-700 disabled:text-gray-300"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addChoice}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  + Добавить вариант
                </button>
              </div>

              {error && (
                <p className="text-red-600 text-sm">{error}</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {saved ? '✅ Сохранено!' : editingId ? 'Обновить' : 'Создать'}
                </button>
                {editingId && (
                  <button
                    onClick={resetForm}
                    className="py-3 px-6 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Отмена
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
