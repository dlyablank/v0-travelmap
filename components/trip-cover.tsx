import { Route, Clock, MapPin } from 'lucide-react';
import type { Place, RouteResult } from '@/lib/types';
import { PlaceImage } from './place-image';
import { distanceLabel, timeLabel } from '@/lib/utils';

export function TripCover({
  stops,
  days,
  mode,
  route,
}: {
  stops: Place[];
  days: number;
  mode: 'car' | 'walk';
  route: RouteResult | null;
}) {
  const cover = stops.find((p) => p.video?.credit) || stops[0];
  if (!cover) return null;
  const region = stops.every((p) => p.region === stops[0].region) ? stops[0].region : 'Новые места';
  return (
    <section className="trip-cover" aria-label="Обложка поездки">
      <PlaceImage place={cover} loading="eager" />
      <div className="trip-cover-content">
        <span className="trip-cover-status">
          {!route
            ? 'ВАША ИДЕЯ ПОЕЗДКИ'
            : route.source === 'osrm'
              ? 'МАРШРУТ СОБРАН'
              : 'ПРЕДВАРИТЕЛЬНЫЙ ПЛАН'}
        </span>
        <h3>
          {region}
          <br />
          <em>в вашем ритме.</em>
        </h3>
        <p>
          <MapPin size={12} /> Остановок: {stops.length} · {days === 1 ? 'Один день' : 'Два дня'} ·{' '}
          {mode === 'car' ? 'Авто' : 'Пешком'}
        </p>
        {route && (
          <div className="trip-cover-stats">
            <span>
              <Route size={13} />
              {distanceLabel(route.distance)}
              {route.source === 'straight' ? ' по прямой' : ' по дорогам'}
            </span>
            <span>
              <Clock size={13} />
              {route.duration !== null
                ? `${timeLabel(route.duration)} в пути`
                : 'Время не рассчитано'}
            </span>
          </div>
        )}
        <small>
          {cover.video ? 'Кадр видео' : 'Фото региона'} · {cover.name}
          {cover.video?.credit && (
            <>
              {' · '}
              <a href={cover.video.credit.sourceUrl} target="_blank" rel="noopener noreferrer">
                {cover.video.credit.author}
              </a>
              {' · '}
              <a href={cover.video.credit.licenseUrl} target="_blank" rel="noopener noreferrer">
                {cover.video.credit.license}
              </a>
            </>
          )}
        </small>
      </div>
    </section>
  );
}
