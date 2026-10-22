import { dgisPlaceLink } from './dgis-route';

export type PoiItem = {
  id: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  href: string;
  source: 'dgis';
};

type RawItem = {
  id?: string;
  name?: string;
  address_name?: string;
  full_address_name?: string;
  point?: { lat?: number; lon?: number };
};

export function normalizeDgisPlaces(payload: unknown, limit = 5): PoiItem[] {
  const root = payload as {
    result?: { items?: RawItem[] };
    items?: RawItem[];
  };
  const items = root.result?.items || root.items || [];
  const out: PoiItem[] = [];
  for (const item of items) {
    const lat = item.point?.lat;
    const lon = item.point?.lon;
    if (!item.name || lat == null || lon == null) continue;
    out.push({
      id: item.id || `${lon},${lat},${item.name}`,
      name: item.name,
      address: item.full_address_name || item.address_name,
      latitude: lat,
      longitude: lon,
      href: dgisPlaceLink(item.id, lat, lon),
      source: 'dgis',
    });
    if (out.length >= limit) break;
  }
  return out;
}

export const HOTEL_QUERY = 'гостиница';
export const MEAL_QUERIES = {
  breakfast: 'кафе',
  lunch: 'кафе',
  dinner: 'ресторан',
} as const;
