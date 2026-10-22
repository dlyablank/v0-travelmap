'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Clock,
  Compass,
  Leaf,
  Map as MapIcon,
  MapPin,
  Mountain,
  Plus,
  Search,
  SlidersHorizontal,
  Tent,
  Utensils,
  X,
  Play,
  Route,
  Grid2X2,
  LoaderCircle,
  Info,
} from 'lucide-react';
import { places as demoPlaces } from '@/lib/data';
import { regions, getRegion, normalizePlace } from '@/lib/regions';
import { locationId as placeLocationId, locationGroups } from '@/lib/locations';
import { categories, type Place, type RouteResult } from '@/lib/types';
import { haversine } from '@/lib/routing';
import { useExplorer } from '@/lib/store';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { PlaceImage } from './place-image';
import { VideoPlayer } from './video-player';
import { VideoReel } from './video-reel';
import { VideoAttribution } from './video-attribution';
import { collectedTripIds } from '@/lib/trip-collection';
import { useCardVideoPreviews } from './card-video-previews';
import { useRouter } from 'next/navigation';
import { ImportDialog, type DraftLocation } from './import-dialog';
const ExplorerMap = dynamic(() => import('./explorer-map'), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <LoaderCircle className="spin" /> Разворачиваем карту…
    </div>
  ),
});
const categoryIcon: Record<string, typeof Leaf> = {
  'Все места': Compass,
  Природа: Leaf,
  'Красивые виды': Mountain,
  Приключения: Tent,
  Кафе: Utensils,
  Отели: Tent,
};
export default function Explorer() {
  const [serverPlaces, setServerPlaces] = useState<Place[]>(demoPlaces);
  const [active, setActive] = useState<Place | null>(null);
  const [reelId, setReelId] = useState<string | null>(null);
  const [reelPlaces, setReelPlaces] = useState<Place[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const reelReturn = useRef<{ fromMap: boolean; place: Place | null }>({
    fromMap: false,
    place: null,
  });
  const rememberReelPlace = useCallback((place: Place) => {
    reelReturn.current.place = place;
    setServerPlaces((previous) =>
      previous.some((p) => p.id === place.id) ? previous : [...previous, place],
    );
  }, []);
  const mapFetch = useRef<{
    at: number;
    controller: AbortController | null;
    timer?: ReturnType<typeof setTimeout>;
  }>({
    at: 0,
    controller: null,
  });
  const loadMapVideos = useCallback(function requestMapVideos() {
    if (mapFetch.current.controller) return;
    const wait = 1500 - (Date.now() - mapFetch.current.at);
    if (wait > 0) {
      if (!mapFetch.current.timer)
        mapFetch.current.timer = setTimeout(() => {
          mapFetch.current.timer = undefined;
          requestMapVideos();
        }, wait);
      return;
    }
    const controller = new AbortController();
    mapFetch.current.at = Date.now();
    mapFetch.current.controller = controller;
    fetch('/api/places', { signal: controller.signal, cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Places unavailable');
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data.places)) return;
        setServerPlaces((previous) => {
          const known = new Set(previous.map((p) => p.id));
          const fresh = (data.places as Place[]).filter((p) => !known.has(p.id));
          return fresh.length
            ? Array.from(new Map([...previous, ...fresh].map((p) => [p.id, p])).values())
            : previous;
        });
      })
      .catch(() => {})
      .finally(() => {
        if (mapFetch.current.controller === controller) mapFetch.current.controller = null;
      });
  }, []);
  const [category, setCategory] = useState('Все места');
  const [query, setQuery] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const router = useRouter();
  const tripOpen = false;
  const setTripOpen = (open: boolean) => {
    if (open) router.push('/trip');
  };
  const [importOpen, setImportOpen] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [location, setLocation] = useState<DraftLocation | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [timeFilter, setTimeFilter] = useState('any');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'map' | 'feed'>('map');
  const [feedMode, setFeedMode] = useState(false);
  const [toast, setToast] = useState('');
  const [about, setAbout] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const {
    trip: plannerTrip,
    regionTrips,
    unassignedStops,
    saved,
    customPlaces,
    toggleSaved,
    toggleTrip,
    regionId,
    syncLocations,
  } = useExplorer();
  const [mapRegionId, setMapRegionId] = useState('podmoskovye');
  const [focusRequest, setFocusRequest] = useState(0);
  const [savedLocation, setSavedLocation] = useState('');
  const [radiusRegion, setRadiusRegion] = useState('podmoskovye');
  const [mobileSearch, setMobileSearch] = useState(false);
  const region = getRegion(mapRegionId);
  const trip = useMemo(
    () => collectedTripIds({ trip: plannerTrip, regionTrips, unassignedStops }),
    [plannerTrip, regionTrips, unassignedStops],
  );
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const touch = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 6000);
  }, []);
  useEffect(() => {
    const mapRequests = mapFetch.current;
    const unsub = useExplorer.persist.onFinishHydration(() => setHydrated(true));
    useExplorer.persist.rehydrate();
    const controller = new AbortController();
    fetch('/api/places', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.places?.length)
          setServerPlaces((previous) =>
            Array.from(
              new Map([...previous, ...data.places].map((p: Place) => [p.id, p])).values(),
            ),
          );
        if (data.warning) notify(data.warning);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => {
      unsub();
      controller.abort();
      mapRequests.controller?.abort();
      clearTimeout(mapRequests.timer);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [notify]);
  const allPlaces = useMemo(
    () =>
      Array.from(
        new Map(
          [...demoPlaces, ...serverPlaces, ...(hydrated ? customPlaces : [])]
            .map((place) => normalizePlace(place))
            .map((p) => [p.id, p]),
        ).values(),
      ),
    [serverPlaces, customPlaces, hydrated],
  );
  useEffect(() => {
    if (hydrated) syncLocations(allPlaces);
  }, [allPlaces, hydrated, loading, regionId, syncLocations]);
  useEffect(() => {
    if (!hydrated) return;
    const id = getRegion(useExplorer.getState().regionId).id;
    setMapRegionId(id);
    setRadiusRegion(id);
  }, [hydrated]);
  useEffect(() => {
    if (!hydrated || loading) return;
    const id = new URLSearchParams(window.location.search).get('place');
    const place = allPlaces.find((p) => p.id === id);
    if (place) {
      setActive(place);
      setMobileView('map');
      window.history.replaceState(null, '', '/');
    }
  }, [hydrated, loading, allPlaces]);
  const savedGroups = locationGroups(allPlaces.filter((p) => hydrated && saved.includes(p.id)));
  function chooseLocation(id: string) {
    setSavedLocation(id);
  }
  function openSaved() {
    setSavedOnly(true);
    setActive(null);
    setSavedLocation('');
    setMobileView('feed');
    setFeedMode(false);
  }
  const travelOrigin = useMemo(() => {
    const origin = getRegion(radiusRegion);
    return { latitude: origin.origin[1], longitude: origin.origin[0] };
  }, [radiusRegion]);
  const radiusOrigin = timeFilter === 'any' ? null : travelOrigin;
  const mapPlaces = useMemo(
    () =>
      allPlaces.filter(
        (p) =>
          (category === 'Все места' || p.category === category) &&
          (!savedOnly ||
            (saved.includes(p.id) && (!savedLocation || placeLocationId(p) === savedLocation))) &&
          `${p.name} ${p.city} ${p.region}`.toLowerCase().includes(query.toLowerCase()) &&
          (!radiusOrigin || haversine(radiusOrigin, p) / 1000 / 55 <= Number(timeFilter)),
      ),
    [allPlaces, radiusOrigin, category, savedOnly, saved, query, timeFilter, savedLocation],
  );
  const filtered = mapPlaces;
  const previewPlaces = useMemo(
    () => (active ? mapPlaces.filter((p) => p.region === active.region) : filtered),
    [active, mapPlaces, filtered],
  );
  const selectPlace = useCallback((p: Place) => {
    setActive(p);
    setMobileView('map');
    setFeedMode(false);
    cardRefs.current[p.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);
  useCardVideoPreviews(
    gridRef,
    !active && !reelId && !tripOpen && !importOpen && !about && !pickMode,
    filtered,
  );
  const loadMoreVideos = useCallback(
    async (seen: string[], signal: AbortSignal) => {
      let candidates = allPlaces;
      try {
        const response = await fetch('/api/places', { signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Feed unavailable');
        const data = await response.json();
        if (Array.isArray(data.places)) {
          candidates = Array.from(
            new Map([...allPlaces, ...data.places].map((p: Place) => [p.id, p])).values(),
          );
        }
      } catch (error) {
        if (signal.aborted || !candidates.some((p) => p.video && !seen.includes(p.id))) throw error;
      }
      return candidates.filter((p) => p.video && !seen.includes(p.id)).slice(0, 6);
    },
    [allPlaces],
  );
  function openReel(place: Place, fromMap = false) {
    reelReturn.current = { fromMap, place };
    setActive(null);
    const videos = filtered.filter((p) => p.video);
    const start = videos.findIndex((p) => p.id === place.id);
    setReelPlaces(
      start < 0 ? [place, ...videos] : [...videos.slice(start), ...videos.slice(0, start)],
    );
    setReelId(place.id);
  }
  function closeReel() {
    setReelId(null);
    const { fromMap, place } = reelReturn.current;
    if (fromMap && place) {
      setMobileView('map');
      setFeedMode(false);
      selectPlace(place);
      requestAnimationFrame(() =>
        document.getElementById('map-watch-video')?.focus({ preventScroll: true }),
      );
    }
  }
  function addToTrip(id: string) {
    const place =
      allPlaces.find((p) => p.id === id) ||
      (reelReturn.current.place?.id === id ? reelReturn.current.place : null);
    if (!place || !hydrated) return;
    useExplorer.getState().addPlace(place);
    const owner = regions.find((candidate) => candidate.name === place.region)?.id || regionId;
    toggleTrip(id, owner);
    setRoute(null);
  }
  function next(d: number) {
    if (!active || !previewPlaces.length) return;
    const i = previewPlaces.findIndex((p) => p.id === active.id);
    selectPlace(previewPlaces[(i + d + previewPlaces.length) % previewPlaces.length]);
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        (e.target as HTMLElement).closest('input,textarea,select') ||
        importOpen ||
        about ||
        reelId
      )
        return;
      if (e.key === 'Escape') setActive(null);
      if (e.key === 'ArrowRight' && active) {
        const i = previewPlaces.findIndex((p) => p.id === active.id);
        setActive(previewPlaces[(i + 1) % previewPlaces.length] || null);
      }
      if (e.key === 'ArrowLeft' && active) {
        const i = previewPlaces.findIndex((p) => p.id === active.id);
        setActive(previewPlaces[(i - 1 + previewPlaces.length) % previewPlaces.length] || null);
      }
    }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [active, previewPlaces, importOpen, about, reelId]);
  const currentTrip = hydrated ? trip.length : 0;
  return (
    <div className={`explorer ${feedMode ? 'feed-expanded' : ''}`}>
      <header className="app-header">
        <button
          className="brand"
          aria-label="Weekend Explorer — главная"
          onClick={() => {
            setQuery('');
            setCategory('Все места');
            setSavedOnly(false);
            setActive(null);
            setFeedMode(false);
            setMobileView('map');
          }}
        >
          <span className="brand-symbol">
            <Compass size={25} strokeWidth={1.7} />
          </span>
          <span>
            weekend
            <span className="brand-second">
              explorer<span className="brand-dot">.</span>
            </span>
          </span>
        </button>
        <nav className="main-nav" aria-label="Главная навигация">
          <button
            aria-label="Исследовать"
            title="Исследовать"
            className={!savedOnly ? 'active' : ''}
            onClick={() => {
              setSavedOnly(false);
              setActive(null);
              setMobileView('feed');
            }}
          >
            <Grid2X2 size={21} />
            <span className="nav-label">Исследовать</span>
          </button>
          <button
            aria-label="Сохранённое"
            title="Сохранённое"
            className={savedOnly ? 'active' : ''}
            onClick={openSaved}
          >
            <Bookmark size={21} />
            <span className="nav-label">Сохранённое</span>
            {hydrated && saved.length > 0 && <span className="nav-count">{saved.length}</span>}
          </button>
          <button
            aria-label="Как это работает"
            title="Как это работает"
            onClick={() => setAbout(true)}
          >
            <Info size={21} />
            <span className="nav-label">Как это работает</span>
          </button>
        </nav>
        <div className="header-actions">
          <Button
            variant="ghost"
            aria-label="Добавить видео"
            title="Добавить видео"
            className="add-video"
            onClick={() => setImportOpen(true)}
          >
            <Plus size={20} />
            <span className="button-label">Добавить видео</span>
          </Button>
          <Button
            variant="outline"
            aria-label={`Моя поездка, мест: ${currentTrip}`}
            title="Моя поездка"
            className="trip-button"
            onClick={() => setTripOpen(!tripOpen)}
          >
            <Route size={20} />
            <span className="button-label">Моя поездка</span>{' '}
            <span className="trip-count">{currentTrip}</span>
          </Button>
          <button className="avatar" onClick={() => setAbout(true)} aria-label="О проекте">
            WE
          </button>
        </div>
      </header>
      <div className={`toolbar ${mobileSearch ? 'mobile-search-open' : ''}`}>
        <div className="search-field">
          <button
            className="mobile-search-toggle"
            aria-label="Открыть поиск"
            aria-expanded={mobileSearch}
            onClick={() => setMobileSearch(!mobileSearch)}
          >
            <Search size={20} />
          </button>
          <Search size={18} />
          <input
            aria-label="Поиск по городу и региону"
            placeholder="Найти место"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label="Очистить поиск" onClick={() => setQuery('')}>
              <X size={15} />
            </button>
          )}
          <label className="search-region" title="Приблизить регион на карте">
            <MapPin className="mobile-region-icon" size={21} />
            <select
              aria-label="Регион путешествия"
              disabled={!hydrated}
              value={region.id}
              onChange={(e) => {
                setMapRegionId(e.target.value);
                setFocusRequest((value) => value + 1);
                setActive(null);
              }}
            >
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </label>
        </div>
        <div className="category-tabs">
          {categories.map((c) => {
            const Icon = categoryIcon[c];
            return (
              <button
                key={c}
                aria-label={c}
                title={c}
                className={category === c ? 'active' : ''}
                onClick={() => setCategory(c)}
              >
                <Icon size={15} />
                <span className="category-label">{c}</span>
              </button>
            );
          })}
        </div>
        <div className="toolbar-end">
          <button
            aria-label="Фильтры"
            className={`filter-button ${timeFilter !== 'any' ? 'has-filter' : ''}`}
            onClick={() => setFiltersOpen(!filtersOpen)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal size={17} />
            <span>Фильтры</span>
            {timeFilter !== 'any' && <i />}
          </button>
          <div className="view-toggle">
            <button
              className={!feedMode ? 'selected' : ''}
              aria-label="Карта"
              onClick={() => {
                setFeedMode(false);
                setMobileView('map');
              }}
            >
              <MapIcon size={16} />
              <span>Карта</span>
            </button>
            <button
              className={feedMode ? 'selected' : ''}
              aria-label="Лента"
              onClick={() => {
                setFeedMode(true);
                setMobileView('feed');
              }}
            >
              <Grid2X2 size={16} />
              <span>Лента</span>
            </button>
          </div>
        </div>
        {filtersOpen && (
          <div className="filter-popover">
            <b>Радиус поездки</b>
            <label>
              Откуда считать время
              <select
                aria-label="Начало радиуса поиска"
                value={radiusRegion}
                onChange={(e) => setRadiusRegion(e.target.value)}
              >
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.originName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ориентир по времени
              <select
                aria-label="Максимальное время в пути"
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
              >
                <option value="any">Без ограничений</option>
                <option value="1">До 1 часа</option>
                <option value="2">До 2 часов</option>
                <option value="4">До 4 часов</option>
              </select>
            </label>
            <p>
              Грубая оценка: расстояние по прямой / 55 км/ч. Дорожное время появится после
              построения маршрута.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTimeFilter('any');
                setCategory('Все места');
              }}
            >
              Сбросить фильтры
            </Button>
          </div>
        )}
      </div>
      <main className={`workspace mobile-${mobileView}`}>
        <section className="discovery-panel" aria-label="Лента мест">
          <div className="discovery-heading compact-discovery">
            <div className="eyebrow">
              <span /> СМОТРЕТЬ. ВЫБИРАТЬ. ЕХАТЬ.
            </div>
            <h1>{savedOnly ? 'Ваши открытия' : 'Места для вашей поездки'}</h1>
            <p>
              {savedOnly
                ? 'Любимые места для следующей поездки.'
                : 'Посмотрите видео. Выберите свои остановки.'}
            </p>
            <div className="region-caption">
              <MapPin size={13} />
              <b>Все направления</b>
              <span>·</span>
              <span>
                {allPlaces.length} мест · {allPlaces.filter((p) => p.video).length} видео
              </span>
            </div>
          </div>
          {savedOnly && (
            <nav className="saved-locations" aria-label="Сохранённое по локациям">
              <button aria-pressed={!savedLocation} onClick={() => setSavedLocation('')}>
                Все локации
              </button>
              {savedGroups.map((group) => (
                <button
                  key={group.id}
                  aria-pressed={group.id === savedLocation}
                  onClick={() => chooseLocation(group.id)}
                >
                  <MapPin size={15} />
                  <span>
                    <b>{group.name}</b>
                    <small>
                      {group.region} · {group.places.length} мест
                    </small>
                  </span>
                </button>
              ))}
              {!savedGroups.length && (
                <p>Сохраняйте места из любых регионов — здесь они соберутся по локациям.</p>
              )}
            </nav>
          )}
          <div className="feed-toolbar">
            <h2>
              {savedOnly ? 'Сохранённые места' : 'Вдохновение рядом'} <span>{filtered.length}</span>
            </h2>
            <button
              onClick={() => {
                setCategory('Все места');
                setQuery('');
                setTimeFilter('any');
                setSavedOnly(false);
              }}
              title="Показать все места"
            >
              Все места <ArrowDown size={13} />
            </button>
          </div>
          {loading && (
            <div className="loading-line" role="status">
              Обновляем места…
            </div>
          )}
          <div className="place-grid" ref={gridRef}>
            {filtered.map((p, i) => (
              <div
                key={p.id}
                ref={(el) => {
                  cardRefs.current[p.id] = el;
                }}
                className={`place-card ${active?.id === p.id ? 'active' : ''}`}
              >
                <div className="place-poster">
                  <button
                    className="poster-open"
                    aria-label={`Открыть ${p.name}`}
                    data-preview-url={p.video?.previewUrl || p.video?.playbackUrl}
                    onClick={() => {
                      if (p.video) {
                        openReel(p);
                      } else selectPlace(p);
                    }}
                  >
                    <PlaceImage place={p} loading={i < 4 ? 'eager' : 'lazy'} />
                    <div className="poster-shade" />
                    <span className="place-kind">
                      {p.video ? (
                        <>
                          <Play size={10} fill="currentColor" /> ВИДЕО
                        </>
                      ) : (
                        <>
                          <Mountain size={10} /> МЕСТО
                        </>
                      )}
                    </span>
                    <div className="poster-title">
                      <span>{p.category}</span>
                      <h3>{p.name}</h3>
                      <small>
                        <MapPin size={11} />
                        {p.city}
                      </small>
                    </div>
                    <span className="poster-arrow">
                      <ArrowUpRight size={16} />
                    </span>
                  </button>
                  <button
                    disabled={!hydrated}
                    className={`save-button ${hydrated && saved.includes(p.id) ? 'saved' : ''}`}
                    aria-label={`${saved.includes(p.id) ? 'Убрать из сохранённого' : 'Сохранить'} ${p.name}`}
                    onClick={() => toggleSaved(p.id)}
                  >
                    <Bookmark
                      size={15}
                      fill={hydrated && saved.includes(p.id) ? 'currentColor' : 'none'}
                    />
                  </button>
                </div>
                <div className="place-card-footer">
                  <span>
                    <Clock size={12} />
                    {p.visitMinutes < 60 ? `${p.visitMinutes} мин` : `${p.visitMinutes / 60} ч`} на
                    месте
                  </span>
                  <button
                    aria-label={`${trip.includes(p.id) ? 'Убрать из поездки' : 'Добавить в поездку'} ${p.name}`}
                    disabled={!hydrated}
                    className={hydrated && trip.includes(p.id) ? 'added' : ''}
                    onClick={() => addToTrip(p.id)}
                  >
                    {hydrated && trip.includes(p.id) ? <Check size={16} /> : <Plus size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!filtered.length && (
            <div className="empty-state">
              <Search size={30} />
              <h3>{savedOnly ? 'Здесь будут ваши открытия' : 'Пока ничего не найдено'}</h3>
              <p>
                {savedOnly
                  ? 'Нажмите на закладку у понравившегося места.'
                  : 'Попробуйте другой запрос или категорию. В демо нет кафе и отелей с непроверенными данными.'}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSavedOnly(false);
                  setQuery('');
                  setCategory('Все места');
                  setTimeFilter('any');
                }}
              >
                Показать все места
              </Button>
            </div>
          )}
          <div className="feed-end">
            <Compass size={18} />
            <p>
              Не обязательно далеко.
              <br />
              <b>Главное — отправиться.</b>
            </p>
          </div>
        </section>
        <section className="map-panel" aria-label="Интерактивная карта">
          <ExplorerMap
            region={region}
            focusRequest={focusRequest}
            onRegionChange={setMapRegionId}
            tripIds={trip}
            onTripToggle={addToTrip}
            places={mapPlaces}
            onNeedVideos={loadMapVideos}
            active={active}
            onSelect={selectPlace}
            route={route}
            pickMode={pickMode}
            previewsVisible={!tripOpen && !importOpen && !about && !reelId}
            onPick={(latitude, longitude) => {
              setLocation({ latitude, longitude });
              setPickMode(false);
              setImportOpen(true);
            }}
          />
          <button
            className="mobile-reel-launch"
            aria-label="Смотреть видеоленту"
            title="Видео без карты"
            disabled={!filtered.some((p) => p.video)}
            onClick={() => {
              const first = active?.video ? active : filtered.find((p) => p.video);
              if (first) openReel(first);
            }}
          >
            <Play size={26} fill="currentColor" />
          </button>
          <div className="map-discover-label">
            <span className="tiny-compass">
              <Compass size={16} />
            </span>
            <div>
              <b>
                Меньше планов.
                <br />
                Больше открытий.
              </b>
              <p>Выберите место на карте</p>
            </div>
          </div>
          {active && !tripOpen && !pickMode && (
            <div
              className="active-preview"
              key={active.id}
              onTouchStart={(e) => {
                touch.current = e.touches[0].clientX;
              }}
              onTouchEnd={(e) => {
                const d = e.changedTouches[0].clientX - touch.current;
                if (Math.abs(d) > 60) next(d < 0 ? 1 : -1);
              }}
            >
              <button
                className="preview-close"
                aria-label="Закрыть место"
                onClick={() => setActive(null)}
              >
                <X size={20} />
              </button>
              <div className="preview-media">
                <VideoPlayer place={active} />
                {active.video && (
                  <button
                    id="map-watch-video"
                    className="preview-watch-button"
                    onClick={() => openReel(active, true)}
                  >
                    <Play size={17} />
                    Смотреть видео
                  </button>
                )}
                <div className="preview-nav">
                  <button aria-label="Предыдущее место" onClick={() => next(-1)}>
                    <ArrowLeft size={15} />
                  </button>
                  <span>
                    {Math.max(1, previewPlaces.findIndex((p) => p.id === active.id) + 1)} /{' '}
                    {previewPlaces.length}
                  </span>
                  <button aria-label="Следующее место" onClick={() => next(1)}>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
              <div className="preview-body">
                <div className="preview-category">
                  {active.category} <span>· {active.city}</span>
                </div>
                <h2>{active.name}</h2>
                <p>{active.description}</p>
                <VideoAttribution place={active} />
                <div className="preview-links">
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${active.latitude}&mlon=${active.longitude}#map=14/${active.latitude}/${active.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    На карте <ArrowUpRight size={12} />
                  </a>
                  {active.imagePage && (
                    <a href={active.imagePage} target="_blank" rel="noopener noreferrer">
                      О месте и фото <ArrowUpRight size={12} />
                    </a>
                  )}
                </div>
                <div className="preview-actions">
                  <Button size="sm" onClick={() => addToTrip(active.id)}>
                    {trip.includes(active.id) ? <Check size={16} /> : <Plus size={16} />}{' '}
                    {trip.includes(active.id) ? 'В поездке' : 'В поездку'}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`Сохранить ${active.name}`}
                    onClick={() => toggleSaved(active.id)}
                  >
                    <Bookmark
                      size={16}
                      fill={saved.includes(active.id) ? 'currentColor' : 'none'}
                    />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {pickMode && (
            <Button
              className="cancel-pick"
              variant="outline"
              onClick={() => {
                setPickMode(false);
                setImportOpen(true);
              }}
            >
              Отменить выбор
            </Button>
          )}
        </section>
      </main>
      {reelId && reelPlaces.length > 0 && (
        <VideoReel
          key={reelId}
          initialId={reelId}
          places={reelPlaces}
          onLoadMore={loadMoreVideos}
          saved={saved}
          trip={trip}
          onClose={closeReel}
          onCurrentChange={rememberReelPlace}
          onSave={toggleSaved}
          onTrip={addToTrip}
          onMap={(place) => {
            setReelId(null);
            setMobileView('map');
            setFeedMode(false);
            selectPlace(place);
          }}
        />
      )}
      <footer className="status-bar">
        <span>
          <span className="live-dot" />
          Создано для спонтанных выходных
        </span>
        <span>
          Демо: реальные места · фото региона · без вымышленных видео
          <button onClick={() => setAbout(true)}>
            О проекте <ArrowUpRight size={11} />
          </button>
        </span>
      </footer>
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        location={location}
        onPick={() => {
          setImportOpen(false);
          setPickMode(true);
          setActive(null);
          setTripOpen(false);
          setMobileView('map');
          setFeedMode(false);
        }}
        onAdded={(p) => {
          setQuery('');
          setCategory('Все места');
          setTimeFilter('any');
          setSavedOnly(false);
          setActive(p);
          notify('Ваше открытие добавлено на карту.');
        }}
      />
      <Dialog open={about} onOpenChange={setAbout}>
        <DialogContent className="about-dialog">
          <div className="dialog-eyebrow">
            <Compass size={17} /> WEEKEND EXPLORER
          </div>
          <DialogTitle className="dialog-title">
            Из вдохновения —<br />в путешествие.
          </DialogTitle>
          <DialogDescription className="dialog-subtitle">
            Ваши следующие выходные начинаются с одного места.
          </DialogDescription>
          <div className="how-steps">
            <p>
              <span>01</span>
              <b>Откройте своё место</b>Исследуйте карту, переключайте карточки и сохраняйте
              открытия.
            </p>
            <p>
              <span>02</span>
              <b>Соберите впечатления</b>Добавьте места в поездку и выберите один или два дня.
            </p>
            <p>
              <span>03</span>
              <b>Отправляйтесь</b>Постройте маршрут и откройте его в навигаторе.
            </p>
          </div>
          <p className="small-note">
            Карелия и Подмосковье — {allPlaces.length} мест и{' '}
            {allPlaces.filter((p) => p.video).length} коротких видео. Коломенские ролики — семь
            фрагментов двух прогулок Андрея Елбаева с лицензией CC BY 3.0, как она заявлена на
            Commons. Автор и источник указаны у каждого видео. У остальных мест Подмосковья пока
            иллюстрация: отдельного ролика нет. Фотографии региона и иллюстрации не заменяют точный
            вид места. Для островов нужен водный транспорт. Сохранённое хранится в браузере;
            серверное хранение доступно при подключённой базе.
          </p>
          <Button onClick={() => setAbout(false)}>
            Начать исследовать <ArrowUpRight size={17} />
          </Button>
        </DialogContent>
      </Dialog>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button aria-label="Закрыть уведомление" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
