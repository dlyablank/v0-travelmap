import type { Place, RouteResult } from './types';
export type DaySettings = { start: string; end: string; visits: Record<string, number> };
export const defaultDay: DaySettings = { start: '09:00', end: '19:00', visits: {} };
export const clockMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};
export function clockLabel(minutes: number | null) {
  if (minutes === null) return '—';
  const days = Math.floor(minutes / 1440);
  const normalized = minutes % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}${days ? ` (+${days} д.)` : ''}`;
}
export function dayPlan(stops: Place[], route: RouteResult | null, settings: DaySettings) {
  let cursor: number | null = clockMinutes(settings.start);
  const entries = stops.map((place, index) => {
    const leg = index ? route?.legs[index - 1] : undefined;
    if (index)
      cursor =
        cursor !== null && leg?.duration != null ? cursor + Math.ceil(leg.duration / 60) : null;
    const arrival = cursor;
    const visit = place.visitMinutes;
    if (cursor !== null) cursor += visit;
    return { place, arrival, departure: cursor, visit, leg };
  });
  const visits = entries.reduce((sum, entry) => sum + entry.visit, 0);
  const travel =
    stops.length < 2 ? 0 : route?.duration != null ? Math.ceil(route.duration / 60) : null;
  const budget = clockMinutes(settings.end) - clockMinutes(settings.start);
  return {
    entries,
    visits,
    travel,
    finish: cursor,
    budget,
    overflow:
      travel !== null ? Math.max(0, visits + travel - budget) : Math.max(0, visits - budget),
    complete: travel !== null,
  };
}
