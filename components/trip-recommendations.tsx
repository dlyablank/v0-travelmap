'use client';
import { useEffect, useState } from 'react';
import { Plus, MapPin, LoaderCircle } from 'lucide-react';
import type { Place, RouteResult } from '@/lib/types';
import { recommendationCandidates } from '@/lib/recommendations';
import { PlaceImage } from './place-image';
type Suggestion = { place: Place; insertAt: number; detour: number };
export function TripRecommendations({
  stops,
  places,
  route,
  mode,
  onAdd,
}: {
  stops: Place[];
  places: Place[];
  route: RouteResult;
  mode: 'car' | 'walk' | 'transit';
  onAdd: (place: Place, index: number) => void;
}) {
  const key = `${stops.map((p) => p.id).join(',')}:${mode}:${route.distance}:${route.duration}`;
  const [result, setResult] = useState<{
    key: string;
    items: Suggestion[];
    loading: boolean;
    error: boolean;
  }>({ key: '', items: [], loading: true, error: false });
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setResult({ key, items: [], loading: true, error: false });
      let failed = false;
      const candidates = recommendationCandidates(stops, places, route, mode);
      const checked = await Promise.all(
        candidates.map(async (candidate) => {
          const ordered = [...stops];
          ordered.splice(candidate.insertAt, 0, candidate.place);
          try {
            const response = await fetch('/api/route', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                stops: ordered.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
                mode,
              }),
            });
            if (!response.ok) throw new Error('Route unavailable');
            const proposed: RouteResult = await response.json();
            if (proposed.source !== 'osrm' || proposed.duration == null || route.duration == null) {
              failed = true;
              return null;
            }
            const detour = Math.max(0, Math.ceil((proposed.duration - route.duration) / 60));
            return detour <= (mode === 'car' ? 20 : 15) ? { ...candidate, detour } : null;
          } catch {
            failed = true;
            return null;
          }
        }),
      );
      if (!controller.signal.aborted)
        setResult({
          key,
          items: checked
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .sort((a, b) => a.detour - b.detour)
            .slice(0, 3),
          loading: false,
          error: failed,
        });
    }
    void load();
    return () => controller.abort();
  }, [key, stops, places, route, mode]);
  const current = result.key === key ? result : { items: [], loading: true, error: false };
  if (route.source !== 'osrm') return null;
  return (
    <section className="trip-recommendations" aria-label="Места по пути">
      <div className="day-section-title">
        <MapPin size={17} />
        <h3>По пути к новым впечатлениям</h3>
      </div>
      <p>До трёх видео в этом регионе. Добавляйте только то, что хочется увидеть.</p>
      {current.loading ? (
        <div role="status" className="recommendation-loading">
          <LoaderCircle size={16} className="spin" />
          Проверяем время заезда…
        </div>
      ) : current.items.length ? (
        current.items.map((item) => (
          <article key={item.place.id}>
            <PlaceImage place={item.place} />
            <div>
              <h4>{item.place.name}</h4>
              <p>
                Заезд +{item.detour} мин · {item.place.visitMinutes} мин на месте
              </p>
            </div>
            <button
              aria-label={`Добавить по пути: ${item.place.name}`}
              disabled={stops.length >= 20}
              onClick={() => onAdd(item.place, item.insertAt)}
            >
              <Plus size={20} />
            </button>
          </article>
        ))
      ) : (
        <p className="small-note">
          {current.error
            ? 'Время заезда пока не удалось проверить. Попробуйте обновить маршрут позже.'
            : 'Подходящих видео с небольшим заездом пока нет. Ваш маршрут уже собран.'}
        </p>
      )}
    </section>
  );
}
