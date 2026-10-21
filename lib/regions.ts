import type { Place } from './types';

export const regions = [
  {
    id: 'karelia',
    name: 'Карелия',
    heading: 'Выходные в Карелии',
    originName: 'Сортавалы',
    center: [32.1, 61.94] as [number, number],
    zoom: 6.5,
    previewZoom: 7.5,
  },
  {
    id: 'kolomna',
    name: 'Коломна и окрестности',
    heading: 'Выходные в Коломне',
    originName: 'Коломны',
    center: [38.76, 55.104] as [number, number],
    zoom: 11,
    previewZoom: 12.5,
  },
];
export type ExplorerRegion = (typeof regions)[number];
export function getRegion(id: string) {
  return regions.find((r) => r.id === id) || regions[0];
}
export function inRegion(place: Place, region: ExplorerRegion) {
  return place.region === region.name;
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
