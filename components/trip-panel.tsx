'use client';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import * as D from '@radix-ui/react-dialog';
import {
  X,
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
import { useExplorer } from '@/lib/store';
import { regions, getRegion } from '@/lib/regions';
import { locationGroups, locationId as placeLocationId } from '@/lib/locations';
import { dayPlan, defaultDay, clockLabel } from '@/lib/day-plan';
import { optimizeStops } from '@/lib/routing';
import { distanceLabel, timeLabel } from '@/lib/utils';
import { PlaceImage } from './place-image';
import { Button } from './ui/button';
import { TripCover } from './trip-cover';
import { TripRecommendations } from './trip-recommendations';
export function TripPanel({
  places,
  onClose,
  onRoute,
  route,
  onSelect,
}: {
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
    locationId,
    setLocation,
    transportMode: mode,
    setMode,
    saved,
    daySettings,
    setDaySettings,
  } = useExplorer();
  const groups = useMemo(() => locationGroups(places), [places]);
  const location = groups.find((g) => g.id === locationId);
  const region = getRegion(regionId);
  const stops = useMemo(
    () =>
      trip
        .map((id) => places.find((p) => p.id === id))
        .filter((p): p is Place => !!p && placeLocationId(p) === locationId),
    [trip, places, locationId],
  );
  const settings = daySettings[locationId] || defaultDay;
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
  const opener = useRef(document.activeElement as HTMLElement | null);
  const pending = useRef<AbortController | null>(null);
  const requestKey = useRef('');
  const auto = useRef(false);
  useEffect(() => () => pending.current?.abort(), []);
  const build = useCallback(
    async (shouldOptimize = false) => {
      if (stops.length < 2) {
        onRoute(null);
        return;
      }
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      const ordered = shouldOptimize ? optimizeStops(stops) : stops;
      requestKey.current = `${locationId}:${mode}:${ordered.map((p) => p.id).join(',')}`;
      auto.current = true;
      setBusy(true);
      setError('');
      onRoute(null);
      if (shouldOptimize) reorder(ordered.map((p) => p.id));
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
          state.locationId === locationId &&
          state.transportMode === mode &&
          state.trip.join(',') === ordered.map((p) => p.id).join(',')
        )
          onRoute({ ...data, stopIds: ordered.map((p) => p.id), mode, locationId });
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Маршрут не построен. Повторите попытку.');
      } finally {
        if (pending.current === controller) setBusy(false);
      }
    },
    [stops, mode, locationId, onRoute, reorder],
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
    setOptimize(false);
    reorder(ids);
  }
  function move(index: number, delta: number) {
    const ids = stops.map((p) => p.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    changeTrip(ids);
  }
  function chooseLocation(id: string) {
    pending.current?.abort();
    onRoute(null);
    auto.current = false;
    setBusy(false);
    setError('');
    const destination = regions.find((r) => r.name === groups.find((g) => g.id === id)?.region);
    if (destination) setRegion(destination.id);
    setLocation(id);
  }
  async function save() {
    setSaving(true);
    try {
      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${location?.name || region.name} · один день`,
          durationDays: 1,
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
            title: location?.name,
            locationId,
            durationDays: 1,
            transportMode: mode,
            settings,
            stops,
            route: activeRoute,
            schedule: plan.entries,
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
    (p) => saved.includes(p.id) && placeLocationId(p) === locationId && !trip.includes(p.id),
  );
  return (
    <D.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <D.Portal>
        <D.Overlay className="trip-backdrop" />
        <D.Content
          className="trip-panel"
          onEscapeKeyDown={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = opener.current?.isConnected
              ? opener.current
              : document.querySelector<HTMLElement>(
                  matchMedia('(max-width: 700px)').matches ? '.mobile-trip' : '.trip-button',
                );
            target?.focus({ preventScroll: true });
          }}
        >
          <div className="panel-header">
            <div>
              <div className="dialog-eyebrow">ОДНА ЛОКАЦИЯ · ОДИН ХОРОШИЙ ДЕНЬ</div>
              <D.Title asChild>
                <h2>
                  Моя поездка<span>{stops.length}</span>
                </h2>
              </D.Title>
            </div>
            <D.Close className="icon-button" aria-label="Закрыть поездку">
              <X size={22} />
            </D.Close>
          </div>
          <D.Description className="reel-sr-only">
            Выберите локацию, остановки и время посещения. Маршрут и рекомендации останутся внутри
            выбранной локации.
          </D.Description>
          <div className="trip-content">
            <label className="trip-location-field">
              <MapPin size={18} />
              <span>
                Локация поездки
                <select
                  aria-label="Локация поездки"
                  value={locationId}
                  onChange={(event) => chooseLocation(event.target.value)}
                >
                  {regions.map((r) => (
                    <optgroup key={r.id} label={r.name}>
                      {groups
                        .filter((g) => g.region === r.name)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </span>
            </label>
            <TripCover stops={stops} days={1} mode={mode} route={activeRoute} />
            <div className="day-time-fields">
              <label>
                Начало дня
                <input
                  aria-label="Начало дня"
                  type="time"
                  value={settings.start}
                  onChange={(e) => {
                    if (e.target.value) setDaySettings({ start: e.target.value });
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
                    if (e.target.value) setDaySettings({ end: e.target.value });
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
                  setMode('walk');
                }}
              >
                <Footprints size={18} />
                Пешком
              </button>
            </div>
            {!!savedHere.length && (
              <section className="trip-saved" aria-label="Сохранённое в этой локации">
                <div className="day-section-title">
                  <Bookmark size={17} />
                  <h3>Из ваших сохранённых</h3>
                </div>
                {savedHere.map((p) => (
                  <button
                    key={p.id}
                    disabled={stops.length >= 20}
                    onClick={() => {
                      onRoute(null);
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
                  Добавляйте остановки для этой локации. Сохранённое из других локаций останется в
                  коллекции.
                </p>
                <Button variant="outline" onClick={onClose}>
                  Исследовать локацию
                  <ArrowUpRight size={17} />
                </Button>
              </div>
            ) : (
              <>
                <div className="day-section-title">
                  <Clock size={17} />
                  <h3>Ваш день по шагам</h3>
                </div>
                <p className="trip-hint">
                  Первая остановка — точка старта. Время на месте можно менять, порядок — двигать
                  стрелками.
                </p>
                <ol className="stops day-timeline" aria-label="План дня">
                  {plan.entries.map((entry, index) => (
                    <li key={entry.place.id}>
                      {index > 0 && (
                        <div className="timeline-transfer">
                          {mode === 'car' ? <Car size={14} /> : <Footprints size={14} />}
                          <span>
                            {entry.leg
                              ? `${distanceLabel(entry.leg.distance)} · ${entry.leg.duration != null ? timeLabel(entry.leg.duration) : 'время не рассчитано'}`
                              : 'Переезд будет рассчитан'}
                            {activeRoute?.source === 'straight' && ' · по прямой'}
                          </span>
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
                          <label className="visit-duration">
                            На месте
                            <select
                              aria-label={`Время посещения: ${entry.place.name}`}
                              value={entry.visit}
                              onChange={(e) =>
                                setDaySettings({
                                  visits: {
                                    ...settings.visits,
                                    [entry.place.id]: Number(e.target.value),
                                  },
                                })
                              }
                            >
                              {[
                                ...new Set([
                                  15,
                                  30,
                                  45,
                                  60,
                                  90,
                                  120,
                                  180,
                                  240,
                                  360,
                                  480,
                                  entry.visit,
                                ]),
                              ]
                                .sort((a, b) => a - b)
                                .map((minutes) => (
                                  <option key={minutes} value={minutes}>
                                    {timeLabel(minutes * 60)}
                                  </option>
                                ))}
                            </select>
                          </label>
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
                              changeTrip(
                                stops.filter((p) => p.id !== entry.place.id).map((p) => p.id),
                              )
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
                  Первая остановка остаётся стартом. Предложенный порядок можно изменить.
                </p>
                {activeRoute && (
                  <section className="route-summary" aria-label="Итоги дня">
                    <div className="summary-title">
                      {activeRoute.source === 'osrm' ? 'Маршрут собран' : 'Предварительный план'}
                    </div>
                    <div className="route-stats">
                      <span>
                        <MapPin size={15} />
                        <b>{distanceLabel(activeRoute.distance)}</b>
                        <small>
                          {activeRoute.source === 'straight' ? 'по прямой' : 'по дорогам'}
                        </small>
                      </span>
                      <span>
                        <Clock size={15} />
                        <b>
                          {plan.travel !== null ? timeLabel(plan.travel * 60) : 'Не рассчитано'}
                        </b>
                        <small>в пути</small>
                      </span>
                    </div>
                    <p>{timeLabel(plan.visits * 60)} на остановки · один день.</p>
                    {plan.complete && (
                      <p className="day-finish">
                        Финиш около <strong>{clockLabel(plan.finish)}</strong> · всего{' '}
                        {timeLabel((plan.visits + (plan.travel || 0)) * 60)}
                      </p>
                    )}
                    {plan.overflow > 0 && (
                      <p className="day-overflow" role="status">
                        План длиннее вашего дня минимум на {timeLabel(plan.overflow * 60)}.
                        Сократите посещения или уберите остановку.
                      </p>
                    )}
                    {!plan.complete && (
                      <p>
                        Расписание после первой остановки появится, когда будет известно время
                        переездов.
                      </p>
                    )}
                    {activeRoute.message && <p className="route-warning">{activeRoute.message}</p>}
                  </section>
                )}
                {activeRoute && (
                  <TripRecommendations
                    stops={stops}
                    places={places}
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
                {activeRoute && (
                  <a
                    className="navigation-link"
                    href={`https://www.google.com/maps/dir/?api=1&origin=${stops[0].latitude},${stops[0].longitude}&destination=${stops.at(-1)!.latitude},${stops.at(-1)!.longitude}&waypoints=${stops
                      .slice(1, -1)
                      .map((p) => `${p.latitude},${p.longitude}`)
                      .join('|')}&travelmode=${mode === 'car' ? 'driving' : 'walking'}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Открыть навигацию
                    <ArrowUpRight size={16} />
                  </a>
                )}
              </>
            )}
          </div>
          <div className="trip-footer">
            <Button
              className="full-width"
              disabled={stops.length < 2 || busy || plan.budget <= 0}
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
                  ? 'Учитываем переезды между остановками'
                  : 'Время посещений приблизительное, старт — с первой точки'}
            </small>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
