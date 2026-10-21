'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { places as demoPlaces } from '@/lib/data';
import { useExplorer } from '@/lib/store';
import type { Place, RouteResult } from '@/lib/types';
import { TripPanel } from './trip-panel';

export function TripPage() {
  const router = useRouter();
  const customPlaces = useExplorer((s) => s.customPlaces);
  const regionId = useExplorer((s) => s.regionId);
  const [serverPlaces, setServerPlaces] = useState<Place[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<RouteResult | null>(null);
  useEffect(() => {
    const unsubscribe = useExplorer.persist.onFinishHydration(() => setHydrated(true));
    void useExplorer.persist.rehydrate();
    const controller = new AbortController();
    fetch('/api/places', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.places)) setServerPlaces(data.places);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      unsubscribe();
      controller.abort();
    };
  }, []);
  const places = useMemo(
    () =>
      Array.from(
        new Map([...demoPlaces, ...serverPlaces, ...customPlaces].map((p) => [p.id, p])).values(),
      ),
    [serverPlaces, customPlaces],
  );
  useEffect(() => {
    if (hydrated && !loading) useExplorer.getState().syncLocations(places);
  }, [hydrated, loading, places, regionId]);
  if (!hydrated || loading)
    return (
      <main className="trip-loading" role="status">
        <LoaderCircle className="spin" /> Загружаем вашу поездку…
      </main>
    );
  return (
    <TripPanel
      places={places}
      route={route}
      onRoute={setRoute}
      onClose={() => router.push('/')}
      onSelect={(place) => router.push(`/?place=${encodeURIComponent(place.id)}`)}
    />
  );
}
