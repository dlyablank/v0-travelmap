import type { Place } from './types';
import { normalizePlace } from './regions';
export function locationId(place: Pick<Place, 'region' | 'city'>) {
  const normalized = normalizePlace(place);
  return `${encodeURIComponent(normalized.region)}::${encodeURIComponent(normalized.city.trim())}`;
}
export function locationGroups(places: Place[]) {
  const groups = new Map<string, { id: string; name: string; region: string; places: Place[] }>();
  for (const place of places) {
    const normalized = normalizePlace(place);
    const id = locationId(normalized);
    if (!groups.has(id))
      groups.set(id, {
        id,
        name: normalized.city.trim(),
        region: normalized.region,
        places: [],
      });
    groups.get(id)!.places.push(normalized);
  }
  return [...groups.values()];
}
