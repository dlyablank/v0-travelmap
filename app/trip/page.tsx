import { Suspense } from 'react';
import { TripPage } from '@/components/trip-page';

export default function Page() {
  return (
    <Suspense fallback={<div className="trip-loading">Загружаем поездки…</div>}>
      <TripPage />
    </Suspense>
  );
}
