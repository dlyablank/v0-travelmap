import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Weekend Explorer — выходные начинаются здесь',
  description:
    'Откройте Карелию, Коломну и окрестности через карту и короткие видео. Сохраняйте места и собирайте свой маршрут на выходные.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
