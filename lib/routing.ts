import type { Place, RouteResult } from './types';
export function haversine(
  a: Pick<Place, 'latitude' | 'longitude'>,
  b: Pick<Place, 'latitude' | 'longitude'>,
) {
  const r = Math.PI / 180,
    dlat = (b.latitude - a.latitude) * r,
    dlon = (b.longitude - a.longitude) * r;
  return (
    6371000 *
    2 *
    Math.atan2(
      Math.sqrt(
        Math.sin(dlat / 2) ** 2 +
          Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dlon / 2) ** 2,
      ),
      Math.sqrt(
        1 -
          (Math.sin(dlat / 2) ** 2 +
            Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dlon / 2) ** 2),
      ),
    )
  );
}
export function optimizeStops(stops: Place[]) {
  if (stops.length < 3) return stops;
  const result = [stops[0]],
    rest = stops.slice(1);
  while (rest.length) {
    rest.sort((a, b) => haversine(result.at(-1)!, a) - haversine(result.at(-1)!, b));
    result.push(rest.shift()!);
  }
  return result;
}
export function straightRoute(
  stops: Pick<Place, 'latitude' | 'longitude'>[],
  message: string,
): RouteResult {
  const legs = stops.slice(1).map((p, i) => ({ distance: haversine(stops[i], p), duration: null }));
  return {
    coordinates: stops.map((p) => [p.longitude, p.latitude]),
    distance: legs.reduce((s, l) => s + l.distance, 0),
    duration: null,
    legs,
    source: 'straight',
    message,
  };
}
