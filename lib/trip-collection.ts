import type { Place } from './types';
import { locationId } from './locations';
import { getRegion } from './regions';
export function collectedTripIds(state: {
  trip: string[];
  regionTrips: Record<string, string[]>;
  unassignedStops: string[];
}) {
  return [
    ...new Set([
      ...Object.values(state.regionTrips).flat(),
      ...state.trip,
      ...state.unassignedStops,
    ]),
  ];
}

export function cityTripStops(
  ids: string[],
  places: Place[],
  cityId: string | undefined,
  regionId: string,
) {
  return ids
    .map((id) => places.find((place) => place.id === id))
    .filter(
      (place): place is Place =>
        !!place &&
        (cityId ? locationId(place) === cityId : place.region === getRegion(regionId).name),
    );
}
