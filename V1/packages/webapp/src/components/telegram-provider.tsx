'use client';

import { useEffect, createContext, useContext } from 'react';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramWebAppTheme {
  bg_color: string;
  text_color: string;
  hint_color: string;
  link_color: string;
  button_color: string;
  button_text_color: string;
  secondary_bg_color?: string;
}

interface TelegramWebApp {
  ready(): void;
  expand(): void;
  close(): void;
  sendData(data: string): void;
  initDataUnsafe: {
    user?: TelegramUser;
    query_id?: string;
  };
  themeParams: TelegramWebAppTheme;
  colorScheme: 'light' | 'dark';
  version: string;
  isExpanded: boolean;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
    setText(text: string): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
  };
  BackButton: {
    isVisible: boolean;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

interface TelegramContextValue {
  tg: TelegramWebApp | null;
  user: TelegramUser | null;
  isInsideTelegram: boolean;
}

const TelegramContext = createContext<TelegramContextValue>({
  tg: null,
  user: null,
  isInsideTelegram: false,
});

export function useTelegram() {
  return useContext(TelegramContext);
}

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp ?? null : null;
  const user = tg?.initDataUnsafe?.user ?? null;
  const isInsideTelegram = Boolean(tg && tg.initDataUnsafe?.user);

  useEffect(() => {
    if (!tg) return;

    tg.ready();
    tg.expand();

    if (tg.themeParams?.bg_color) {
      document.documentElement.style.setProperty('--tg-bg', tg.themeParams.bg_color);
      document.documentElement.style.setProperty('--tg-text', tg.themeParams.text_color);
      document.documentElement.style.setProperty('--tg-button', tg.themeParams.button_color);
      document.documentElement.style.setProperty('--tg-button-text', tg.themeParams.button_text_color);
    }
  }, [tg]);

  return (
    <TelegramContext.Provider value={{ tg, user, isInsideTelegram }}>
      {children}
    </TelegramContext.Provider>
  );
}
