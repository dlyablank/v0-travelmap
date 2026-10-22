import type { Place, RouteResult } from './types';
import { haversine } from './routing';

function distanceToSegment(place: Place, a: [number, number], b: [number, number]) {
  const scale = Math.cos((place.latitude * Math.PI) / 180);
  const ax = (a[0] - place.longitude) * scale,
    ay = a[1] - place.latitude;
  const bx = (b[0] - place.longitude) * scale,
    by = b[1] - place.latitude;
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + dx * t, ay + dy * t) * 111320;
}

function nearStops(
  stops: Place[],
  places: Place[],
  maxMeters: number,
) {
  const selected = new Set(stops.map((p) => p.id));
  return places
    .filter((p) => p.video && !selected.has(p.id) && p.region === stops[0].region)
    .map((place, priority) => {
      let nearest = Infinity;
      let insertAt = 1;
      for (let i = 0; i < stops.length; i++) {
        const d = haversine(stops[i], place);
        if (d < nearest) nearest = d;
      }
      let extra = Infinity;
      for (let i = 1; i < stops.length; i++) {
        const delta =
          haversine(stops[i - 1], place) +
          haversine(place, stops[i]) -
          haversine(stops[i - 1], stops[i]);
        if (delta < extra) {
          extra = delta;
          insertAt = i;
        }
      }
      return { place, insertAt, corridor: nearest, extra, priority };
    })
    .filter((item) => item.corridor <= maxMeters)
    .sort((a, b) => a.extra - b.extra || a.priority - b.priority)
    .slice(0, 3);
}

/** Product-catalog suggest-along only (no 2GIS attractions). */
export function recommendationCandidates(
  stops: Place[],
  places: Place[],
  route: RouteResult,
  mode: 'car' | 'walk' | 'transit',
) {
  if (stops.length < 2) return [];

  // Transit / straight: geo-near stops without claiming a road detour.
  if (mode === 'transit' || route.source === 'straight')
    return nearStops(stops, places, mode === 'walk' ? 700 : 5000);

  if (route.source !== 'osrm' && route.source !== 'dgis') return [];

  const selected = new Set(stops.map((p) => p.id));
  const geometry = route.coordinates;
  if (geometry.length < 2) return nearStops(stops, places, mode === 'car' ? 5000 : 700);

  return places
    .filter((p) => p.video && !selected.has(p.id) && p.region === stops[0].region)
    .map((place, priority) => {
      let corridor = Infinity;
      for (let i = 1; i < geometry.length; i++)
        corridor = Math.min(corridor, distanceToSegment(place, geometry[i - 1], geometry[i]));
      let extra = Infinity,
        insertAt = 1;
      for (let i = 1; i < stops.length; i++) {
        const delta =
          haversine(stops[i - 1], place) +
          haversine(place, stops[i]) -
          haversine(stops[i - 1], stops[i]);
        if (delta < extra) {
          extra = delta;
          insertAt = i;
        }
      }
      return { place, insertAt, corridor, extra, priority };
    })
    .filter((item) => item.corridor <= (mode === 'car' ? 5000 : 700))
    .sort((a, b) => a.extra - b.extra || a.priority - b.priority)
    .slice(0, 3);
}

export function isRoutedSource(source: RouteResult['source']) {
  return source === 'osrm' || source === 'dgis';
}
