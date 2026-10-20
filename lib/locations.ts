import type { Place } from './types';
export function locationId(place: Pick<Place, 'region' | 'city'>) {
  return `${encodeURIComponent(place.region)}::${encodeURIComponent(place.city.trim())}`;
}
export function locationGroups(places: Place[]) {
  const groups = new Map<string, { id: string; name: string; region: string; places: Place[] }>();
  for (const place of places) {
    const id = locationId(place);
    if (!groups.has(id))
      groups.set(id, { id, name: place.city.trim(), region: place.region, places: [] });
    groups.get(id)!.places.push(place);
  }
  return [...groups.values()];
}
