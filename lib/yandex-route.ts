import type { Place, TransportMode } from './types';

export function yandexRoute(stops: Pick<Place, 'latitude' | 'longitude'>[], mode: TransportMode) {
  const query = new URLSearchParams({
    mode: 'routes',
    rtext: stops.map((p) => `${p.latitude},${p.longitude}`).join('~'),
    rtt: { car: 'auto', walk: 'pd', transit: 'mt' }[mode],
  });
  return `https://yandex.ru/maps/?${query}`;
}

// Yandex Maps allows eight intermediate stops. Repeat the boundary to preserve continuity.
export function yandexRouteParts(
  stops: Pick<Place, 'latitude' | 'longitude'>[],
  mode: TransportMode,
) {
  const links: string[] = [];
  for (let start = 0; start < stops.length - 1; start += 9)
    links.push(yandexRoute(stops.slice(start, start + 10), mode));
  return links;
}
