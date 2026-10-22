import type { Place } from './types';
import type { DaySettings } from './day-plan';
import {
  LEGACY_REGION_ID,
  LEGACY_REGION_NAME,
  PODMOSKOVYE_ID,
  PODMOSKOVYE_NAME,
  normalizePlace,
} from './regions';

const LEGACY_SUBURB_CITIES = new Set(['Окраина Коломны', 'Старое Бобренево']);

export type ExplorerPersistSlice = {
  regionId?: string;
  trip?: string[];
  regionTrips?: Record<string, string[]>;
  daySettings?: Record<string, DaySettings>;
  regionLocations?: Record<string, string>;
  locationTrips?: Record<string, string[]>;
  locationId?: string;
  customPlaces?: Place[];
};

export function rewriteLocationKey(key: string) {
  const separator = key.indexOf('::');
  if (separator < 0) return key;
  let region: string;
  let city: string;
  try {
    region = decodeURIComponent(key.slice(0, separator));
    city = decodeURIComponent(key.slice(separator + 2));
  } catch {
    return key;
  }
  if (region !== LEGACY_REGION_NAME && region !== PODMOSKOVYE_NAME) return key;
  if (region === LEGACY_REGION_NAME) region = PODMOSKOVYE_NAME;
  if (LEGACY_SUBURB_CITIES.has(city)) city = 'Коломна';
  return `${encodeURIComponent(region)}::${encodeURIComponent(city)}`;
}

function mergeIds(primary: string[], extra: string[]) {
  const seen = new Set(primary);
  const merged = [...primary];
  for (const id of extra)
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  return merged;
}

function relocate<T>(record: Record<string, T> | undefined, combine: (kept: T, incoming: T) => T) {
  const groups = new Map<string, { primary?: T; extras: T[] }>();
  for (const [key, value] of Object.entries(record || {})) {
    const next = key === LEGACY_REGION_ID ? PODMOSKOVYE_ID : rewriteLocationKey(key);
    const group = groups.get(next) ?? { extras: [] };
    if (key === next && group.primary === undefined) group.primary = value;
    else group.extras.push(value);
    groups.set(next, group);
  }
  const relocated: Record<string, T> = {};
  for (const [key, group] of groups) {
    const values = group.primary !== undefined ? [group.primary, ...group.extras] : group.extras;
    relocated[key] = values.slice(1).reduce(combine, values[0]);
  }
  return relocated;
}

export function migrateExplorerState<T extends ExplorerPersistSlice>(state: T): T {
  const hadLegacyTrips = !!state.regionTrips && LEGACY_REGION_ID in state.regionTrips;
  const regionId =
    !state.regionId || state.regionId === LEGACY_REGION_ID ? PODMOSKOVYE_ID : state.regionId;
  const regionTrips = relocate(state.regionTrips, mergeIds);
  const daySettings = relocate(state.daySettings, (kept) => kept);
  const regionLocations = Object.fromEntries(
    Object.entries(relocate(state.regionLocations, (kept) => kept)).map(([key, value]) => [
      key,
      rewriteLocationKey(value),
    ]),
  );
  const locationTrips = relocate(state.locationTrips, mergeIds);
  const next: T = {
    ...state,
    regionId,
    regionTrips,
    daySettings,
    regionLocations,
    locationTrips,
  };
  if (state.locationId !== undefined) next.locationId = rewriteLocationKey(state.locationId);
  if (state.customPlaces)
    next.customPlaces = state.customPlaces.map((place) => normalizePlace(place));
  if (hadLegacyTrips && regionId === PODMOSKOVYE_ID)
    next.trip = regionTrips[PODMOSKOVYE_ID] || [];
  return next;
}
