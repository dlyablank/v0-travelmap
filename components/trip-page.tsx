'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, LoaderCircle, MapPin, Play, Route, X } from 'lucide-react';
import { places as demoPlaces } from '@/lib/data';
import { useExplorer } from '@/lib/store';
import { collectedTripIds } from '@/lib/trip-collection';
import { locationGroups } from '@/lib/locations';
import { normalizePlace, regions } from '@/lib/regions';
import { cityTravelNote } from '@/lib/podmoskovye-data';
import { rewriteLocationKey } from '@/lib/region-migration';
import type { Place, RouteResult } from '@/lib/types';
import { TripPanel } from './trip-panel';
import { PlaceImage } from './place-image';

export function TripPage() {
  const router = useRouter();
  const search = useSearchParams();
  const cityId = rewriteLocationKey(search.get('city') || '');
  const state = useExplorer();
  const { customPlaces, regionId } = state;
  const [serverPlaces, setServerPlaces] = useState<Place[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<RouteResult | null>(null);
  useEffect(() => {
    const unsubscribe = useExplorer.persist.onFinishHydration(() => setHydrated(true));
    void useExplorer.persist.rehydrate();
    const controller = new AbortController();
    fetch('/api/places', { signal: controller.signal })
      .then((response) => response.json())
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
        new Map(
          [...demoPlaces, ...serverPlaces, ...customPlaces]
            .map((place) => normalizePlace(place))
            .map((place) => [place.id, place]),
        ).values(),
      ),
    [serverPlaces, customPlaces],
  );
  useEffect(() => {
    if (hydrated && !loading) useExplorer.getState().syncLocations(places);
  }, [hydrated, loading, places, regionId]);
  const allIds = collectedTripIds(state);
  const selected = places.filter((place) => allIds.includes(place.id));
  const groups = locationGroups(selected);
  const choices = locationGroups(places);
  const city = choices.find((group) => group.id === cityId);
  const owner = regions.find((region) => region.name === city?.region)?.id;
  useEffect(() => {
    if (hydrated && owner && owner !== regionId) useExplorer.getState().setRegion(owner);
  }, [owner, regionId, hydrated]);
  const chooseCity = (id: string) => {
    setRoute(null);
    router.push(`/trip?city=${encodeURIComponent(id)}`);
  };
  if (!hydrated || loading || (city && owner && owner !== regionId))
    return (
      <main className="trip-loading" role="status">
        <LoaderCircle className="spin" /> Загружаем вашу поездку…
      </main>
    );
  if (city)
    return (
      <TripPanel
        key={city.id}
        cityId={city.id}
        places={places}
        route={route}
        onRoute={setRoute}
        onClose={() => router.push('/')}
        onBackToCities={() => {
          setRoute(null);
          router.push('/trip');
        }}
        onChooseCity={chooseCity}
        onSelect={(place) => router.push(`/?place=${encodeURIComponent(place.id)}`)}
      />
    );
  return (
    <main className="trip-dashboard" aria-label="Поездки по городам">
      <header className="trip-dashboard-header">
        <div>
          <span className="dialog-eyebrow">ВАШИ ИДЕИ ДЛЯ ПУТЕШЕСТВИЙ</span>
          <h1>
            Моя поездка <span>{allIds.length}</span>
          </h1>
          <p>Куда поедем? Все добавленные места собраны по локациям.</p>
        </div>
        <Link className="icon-button" aria-label="Вернуться к местам" href="/">
          <ArrowLeft />
        </Link>
      </header>
      <label className="trip-city-picker">
        <MapPin size={20} />
        <span>
          Выберите город
          <select
            aria-label="Выбрать город поездки"
            value=""
            onChange={(event) => {
              if (event.target.value) chooseCity(event.target.value);
            }}
          >
            <option value="">Куда хотите поехать?</option>
            {choices.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} · {group.region}
              </option>
            ))}
          </select>
        </span>
      </label>
      {!!allIds.filter((id) => !places.some((place) => place.id === id)).length && (
        <p className="trip-feedback" role="status">
          Часть добавленных мест ещё загружается. Они сохранены в вашей поездке.
        </p>
      )}
      {!groups.length && (
        <section className="trip-dashboard-empty">
          <Route size={36} />
          <h2>Соберите идеи для поездки</h2>
          <p>
            Добавляйте места кнопкой «+» на карте или в ленте. Здесь появятся ваши города и видео.
          </p>
          <Link href="/">
            Найти места <ArrowUpRight size={17} />
          </Link>
        </section>
      )}
      <div className="trip-city-groups">
        {groups.map((group) => (
          <section className="trip-city-card" key={group.id} aria-label={`Поездка: ${group.name}`}>
            <header>
              <div>
                <small>{group.region}</small>
                <h2>{group.name}</h2>
                <p>
                  {group.places.length} мест · {group.places.filter((place) => place.video).length}{' '}
                  видео
                </p>
                {cityTravelNote(group.name, group.region) && (
                  <p className="trip-city-note">{cityTravelNote(group.name, group.region)}</p>
                )}
              </div>
              <Link
                href={`/trip?city=${encodeURIComponent(group.id)}`}
                aria-label={`Составить маршрут: ${group.name}`}
              >
                <Route size={19} /> Маршрут <ArrowUpRight size={17} />
              </Link>
            </header>
            <div className="trip-city-videos">
              {group.places.map((place) => (
                <article key={place.id}>
                  <button
                    className="trip-city-place"
                    aria-label={`Открыть на карте: ${place.name}`}
                    onClick={() => router.push(`/?place=${encodeURIComponent(place.id)}`)}
                  >
                    <PlaceImage place={place} />
                    {place.video && (
                      <Play className="trip-city-play" size={17} fill="currentColor" />
                    )}
                    <b>{place.name}</b>
                  </button>
                  <button
                    className="trip-city-remove"
                    aria-label={`Убрать из поездки ${place.name}`}
                    onClick={() =>
                      state.toggleTrip(
                        place.id,
                        regions.find((region) => region.name === place.region)?.id || regionId,
                      )
                    }
                  >
                    <X size={15} />
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
