'use client';
import { useEffect, useMemo, useState } from 'react';
import { Coffee, ExternalLink, LoaderCircle, UtensilsCrossed } from 'lucide-react';
import type { Place } from '@/lib/types';
import type { PoiItem } from '@/lib/dgis-places';
import { mealSearchFallback, type SearchLinkCard } from '@/lib/dgis-route';
import { haversine } from '@/lib/routing';
import { PlaceImage } from './place-image';

type Slot = 'breakfast' | 'lunch' | 'dinner';

const SLOT_LABEL: Record<Slot, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
};

function anchors(stops: Place[]): Record<Slot, Place | null> {
  if (!stops.length) return { breakfast: null, lunch: null, dinner: null };
  const mid = stops[Math.floor((stops.length - 1) / 2)];
  return {
    breakfast: stops[0],
    lunch: mid,
    dinner: stops[stops.length - 1],
  };
}

type MealState = {
  key: string;
  pois: Partial<Record<Slot, PoiItem[]>>;
  links: Partial<Record<Slot, SearchLinkCard[]>>;
  loading: boolean;
  hasDgis: boolean;
};

export function TripMeals({
  dayStops,
  catalogPlaces,
}: {
  dayStops: Place[];
  catalogPlaces: Place[];
}) {
  const points = useMemo(() => anchors(dayStops), [dayStops]);
  const key = dayStops.map((p) => p.id).join(',');
  const cafes = useMemo(
    () =>
      catalogPlaces
        .filter((p) => p.category === 'Кафе' && dayStops[0] && p.region === dayStops[0].region)
        .sort(
          (a, b) =>
            Math.min(...dayStops.map((s) => haversine(s, a))) -
            Math.min(...dayStops.map((s) => haversine(s, b))),
        )
        .slice(0, 3),
    [catalogPlaces, dayStops],
  );

  const [state, setState] = useState<MealState>({
    key: '',
    pois: {},
    links: {},
    loading: false,
    hasDgis: false,
  });

  useEffect(() => {
    const slots = (Object.keys(points) as Slot[]).filter((s) => points[s]);
    if (!slots.length) return;
    const controller = new AbortController();
    const nextLinks: Partial<Record<Slot, SearchLinkCard[]>> = {};
    for (const slot of slots) {
      const p = points[slot]!;
      nextLinks[slot] = mealSearchFallback(slot, p.latitude, p.longitude);
    }
    async function load() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setState({ key, pois: {}, links: nextLinks, loading: true, hasDgis: false });
      const rows = await Promise.all(
        slots.map(async (slot) => {
          const p = points[slot]!;
          try {
            const response = await fetch(
              `/api/pois/meals?lat=${p.latitude}&lon=${p.longitude}&slot=${slot}`,
              { signal: controller.signal },
            );
            const data = await response.json();
            return {
              slot,
              items: Array.isArray(data.items) ? (data.items as PoiItem[]) : [],
              source: data.source as string | null,
            };
          } catch {
            return { slot, items: [] as PoiItem[], source: null };
          }
        }),
      );
      if (controller.signal.aborted) return;
      const map: Partial<Record<Slot, PoiItem[]>> = {};
      let any = false;
      for (const row of rows) {
        map[row.slot] = row.items;
        if (row.items.length && row.source === 'dgis') any = true;
      }
      setState({ key, pois: map, links: nextLinks, loading: false, hasDgis: any });
    }
    void load();
    return () => controller.abort();
  }, [points, key]);

  if (!dayStops.length) return null;
  const current =
    state.key === key
      ? state
      : { key, pois: {}, links: {}, loading: true, hasDgis: false };

  return (
    <section className="trip-meals" aria-label="Еда по ходу дня">
      <div className="day-section-title">
        <UtensilsCrossed size={17} />
        <h3>Завтрак, обед и ужин</h3>
      </div>
      <p className="trip-hint">
        Подсказки рядом с точками дня. Без меню, цен и часов работы как факта — только идеи, куда
        заглянуть.
      </p>
      {current.loading && (
        <p className="recommendation-loading" role="status">
          <LoaderCircle size={16} className="spin" /> Подбираем места рядом…
        </p>
      )}
      {(Object.keys(SLOT_LABEL) as Slot[]).map((slot) => {
        const anchor = points[slot];
        if (!anchor) return null;
        const dgisItems = current.pois[slot] || [];
        const fallback =
          current.links[slot] || mealSearchFallback(slot, anchor.latitude, anchor.longitude);
        return (
          <div key={slot} className="meal-slot">
            <h4>
              <Coffee size={15} /> {SLOT_LABEL[slot]}
              <small>около «{anchor.name}»</small>
            </h4>
            {current.hasDgis && dgisItems.length
              ? dgisItems.slice(0, 3).map((item) => (
                  <a
                    key={item.id}
                    className="poi-card"
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div>
                      <strong>{item.name}</strong>
                      {item.address && <span>{item.address}</span>}
                      <small>Каталог 2GIS</small>
                    </div>
                    <ExternalLink size={16} />
                  </a>
                ))
              : fallback.map((link) => (
                  <a
                    key={link.id}
                    className="poi-card poi-card-link"
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div>
                      <strong>{link.name}</strong>
                      <small>Внешний поиск</small>
                    </div>
                    <ExternalLink size={16} />
                  </a>
                ))}
          </div>
        );
      })}
      {!!cafes.length && (
        <div className="meal-slot meal-catalog">
          <h4>Кафе из каталога Weekend Explorer</h4>
          {cafes.map((place) => (
            <article key={place.id} className="meal-catalog-card">
              <PlaceImage place={place} />
              <div>
                <strong>{place.name}</strong>
                <p>{place.description}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
