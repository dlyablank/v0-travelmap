'use client';
import { useEffect, useState, useRef } from 'react';
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
  Sparkles,
  Clock,
  MapPin,
} from 'lucide-react';
import type { Place, RouteResult } from '@/lib/types';
import { useExplorer } from '@/lib/store';
import { getRegion } from '@/lib/regions';
import { optimizeStops } from '@/lib/routing';
import { distanceLabel, timeLabel } from '@/lib/utils';
import { PlaceImage } from './place-image';
import { Button } from './ui/button';
import { TripCover } from './trip-cover';
export function TripPanel({
  places,
  onClose,
  onRoute,
  route,
  onSelect,
  onMessage,
}: {
  places: Place[];
  onClose: () => void;
  onRoute: (r: RouteResult | null) => void;
  route: RouteResult | null;
  onSelect: (p: Place) => void;
  onMessage: (m: string) => void;
}) {
  const trip = useExplorer((s) => s.trip),
    toggleTrip = useExplorer((s) => s.toggleTrip),
    reorder = useExplorer((s) => s.reorder);
  const stops = trip.map((id) => places.find((p) => p.id === id)).filter((p): p is Place => !!p);
  const regionId = useExplorer((s) => s.regionId);
  const region = getRegion(regionId);
  const days = useExplorer((s) => s.durationDays),
    setDays = useExplorer((s) => s.setDays);
  const mode = useExplorer((s) => s.transportMode),
    setMode = useExplorer((s) => s.setMode);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optimize, setOptimize] = useState(true);
  const [error, setError] = useState('');
  const tripKey = trip.join(',');
  const previous = useRef(tripKey + mode);
  useEffect(() => {
    if (previous.current !== tripKey + mode) {
      previous.current = tripKey + mode;
      onRoute(null);
    }
  }, [tripKey, mode, onRoute]);
  async function build() {
    setBusy(true);
    setError('');
    const ordered = optimize ? optimizeStops(stops) : stops;
    if (optimize) reorder(ordered.map((p) => p.id));
    try {
      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stops: ordered.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
          mode,
        }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      const current = useExplorer.getState();
      if (
        current.trip.join(',') === ordered.map((p) => p.id).join(',') &&
        current.transportMode === mode
      )
        onRoute(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Маршрут не построен. Повторите попытку.');
    } finally {
      setBusy(false);
    }
  }
  function move(i: number, d: number) {
    const ids = [...trip];
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    reorder(ids);
  }
  async function save() {
    setSaving(true);
    try {
      const r = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: region.heading,
          durationDays: days,
          transportMode: mode,
          stops: trip,
        }),
      });
      const data = await r.json();
      onMessage(r.ok ? 'Поездка сохранена на сервере' : data.error);
    } catch {
      onMessage('Сервер недоступен. Поездка сохранена в браузере.');
    } finally {
      setSaving(false);
    }
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            title: region.heading,
            durationDays: days,
            transportMode: mode,
            stops,
            route,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekend-${region.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const visit = stops.reduce((s, p) => s + p.visitMinutes * 60, 0);
  return (
    <aside className="trip-panel">
      <div className="panel-header">
        <div>
          <div className="dialog-eyebrow">ВЫХОДНЫЕ В ВАШЕМ РИТМЕ</div>
          <h2>
            Моя поездка<span>{stops.length}</span>
          </h2>
        </div>
        <button className="icon-button" aria-label="Закрыть поездку" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="trip-content">
        <TripCover stops={stops} days={days} mode={mode} route={route} />
        <div className="segmented">
          <button className={days === 1 ? 'selected' : ''} onClick={() => setDays(1)}>
            Один день
          </button>
          <button className={days === 2 ? 'selected' : ''} onClick={() => setDays(2)}>
            Два дня
          </button>
        </div>
        <div className="transport-options">
          <button className={mode === 'car' ? 'selected' : ''} onClick={() => setMode('car')}>
            <Car size={17} />
            На автомобиле
          </button>
          <button className={mode === 'walk' ? 'selected' : ''} onClick={() => setMode('walk')}>
            <Footprints size={17} />
            Пешком
          </button>
        </div>
        {!stops.length ? (
          <div className="empty-state">
            <Route size={36} />
            <h3>
              У каждой поездки
              <br />
              есть первая точка
            </h3>
            <p>
              Добавляйте места с карты или из ленты.
              <br />А дальше — соберём ваш маршрут.
            </p>
            <Button variant="outline" onClick={onClose}>
              Исследовать регион <ArrowUpRight size={17} />
            </Button>
          </div>
        ) : (
          <>
            <p className="trip-hint">
              Ваш маршрут начинается с первого места. Меняйте порядок стрелками.
            </p>
            <ol className="stops">
              {stops.map((p, i) => (
                <li key={p.id}>
                  <div className="stop-number">{i + 1}</div>
                  <button
                    className="stop-image"
                    onClick={() => onSelect(p)}
                    aria-label={`На карте: ${p.name}`}
                  >
                    <PlaceImage place={p} />
                  </button>
                  <div className="stop-info">
                    <button onClick={() => onSelect(p)}>{p.name}</button>
                    <span>{p.city}</span>
                    {route && i > 0 && (
                      <small>
                        {distanceLabel(route.legs[i - 1]?.distance || 0)}
                        {route.legs[i - 1]?.duration
                          ? ` · ${timeLabel(route.legs[i - 1].duration!)}`
                          : ' по прямой'}
                      </small>
                    )}
                  </div>
                  <div className="stop-actions">
                    <button
                      disabled={i === 0}
                      aria-label={`Поднять ${p.name}`}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      disabled={i === stops.length - 1}
                      aria-label={`Опустить ${p.name}`}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button aria-label={`Удалить ${p.name}`} onClick={() => toggleTrip(p.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={optimize}
                onChange={(e) => setOptimize(e.target.checked)}
              />{' '}
              Предложить порядок по близости
            </label>
            <p className="small-note">
              Ближайшая следующая точка — эвристика, а не гарантия кратчайшего пути.
            </p>
            {route && (
              <div className="route-summary">
                <div className="summary-title">
                  <Sparkles size={17} />{' '}
                  {route.source === 'osrm' ? 'Маршрут собран' : 'Предварительный план'}
                </div>
                <div className="route-stats">
                  <span>
                    <MapPin size={15} />
                    <b>{distanceLabel(route.distance)}</b>
                    <small>{route.source === 'straight' ? 'по прямой' : 'по дорогам'}</small>
                  </span>
                  <span>
                    <Clock size={15} />
                    <b>{route.duration ? timeLabel(route.duration) : 'Не рассчитано'}</b>
                    <small>в пути</small>
                  </span>
                </div>
                <p>
                  {timeLabel(visit)} на остановки · план на {days} {days === 1 ? 'день' : 'дня'}.
                </p>
                {route.duration && route.duration + visit > days * 10 * 3600 && (
                  <p className="form-error">
                    Плотный маршрут: сократите число остановок или добавьте день.
                  </p>
                )}
                {route.message && <p className="route-warning">{route.message}</p>}
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
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
            {route && (
              <a
                className="navigation-link"
                href={`https://www.google.com/maps/dir/?api=1&origin=${stops[0].latitude},${stops[0].longitude}&destination=${stops.at(-1)!.latitude},${stops.at(-1)!.longitude}&waypoints=${stops
                  .slice(1, -1)
                  .map((p) => `${p.latitude},${p.longitude}`)
                  .join('|')}&travelmode=${mode === 'car' ? 'driving' : 'walking'}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Открыть навигацию <ArrowUpRight size={16} />
              </a>
            )}
          </>
        )}
      </div>
      <div className="trip-footer">
        <Button className="full-width" disabled={stops.length < 2 || busy} onClick={build}>
          {busy ? <LoaderCircle size={18} className="spin" /> : <Route size={18} />}{' '}
          {busy ? 'Собираем маршрут…' : 'Собрать маршрут'}
          <ArrowUpRight size={18} />
        </Button>
        <small>
          {stops.length < 2 ? 'Добавьте минимум два места' : 'Без спешки. С впечатлениями.'}
        </small>
      </div>
    </aside>
  );
}
