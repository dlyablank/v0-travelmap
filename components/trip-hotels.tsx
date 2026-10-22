'use client';
import { useEffect, useState } from 'react';
import { BedDouble, ExternalLink, LoaderCircle } from 'lucide-react';
import type { Place } from '@/lib/types';
import type { PoiItem } from '@/lib/dgis-places';
import { hotelSearchFallback, type SearchLinkCard } from '@/lib/dgis-route';

type HotelState = {
  key: string;
  items: PoiItem[];
  links: SearchLinkCard[];
  loading: boolean;
  fromCatalog: boolean;
};

export function TripHotels({ eveningPlace }: { eveningPlace: Place | null }) {
  const key = eveningPlace
    ? `${eveningPlace.id}:${eveningPlace.latitude}:${eveningPlace.longitude}`
    : '';
  const [state, setState] = useState<HotelState>({
    key: '',
    items: [],
    links: [],
    loading: false,
    fromCatalog: false,
  });

  useEffect(() => {
    if (!eveningPlace) return;
    const controller = new AbortController();
    const links = hotelSearchFallback(eveningPlace.latitude, eveningPlace.longitude);
    async function load() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setState({ key, items: [], links, loading: true, fromCatalog: false });
      try {
        const response = await fetch(
          `/api/pois/hotels?lat=${eveningPlace!.latitude}&lon=${eveningPlace!.longitude}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (controller.signal.aborted) return;
        const list = Array.isArray(data.items) ? data.items : [];
        setState({
          key,
          items: list,
          links,
          loading: false,
          fromCatalog: list.length > 0 && data.source === 'dgis',
        });
      } catch {
        if (!controller.signal.aborted)
          setState({ key, items: [], links, loading: false, fromCatalog: false });
      }
    }
    void load();
    return () => controller.abort();
  }, [eveningPlace, key]);

  if (!eveningPlace) return null;
  const current =
    state.key === key
      ? state
      : {
          key,
          items: [],
          links: hotelSearchFallback(eveningPlace.latitude, eveningPlace.longitude),
          loading: true,
          fromCatalog: false,
        };

  return (
    <section className="trip-hotels" aria-label="Отели на ночь">
      <div className="day-section-title">
        <BedDouble size={17} />
        <h3>Где переночевать</h3>
      </div>
      <p className="trip-hint">
        Вечерняя точка: {eveningPlace.name}. Несколько вариантов рядом — выбор отеля не обязателен
        для просмотра плана.
      </p>
      {current.loading && (
        <p className="recommendation-loading" role="status">
          <LoaderCircle size={16} className="spin" /> Ищем варианты рядом…
        </p>
      )}
      {current.fromCatalog &&
        current.items.map((item) => (
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
              <small>Каталог 2GIS · без цен и наличия номеров</small>
            </div>
            <ExternalLink size={16} />
          </a>
        ))}
      {!current.fromCatalog &&
        current.links.map((link) => (
          <a
            key={link.id}
            className="poi-card poi-card-link"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div>
              <strong>{link.name}</strong>
              <small>Откроется внешний поиск · каталог 2GIS здесь недоступен</small>
            </div>
            <ExternalLink size={16} />
          </a>
        ))}
    </section>
  );
}
