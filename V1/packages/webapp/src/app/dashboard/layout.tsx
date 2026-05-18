'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] || '';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: {
          user?: { id: number; first_name: string; username?: string };
        };
        ready(): void;
        expand(): void;
      };
    };
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    initTelegramWebApp();
  }, []);

  async function initTelegramWebApp() {
    // Already initialised in this session
    if (sessionStorage.getItem('organizer_id')) {
      setStatus('ready');
      return;
    }

    const twa = window.Telegram?.WebApp;

    // Running outside Telegram (dev mode) — try to use a demo organizer_id from localStorage
    if (!twa?.initData) {
      const devOrgId = localStorage.getItem('dev_organizer_id');
      if (devOrgId) {
        sessionStorage.setItem('organizer_id', devOrgId);
        setStatus('ready');
      } else {
        setStatus('error');
        setErrorMsg('Откройте это приложение через Telegram-бота.');
      }
      return;
    }

    twa.ready();
    twa.expand();

    try {
      // 1. Validate initData on the server
      const initRes = await fetch(`${API_BASE}/api/webapp/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: twa.initData }),
      });

      if (!initRes.ok) {
        throw new Error('Не удалось проверить данные Telegram');
      }

      const { user } = await initRes.json() as { user?: { id: number } };
      if (!user?.id) {
        throw new Error('Не удалось получить данные пользователя');
      }

      // 2. Fetch or create organizer profile
      const orgRes = await fetch(`${API_BASE}/api/organizers/by-telegram/${user.id}`);

      if (orgRes.ok) {
        const org = await orgRes.json() as { id: string };
        sessionStorage.setItem('organizer_id', org.id);
        setStatus('ready');
        return;
      }

      // 404 means organizer doesn't exist yet — create one
      if (orgRes.status === 404) {
        const firstName = twa.initDataUnsafe?.user?.first_name ?? 'User';
        const createRes = await fetch(`${API_BASE}/api/organizers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegramId: String(user.id),
            title: `${firstName}'s Calendar`,
          }),
        });

        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({})) as { error?: string };
          // 409 = already exists, try fetching again
          if (createRes.status === 409 && (err as { slug?: string }).slug) {
            const slug = (err as { slug: string }).slug;
            const retryRes = await fetch(`${API_BASE}/api/organizers/${slug}`);
            if (retryRes.ok) {
              const org = await retryRes.json() as { id: string };
              sessionStorage.setItem('organizer_id', org.id);
              setStatus('ready');
              return;
            }
          }
          throw new Error(err.error ?? 'Ошибка создания профиля');
        }

        const newOrg = await createRes.json() as { id: string };
        sessionStorage.setItem('organizer_id', newOrg.id);
        setStatus('ready');
        return;
      }

      throw new Error('Ошибка загрузки профиля организатора');
    } catch (err) {
      console.error('Telegram WebApp init error:', err);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка инициализации');
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-400">Загрузка...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 font-medium mb-2">⚠️ Ошибка</p>
        <p className="text-gray-500 text-sm">{errorMsg}</p>
      </div>
    );
  }

  return <>{children}</>;
}
