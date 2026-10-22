'use client';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { yandexRoute, yandexRouteParts } from '@/lib/yandex-route';
import { dgisRoute, dgisRouteParts } from '@/lib/dgis-route';
import {
  ArrowLeft,
  Bus,
  ArrowUp,
  ArrowDown,
  Route,
  Car,
  Footprints,
  ArrowUpRight,
  LoaderCircle,
  Trash2,
  Download,
  Check,
  Clock,
  MapPin,
  Plus,
  Bookmark,
} from 'lucide-react';
import type { Place, RouteResult } from '@/lib/types';
import { cityTripStops } from '@/lib/trip-collection';
import { useExplorer } from '@/lib/store';
import { locationGroups, locationId as placeLocationId } from '@/lib/locations';
import { regions, getRegion } from '@/lib/regions';
import { cityTravelNote } from '@/lib/podmoskovye-data';
import { dayPlan, defaultDay, clockLabel } from '@/lib/day-plan';
import { optimizeStops } from '@/lib/routing';
import { weekendVariants, type WeekendVariant } from '@/lib/weekend-plan';
import { distanceLabel, timeLabel } from '@/lib/utils';
import { PlaceImage } from './place-image';
import { Button } from './ui/button';
import { TripCover } from './trip-cover';
import { TripRecommendations } from './trip-recommendations';
import { WeekendVariants } from './weekend-variants';
import { TripHotels } from './trip-hotels';
import { TripMeals } from './trip-meals';
import { TripDayReport } from './trip-day-report';

