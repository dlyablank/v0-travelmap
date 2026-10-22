import type { Place } from './types';

export const LEGACY_REGION_ID = 'kolomna';
export const PODMOSKOVYE_ID = 'podmoskovye';
export const LEGACY_REGION_NAME = 'Коломна и окрестности';
export const PODMOSKOVYE_NAME = 'Подмосковье';
const LEGACY_SUBURB_CITIES = new Set(['Окраина Коломны', 'Старое Бобренево']);

export const regions = [
  {
    id: PODMOSKOVYE_ID,
    name: PODMOSKOVYE_NAME,
    heading: 'Выходные в Подмосковье',
    originName: 'Москвы',
    // Overview frame for all ten towns. The radius filter uses `origin`, not this center.
    center: [37.4, 55.6] as [number, number],
    // Moscow Kremlin, OSM relation/1360641, Wikidata Q133274, checked 22 Oct 2026.
    origin: [37.618122, 55.7516212] as [number, number],
    zoom: 7.6,
    previewZoom: 8,
    fitToVideos: false,
  },
  {
    id: 'karelia',
    name: 'Карелия',
    heading: 'Выходные в Карелии',
    originName: 'Сортавалы',
    center: [32.1, 61.94] as [number, number],
    // Sortavala embankment: the existing radius base, not the regional map center.
    origin: [30.6793, 61.6991] as [number, number],
    zoom: 6.5,
    previewZoom: 7.5,
    fitToVideos: true,
  },
];
export type ExplorerRegion = (typeof regions)[number];

export function canonicalRegionId(id: string) {
  return id === LEGACY_REGION_ID ? PODMOSKOVYE_ID : id;
}

export function getRegion(id: string) {
  const resolved = canonicalRegionId(id);
  return regions.find((region) => region.id === resolved) || regions[0];
}

export function normalizePlace<T extends { region: string; city: string }>(place: T): T {
  const legacyRegion = place.region === LEGACY_REGION_NAME;
  const legacyCity = LEGACY_SUBURB_CITIES.has(place.city.trim());
  if (!legacyRegion && !legacyCity) return place;
  return {
    ...place,
    region: legacyRegion ? PODMOSKOVYE_NAME : place.region,
    city: legacyCity ? 'Коломна' : place.city.trim(),
  };
}

export function regionIdForPlace(place: { region: string }) {
  if (place.region === LEGACY_REGION_NAME || place.region === PODMOSKOVYE_NAME) return PODMOSKOVYE_ID;
  return regions.find((region) => region.name === place.region)?.id;
}

export function inRegion(place: Place, region: ExplorerRegion) {
  return regionIdForPlace(place) === region.id;
}

// Hysteresis keeps the selector stable on an overview containing both regions.
export function regionAtCenter(center: [number, number], currentId: string) {
  const distance = (region: ExplorerRegion) => {
    const lat = (center[1] * Math.PI) / 180;
    const dx = (region.center[0] - center[0]) * Math.cos(lat);
    return Math.hypot(dx, region.center[1] - center[1]);
  };
  const nearest = [...regions].sort((a, b) => distance(a) - distance(b))[0];
  const current = getRegion(currentId);
  return nearest.id !== current.id && distance(nearest) * 1.25 < distance(current)
    ? nearest
    : current;
}
