'use client';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { yandexRoute, yandexRouteParts } from '@/lib/yandex-route';
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
  const pending = useRef<AbortController | null>(null);
  const requestKey = useRef('');
  const auto = useRef(false);
  useEffect(() => () => pending.current?.abort(), []);
  const build = useCallback(
    async (shouldOptimize = false) => {
      if (stops.length < 2 || stops.length > 20 || plan.budget <= 0) {
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
      if (shouldOptimize)
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
        )
          onRoute({ ...data, stopIds: ordered.map((p) => p.id), mode, locationId });
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
    [stops, mode, locationId, regionId, trip, onRoute, reorder, plan.budget],
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
    auto.current = false;
    setBusy(false);
    setError('');
    setRegion(id);
  }
  async function save() {
    setSaving(true);
    try {
      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${destinationName} · один день`,
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
            title: destinationName,
            regionId,
            locationId,
            durationDays: 1,
            transportMode: mode,
            settings: { start: settings.start, end: settings.end, visits: {} },
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
    (p) =>
      saved.includes(p.id) &&
      (cityId ? placeLocationId(p) === cityId : p.region === region.name) &&
      !trip.includes(p.id),
  );
  return (
    <main className="trip-panel trip-page" aria-label="Создание поездки">
      <div className="panel-header">
        <div>
          <div className="dialog-eyebrow">{destinationName.toUpperCase()} · ОДИН ХОРОШИЙ ДЕНЬ</div>
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
          <>
            {' '}
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
          </>
        )}
        {onBackToCities && (
          <Button variant="outline" onClick={onBackToCities}>
            <ArrowLeft size={16} /> Все города и добавленные места
          </Button>
        )}
        <TripCover stops={stops} days={1} mode={mode} route={activeRoute} />
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
        <button
          className={`transit-option ${mode === 'transit' ? 'selected' : ''}`}
          aria-pressed={mode === 'transit'}
          onClick={() => {
            onRoute(null);
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
              {plan.entries.map((entry, index) => (
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
                          : {stops[index - 1].name} → {entry.place.name}
                        </strong>
                        <br />
                        {entry.leg
                          ? `${distanceLabel(entry.leg.distance)} · ${entry.leg.duration != null ? timeLabel(entry.leg.duration) : 'время не рассчитано'}`
                          : 'Переезд будет рассчитан'}
                        {activeRoute?.source === 'straight' && ' · по прямой'}
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
                          <a
                            className="transfer-link"
                            href={yandexRoute([stops[index - 1], entry.place], mode)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {mode === 'transit'
                              ? 'Посмотреть транспорт и пересадки в Яндекс Картах'
                              : 'Уточнить путь в Яндекс Картах'}
                          </a>
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
                    <small>{activeRoute.source === 'straight' ? 'по прямой' : 'по дорогам'}</small>
                  </span>
                  <span>
                    <Clock size={15} />
                    <b>{plan.travel !== null ? timeLabel(plan.travel * 60) : 'Не рассчитано'}</b>
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
                    План длиннее вашего дня минимум на {timeLabel(plan.overflow * 60)}. Уберите
                    остановку или измените границы дня.
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
            {activeRoute && mode !== 'transit' && (
              <TripRecommendations
                stops={stops}
                places={cityId ? places.filter((p) => placeLocationId(p) === cityId) : places}
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
                Яндекс Карты принимают до 10 точек за один раз. Маршрут разделён на последовательные
                части с общей остановкой на границе. Все места сохранены.
              </p>
            )}
            {activeRoute &&
              yandexRouteParts(stops, mode).map((href, index, parts) => (
                <a
                  key={href}
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
              ? 'Учитываем переезды между остановками'
              : 'Время посещений приблизительное, старт — с первой точки'}
        </small>
      </div>
    </main>
  );
}