function TransferNav({
  from,
  to,
  mode,
}: {
  from: Place;
  to: Place;
  mode: 'car' | 'walk' | 'transit';
}) {
  return (
    <div className="transfer-nav-links">
      <a
        className="transfer-link"
        href={yandexRoute([from, to], mode)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {mode === 'transit'
          ? 'Посмотреть транспорт и пересадки в Яндекс Картах'
          : 'Уточнить путь в Яндекс Картах'}
      </a>
      <a
        className="transfer-link"
        href={dgisRoute([from, to], mode)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {mode === 'transit'
          ? 'Открыть общественный транспорт в 2GIS'
          : 'Открыть путь в 2GIS'}
      </a>
    </div>
  );
}

export function TripPanel({
  places,
  onClose,
  onRoute,
  route,
  onSelect,
  cityId,
  onChooseCity,
  onBackToCities,
}: {
  cityId?: string;
  onChooseCity?: (id: string) => void;
  onBackToCities?: () => void;
  places: Place[];
  onClose: () => void;
  onRoute: (r: RouteResult | null) => void;
  route: RouteResult | null;
  onSelect: (p: Place) => void;
}) {
  const {
    trip,
    toggleTrip,
    reorder,
    regionId,
    setRegion,
    transportMode: mode,
    setMode,
    saved,
    daySettings,
    setDaySettings,
    setDays,
  } = useExplorer();
  const region = getRegion(regionId);
  const locationId = cityId || regionId;
  const city = cityId ? locationGroups(places).find((group) => group.id === cityId) : undefined;
  const destinationName = city?.name || region.name;
  const travelNote = cityTravelNote(city?.name || '', city?.region || '');
  const stops = useMemo(
    () => cityTripStops(trip, places, cityId, regionId),
    [trip, places, cityId, regionId],
  );
  const settings = daySettings[locationId] || daySettings[regionId] || defaultDay;
  const signature = `${locationId}:${mode}:${stops.map((p) => p.id).join(',')}`;
  const activeRoute =
    route?.stopIds?.join(',') === stops.map((p) => p.id).join(',') &&
    route?.mode === mode &&
    route?.locationId === locationId
      ? route
      : null;
  const plan = dayPlan(stops, activeRoute, settings);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [optimize, setOptimize] = useState(true);
  const [error, setError] = useState('');
  const [variants, setVariants] = useState<WeekendVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const requestKey = useRef('');
  const auto = useRef(false);
  const userOrderRef = useRef<Place[]>([]);

  const selectedVariant =
    variants.find((v) => v.id === selectedVariantId) || variants[0] || null;

  useEffect(() => () => pending.current?.abort(), []);

  useEffect(() => {
    if (!selectedVariant) return;
    setDays(selectedVariant.durationDays);
  }, [selectedVariant, setDays]);

  useEffect(() => {
    if (!activeRoute || stops.length < 2) return;
    const nextVariants = weekendVariants(stops, activeRoute, settings, {
      userOrder: userOrderRef.current.length ? userOrderRef.current : stops,
    });
    setVariants(nextVariants);
    setSelectedVariantId((current) =>
      current && nextVariants.some((v) => v.id === current)
        ? current
        : nextVariants[0]?.id || null,
    );
  }, [activeRoute, settings, stops]);

  const build = useCallback(
    async (
      shouldOptimize = false,
      forcedOrder?: Place[],
      preferVariantId?: string,
    ) => {
      if (stops.length < 2 || stops.length > 20 || plan.budget <= 0) {
        onRoute(null);
        setVariants([]);
        setSelectedVariantId(null);
        return;
      }
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      if (!forcedOrder) userOrderRef.current = stops;
      const ordered =
        forcedOrder || (shouldOptimize ? optimizeStops(stops) : stops);
      requestKey.current = `${locationId}:${mode}:${ordered.map((p) => p.id).join(',')}`;
      auto.current = true;
      setBusy(true);
      setError('');
      onRoute(null);
      if (
        ordered.map((p) => p.id).join(',') !== stops.map((p) => p.id).join(',')
      )
        reorder(
          ordered.map((p) => p.id),
          trip.filter((id) => !stops.some((p) => p.id === id)),
        );
      const expectedTrip = useExplorer.getState().trip.join(',');
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
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось построить маршрут.');
        const state = useExplorer.getState();
        if (
          !controller.signal.aborted &&
          state.regionId === regionId &&
          state.transportMode === mode &&
          state.trip.join(',') === expectedTrip
        ) {
          const nextRoute: RouteResult = {
            ...data,
            stopIds: ordered.map((p) => p.id),
            mode,
            locationId,
          };
          onRoute(nextRoute);
          const nextVariants = weekendVariants(ordered, nextRoute, settings, {
            userOrder: userOrderRef.current,
          });
          setVariants(nextVariants);
          setSelectedVariantId(
            (preferVariantId &&
              nextVariants.find((v) => v.id === preferVariantId)?.id) ||
              nextVariants[0]?.id ||
              null,
          );
        }
      } catch (e) {
        const state = useExplorer.getState();
        if (
          !controller.signal.aborted &&
          state.regionId === regionId &&
          state.transportMode === mode &&
          state.trip.join(',') === expectedTrip
        )
          setError(e instanceof Error ? e.message : 'Маршрут не построен. Повторите попытку.');
      } finally {
        if (pending.current === controller) setBusy(false);
      }
    },
    [stops, mode, locationId, regionId, trip, onRoute, reorder, plan.budget, settings],
  );

  useEffect(() => {
    if (!auto.current || requestKey.current === signature) return;
    const timer = setTimeout(() => {
      if (requestKey.current !== signature) void build(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [signature, build]);

  function changeTrip(ids: string[]) {
    pending.current?.abort();
    onRoute(null);
    setVariants([]);
    setSelectedVariantId(null);
    setOptimize(false);
    reorder(
      ids,
      trip.filter((id) => !stops.some((p) => p.id === id)),
    );
  }

  function move(index: number, delta: number) {
    const ids = stops.map((p) => p.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    changeTrip(ids);
  }

  function chooseLocation(id: string) {
    pending.current?.abort();
    onRoute(null);
    setVariants([]);
    setSelectedVariantId(null);
    auto.current = false;
    setBusy(false);
    setError('');
    setRegion(id);
  }

  function selectVariant(id: string) {
    const variant = variants.find((v) => v.id === id);
    if (!variant) return;
    const sameOrder =
      variant.order.map((p) => p.id).join(',') === stops.map((p) => p.id).join(',');
    if (sameOrder) {
      setSelectedVariantId(id);
      return;
    }
    void build(false, variant.order, variant.id);
  }

  async function save() {
    setSaving(true);
    const days = selectedVariant?.durationDays || 1;
    try {
      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${destinationName} · ${days === 1 ? 'один день' : 'выходные'}`,
          durationDays: days,
          transportMode: mode,
          stops: stops.map((p) => p.id),
        }),
      });
      const data = await response.json();
      setFeedback(
        response.ok
          ? 'Поездка сохранена на сервере. Расписание доступно в этом браузере.'
          : data.error || 'Не удалось сохранить поездку на сервере.',
      );
    } catch {
      setFeedback('Сервер недоступен. Поездка сохранена в браузере.');
    } finally {
      setSaving(false);
    }
  }

  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            title: destinationName,
            regionId,
            locationId,
            durationDays: selectedVariant?.durationDays || 1,
            transportMode: mode,
            settings: { start: settings.start, end: settings.end, visits: {} },
            stops,
            route: activeRoute,
            schedule: plan.entries,
            weekendVariant: selectedVariant
              ? {
                  id: selectedVariant.id,
                  title: selectedVariant.title,
                  days: selectedVariant.days.map((d) => ({
                    label: d.label,
                    stopIds: d.stops.map((p) => p.id),
                  })),
                }
              : null,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `weekend-${region.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const savedHere = places.filter(
    (p) =>
      saved.includes(p.id) &&
      (cityId ? placeLocationId(p) === cityId : p.region === region.name) &&
      !trip.includes(p.id),
  );
  const catalogPool = cityId ? places.filter((p) => placeLocationId(p) === cityId) : places;
  const timelineStops = selectedVariant?.order.length ? selectedVariant.order : stops;
  const timelinePlan = dayPlan(timelineStops, activeRoute, settings);
  const durationDays = selectedVariant?.durationDays || 1;
  const sourceLabel =
    activeRoute?.source === 'dgis'
      ? '2GIS'
      : activeRoute?.source === 'osrm'
        ? 'по дорогам'
        : 'по прямой';

  return (
    <main className="trip-panel trip-page" aria-label="Создание поездки">
      <div className="panel-header">
        <div>
          <div className="dialog-eyebrow">
            {destinationName.toUpperCase()} · ВЫХОДНЫЕ
          </div>
          <h2>
            Моя поездка<span>{stops.length}</span>
          </h2>
          {travelNote && <p className="trip-city-note">{travelNote}</p>}
        </div>
        <button className="icon-button" aria-label="Вернуться к местам" onClick={onClose}>
          <ArrowLeft size={22} />
        </button>
      </div>
      <p className="reel-sr-only">
        Выберите регион и остановки. Места разных городов региона входят в одну поездку.
      </p>
      <div className="trip-content">
        {trip.some((id) => !places.some((p) => p.id === id)) && (
          <p className="route-warning" role="status">
            Некоторые сохранённые места сейчас недоступны. Их точки сохранены в браузере и появятся
            после загрузки данных.
          </p>
        )}
        <Button variant="outline" onClick={onClose}>
          Выбрать места в каталоге <ArrowUpRight size={17} />
        </Button>
        {cityId ? (
          <label className="trip-location-field">
            <MapPin size={18} />
            <span>
              Город поездки
              <select
                aria-label="Город поездки"
                value={cityId}
                onChange={(e) => onChooseCity?.(e.target.value)}
              >
                {locationGroups(places).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} · {group.region}
                  </option>
                ))}
              </select>
            </span>
          </label>
        ) : (
          <label className="trip-location-field">
            <MapPin size={18} />
            <span>
              Регион поездки
              <select
                aria-label="Регион поездки"
                value={locationId}
                onChange={(event) => chooseLocation(event.target.value)}
              >
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </span>
          </label>
        )}
        {onBackToCities && (
          <Button variant="outline" onClick={onBackToCities}>
            <ArrowLeft size={16} /> Все города и добавленные места
          </Button>
        )}
        <TripCover stops={stops} days={durationDays} mode={mode} route={activeRoute} />
        <div className="day-time-fields">
          <label>
            Начало дня
            <input
              aria-label="Начало дня"
              type="time"
              value={settings.start}
              onChange={(e) => {
                if (e.target.value) setDaySettings({ start: e.target.value }, locationId);
              }}
            />
          </label>
          <label>
            Закончить к
            <input
              aria-label="Окончание дня"
              type="time"
              value={settings.end}
              onChange={(e) => {
                if (e.target.value) setDaySettings({ end: e.target.value }, locationId);
              }}
            />
          </label>
        </div>
        {plan.budget <= 0 && (
          <p className="form-error" role="alert">
            Окончание дня должно быть позже начала.
          </p>
        )}
        <div className="transport-options">
          <button
            aria-pressed={mode === 'car'}
            className={mode === 'car' ? 'selected' : ''}
            onClick={() => {
              onRoute(null);
              setVariants([]);
              setSelectedVariantId(null);
              setMode('car');
            }}
          >
            <Car size={18} />
            На автомобиле
          </button>
          <button
            aria-pressed={mode === 'walk'}
            className={mode === 'walk' ? 'selected' : ''}
            onClick={() => {
              onRoute(null);
              setVariants([]);
              setSelectedVariantId(null);
              setMode('walk');
            }}
          >
            <Footprints size={18} />
            Пешком
          </button>
        </div>
        <button
          className={`transit-option ${mode === 'transit' ? 'selected' : ''}`}
          aria-pressed={mode === 'transit'}
          onClick={() => {
            onRoute(null);
            setVariants([]);
            setSelectedVariantId(null);
            setMode('transit');
          }}
        >
          <Bus size={18} /> Общественный транспорт
        </button>
        {!!savedHere.length && (
          <section className="trip-saved" aria-label="Сохранённое в этом регионе">
            <div className="day-section-title">
              <Bookmark size={17} />
              <h3>Из ваших сохранённых</h3>
            </div>
            {savedHere.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onRoute(null);
                  setVariants([]);
                  setSelectedVariantId(null);
                  toggleTrip(p.id);
                }}
                aria-label={`Добавить сохранённое: ${p.name}`}
              >
                <span>{p.name}</span>
                <Plus size={18} />
              </button>
            ))}
          </section>
        )}
        {!stops.length ? (
          <div className="empty-state">
            <Route size={36} />
            <h3>Начните с любимого места</h3>
            <p>
              Добавляйте остановки из разных городов региона. Сохранённое из других регионов
              останется в коллекции.
            </p>
            <Button variant="outline" onClick={onClose}>
              Исследовать регион
              <ArrowUpRight size={17} />
            </Button>
          </div>
        ) : (
          <>
            <div className="day-section-title">
              <Clock size={17} />
              <h3>{activeRoute ? 'Итоговый маршрут' : 'Остановки поездки'}</h3>
            </div>
            <p className="trip-hint">
              Первая остановка — точка старта. Порядок можно менять стрелками. Время на месте —
              ориентировочная редакционная оценка, а не измеренная статистика посещений.
            </p>
            <p className="trip-hint">
              Старт: {stops[0]?.name} · Финиш: {stops.at(-1)?.name}
            </p>
            <ol className="stops day-timeline" aria-label="План дня">
              {timelinePlan.entries.map((entry, index) => (
                <li key={entry.place.id}>
                  {index > 0 && (
                    <div className="timeline-transfer">
                      {mode === 'car' ? (
                        <Car size={14} />
                      ) : mode === 'transit' ? (
                        <Bus size={14} />
                      ) : (
                        <Footprints size={14} />
                      )}
                      <div>
                        <strong>
                          {mode === 'car'
                            ? 'На автомобиле'
                            : mode === 'transit'
                              ? 'Общественным транспортом'
                              : 'Пешком'}
                          : {timelineStops[index - 1].name} → {entry.place.name}
                        </strong>
                        <br />
                        {entry.leg
                          ? `${distanceLabel(entry.leg.distance)} · ${entry.leg.duration != null ? timeLabel(entry.leg.duration) : 'время не рассчитано'}`
                          : 'Переезд будет рассчитан'}
                        {activeRoute?.source === 'straight' && ' · по прямой'}
                        {activeRoute?.source === 'dgis' && ' · 2GIS'}
                        {!!entry.leg?.instructions?.length && (
                          <ol className="transfer-instructions">
                            {entry.leg.instructions.map((step, i) => (
                              <li key={i}>
                                {step.text}
                                {step.distance > 0 ? ' · ' + distanceLabel(step.distance) : ''}
                              </li>
                            ))}
                          </ol>
                        )}
                        {activeRoute && (
                          <TransferNav
                            from={timelineStops[index - 1]}
                            to={entry.place}
                            mode={mode}
                          />
                        )}
                      </div>
                    </div>
                  )}
                  <div className="timeline-stop">
                    <div className="stop-number">{index + 1}</div>
                    <button
                      className="stop-image"
                      onClick={() => onSelect(entry.place)}
                      aria-label={`На карте: ${entry.place.name}`}
                    >
                      <PlaceImage place={entry.place} />
                    </button>
                    <div className="stop-info">
                      <span className="stop-time">
                        {entry.arrival === null
                          ? 'Время после расчёта переезда'
                          : `${clockLabel(entry.arrival)} — ${clockLabel(entry.departure)}`}
                      </span>
                      <button onClick={() => onSelect(entry.place)}>{entry.place.name}</button>
                      <p className="visit-duration">
                        На месте: {timeLabel(entry.visit * 60)} · ориентировочно
                      </p>
                      <p className="stop-description">{entry.place.description}</p>
                    </div>
                    <div className="stop-actions">
                      <button
                        disabled={index === 0}
                        aria-label={`Поднять ${entry.place.name}`}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={17} />
                      </button>
                      <button
                        disabled={index === stops.length - 1}
                        aria-label={`Опустить ${entry.place.name}`}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={17} />
                      </button>
                      <button
                        aria-label={`Удалить ${entry.place.name}`}
                        onClick={() =>
                          changeTrip(stops.filter((p) => p.id !== entry.place.id).map((p) => p.id))
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={optimize}
                onChange={(e) => setOptimize(e.target.checked)}
              />
              Предложить порядок по близости
            </label>
            <p className="small-note">
              Первая остановка остаётся стартом. Оптимизация помогает уложить выходные; ваш порядок
              сохраняется как один из вариантов после сборки.
            </p>
            {activeRoute && variants.length > 0 && (
              <WeekendVariants
                variants={variants}
                selectedId={selectedVariantId}
                onSelect={selectVariant}
              />
            )}
            {activeRoute && selectedVariant && (
              <>
                {selectedVariant.days.map((day) => (
                  <section
                    key={day.dayIndex}
                    className="weekend-day-block"
                    aria-label={day.label}
                  >
                    <div className="day-section-title">
                      <Clock size={17} />
                      <h3>{day.label}</h3>
                    </div>
                    <p className="trip-hint">
                      {day.stops.map((p) => p.name).join(' → ')}
                      {day.overflow > 0
                        ? ` · не умещается примерно на ${timeLabel(day.overflow * 60)}`
                        : ''}
                    </p>
                    <TripMeals dayStops={day.stops} catalogPlaces={catalogPool} />
                  </section>
                ))}
                {selectedVariant.overnight && (
                  <TripHotels eveningPlace={selectedVariant.eveningPlace} />
                )}
                <TripDayReport days={selectedVariant.days} degraded={selectedVariant.degraded} />
              </>
            )}
            {activeRoute && (
              <section className="route-summary" aria-label="Итоги дня">
                <div className="summary-title">
                  {activeRoute.source === 'straight'
                    ? 'Предварительный план'
                    : 'Маршрут собран'}
                </div>
                <div className="route-stats">
                  <span>
                    <MapPin size={15} />
                    <b>{distanceLabel(activeRoute.distance)}</b>
                    <small>{sourceLabel}</small>
                  </span>
                  <span>
                    <Clock size={15} />
                    <b>
                      {timelinePlan.travel !== null
                        ? timeLabel(timelinePlan.travel * 60)
                        : 'Не рассчитано'}
                    </b>
                    <small>в пути</small>
                  </span>
                </div>
                <p>
                  {timeLabel(timelinePlan.visits * 60)} на остановки ·{' '}
                  {durationDays === 1 ? 'один день' : 'выходные, 2 дня'}.
                </p>
                {timelinePlan.complete && durationDays === 1 && (
                  <p className="day-finish">
                    Финиш около <strong>{clockLabel(timelinePlan.finish)}</strong> · всего{' '}
                    {timeLabel((timelinePlan.visits + (timelinePlan.travel || 0)) * 60)}
                  </p>
                )}
                {selectedVariant?.fitStatus === 'overflow' && (
                  <p className="day-overflow" role="status">
                    Даже за выходные при текущем окне дня не всё умещается. Уберите остановку или
                    смените режим транспорта.
                  </p>
                )}
                {timelinePlan.overflow > 0 && durationDays === 1 && (
                  <p className="day-overflow" role="status">
                    План длиннее вашего дня минимум на {timeLabel(timelinePlan.overflow * 60)}.
                    Выберите вариант на 2 дня или уберите остановку.
                  </p>
                )}
                {!timelinePlan.complete && (
                  <p>
                    Расписание после первой остановки появится, когда будет известно время
                    переездов. Дни можно разложить по длительности посещений.
                  </p>
                )}
                {activeRoute.message && <p className="route-warning">{activeRoute.message}</p>}
              </section>
            )}
            {activeRoute && (
              <TripRecommendations
                stops={stops}
                places={catalogPool}
                route={activeRoute}
                mode={mode}
                onAdd={(place, index) => {
                  const ids = stops.map((p) => p.id);
                  ids.splice(index, 0, place.id);
                  changeTrip(ids);
                }}
              />
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {feedback && (
              <p className="trip-feedback" role="status" aria-live="polite">
                {feedback}
              </p>
            )}
            <div className="trip-extra">
              <Button variant="outline" size="sm" onClick={download}>
                <Download size={15} />
                Скачать план
              </Button>
              <Button variant="outline" size="sm" onClick={save} disabled={saving}>
                {saving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
                Сохранить на сервере
              </Button>
            </div>
            {activeRoute && stops.length > 10 && (
              <p className="trip-hint">
                Яндекс Карты и 2GIS принимают ограниченное число точек за раз. Маршрут разделён на
                последовательные части с общей остановкой на границе. Все места сохранены.
              </p>
            )}
            {activeRoute &&
              yandexRouteParts(stops, mode).map((href, index, parts) => (
                <a
                  key={`ya-${href}`}
                  className="navigation-link"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Маршрут в Яндекс Картах
                  {parts.length > 1
                    ? ` · часть ${index + 1}: остановки ${index * 9 + 1}–${Math.min(index * 9 + 10, stops.length)}`
                    : ''}
                  <ArrowUpRight size={16} />
                </a>
              ))}
            {activeRoute &&
              dgisRouteParts(stops, mode).map((href, index, parts) => (
                <a
                  key={`dg-${href}`}
                  className="navigation-link navigation-link-dgis"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Маршрут в 2GIS
                  {parts.length > 1
                    ? ` · часть ${index + 1}: остановки ${index * 9 + 1}–${Math.min(index * 9 + 10, stops.length)}`
                    : ''}
                  <ArrowUpRight size={16} />
                </a>
              ))}
          </>
        )}
      </div>
      <div className="trip-footer">
        {stops.length > 20 && (
          <p className="form-error" role="alert">
            В этой локации больше 20 мест. Все точки сохранены. Удалите лишние остановки перед
            расчётом маршрута.
          </p>
        )}
        <Button
          className="full-width"
          disabled={stops.length < 2 || stops.length > 20 || busy || plan.budget <= 0}
          onClick={() => {
            void build(optimize);
          }}
        >
          {busy ? <LoaderCircle size={18} className="spin" /> : <Route size={18} />}{' '}
          {busy ? 'Собираем маршрут…' : 'Собрать маршрут'}
          <ArrowUpRight size={18} />
        </Button>
        <small>
          {stops.length < 2
            ? 'Добавьте минимум два места в этой локации'
            : busy
              ? 'Считаем путь и варианты выходных'
              : 'Оптимизация порядка и 1–2 дня, чтобы успеть за выходные'}
        </small>
      </div>
    </main>
  );
}
