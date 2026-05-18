'use client';

import { useEffect } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { useTelegram } from '@/components/telegram-provider';

export default function SuccessPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get('id');
  const { tg, isInsideTelegram } = useTelegram();

  useEffect(() => {
    if (!tg || !isInsideTelegram) return;

    tg.MainButton.setText('Закрыть');
    tg.MainButton.show();
    tg.MainButton.onClick(() => tg.close());

    return () => {
      tg.MainButton.hide();
    };
  }, [tg, isInsideTelegram]);

  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-3xl">✅</span>
      </div>
      <h1 className="text-2xl font-bold mb-2">Вы записаны!</h1>
      <p className="text-gray-500 mb-6">
        Организатор получил уведомление о вашей записи.
      </p>
      {appointmentId && (
        <p className="text-sm text-gray-400">
          Номер брони: {appointmentId.slice(0, 8)}
        </p>
      )}
      <div className="mt-8">
        {isInsideTelegram ? (
          <button
            onClick={() => tg?.close()}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Закрыть
          </button>
        ) : (
          <a
            href={`/book/${slug}`}
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            ← Записаться на ещё одну встречу
          </a>
        )}
      </div>
    </div>
  );
}
