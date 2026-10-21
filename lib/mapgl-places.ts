import Supercluster from 'supercluster';
import type { Place } from './types';

export type MapPlaceProperties = { id: string };
export function clusterMapPlaces(places: Place[]) {
  return new Supercluster<MapPlaceProperties>({ radius: 48, maxZoom: 8 }).load(
    places
      .filter((place) => !place.video)
      .map((place) => ({
        type: 'Feature' as const,
        properties: { id: place.id },
        geometry: { type: 'Point' as const, coordinates: [place.longitude, place.latitude] },
      })),
  );
}

export function mapBounds(coordinates: number[][]) {
  if (!coordinates.length) return null;
  return {
    southWest: [
      Math.min(...coordinates.map((p) => p[0])),
      Math.min(...coordinates.map((p) => p[1])),
    ],
    northEast: [
      Math.max(...coordinates.map((p) => p[0])),
      Math.max(...coordinates.map((p) => p[1])),
    ],
  };
}
