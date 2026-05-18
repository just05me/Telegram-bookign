import type { Metadata } from 'next';
import '@/styles/globals.css';
import { TelegramProvider } from '@/components/telegram-provider';

export const metadata: Metadata = {
  title: 'Telegram Booking',
  description: 'Бронирование встреч через Telegram',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        {/* Telegram Mini App SDK — must load synchronously before page renders */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://telegram.org/js/telegram-web-app.js" />
      </head>
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <TelegramProvider>
          <main className="mx-auto max-w-lg px-4 py-6">{children}</main>
        </TelegramProvider>
      </body>
    </html>
  );
}
