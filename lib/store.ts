'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Place } from './types';
import { locationId } from './locations';
import { defaultDay, type DaySettings } from './day-plan';
import { getRegion, regions } from './regions';
type State = {
  locationId: string;
  locationTrips: Record<string, string[]>;
  regionLocations: Record<string, string>;
  locationsMigrated: boolean;
  regionTripsMigrated: boolean;
  unassignedStops: string[];
  syncLocations: (places: Place[]) => void;
  setLocation: (id: string) => void;
  daySettings: Record<string, DaySettings>;
  setDaySettings: (settings: Partial<DaySettings>) => void;
  regionId: string;
  regionTrips: Record<string, string[]>;
  setRegion: (id: string) => void;
  trip: string[];
  durationDays: number;
  transportMode: 'car' | 'walk' | 'transit';
  setDays: (n: number) => void;
  setMode: (m: 'car' | 'walk' | 'transit') => void;
  saved: string[];
  customPlaces: Place[];
  toggleTrip: (id: string) => void;
  toggleSaved: (id: string) => void;
  reorder: (ids: string[], unloadedIds?: string[]) => void;
  addPlace: (p: Place) => void;
};
export const useExplorer = create<State>()(
  persist(
    (set) => ({
      locationId: '',
      locationTrips: {},
      regionLocations: {},
      locationsMigrated: false,
      regionTripsMigrated: false,
      unassignedStops: [],
      daySettings: {},
      setDaySettings: (patch) =>
        set((s) => ({
          daySettings: {
            ...s.daySettings,
            [s.regionId]: { ...defaultDay, ...s.daySettings[s.regionId], ...patch },
          },
        })),
      setLocation: (id) =>
        set((s) =>
          s.locationId === id
            ? {}
            : {
                locationId: id,
                regionLocations: { ...s.regionLocations, [s.regionId]: id },
              },
        ),
      syncLocations: (places) =>
        set((s) => {
          const regional = {
            ...s.regionTrips,
            ...(s.regionTripsMigrated ? { [s.regionId]: s.trip } : {}),
          };
          const settings = { ...s.daySettings };
          const pending = new Set(s.unassignedStops);
          const regionOf = (place: Place) => regions.find((r) => r.name === place.region)?.id;
          const append = (region: string, ids: string[]) => {
            regional[region] = [...new Set([...(regional[region] || []), ...ids])];
          };
          if (!s.regionTripsMigrated) {
            const buckets = { ...s.locationTrips };
            const removed = new Set(
              s.locationsMigrated && s.locationId
                ? (buckets[s.locationId] || []).filter((id) => !s.trip.includes(id))
                : [],
            );
            if (s.locationsMigrated && s.locationId) buckets[s.locationId] = s.trip;
            for (const id of removed) pending.delete(id);
            for (const key of Object.keys(regional))
              regional[key] = regional[key].filter((id) => !removed.has(id));
            // Current visible order is newest; append other cities without sorting it away.
            const current = s.trip.filter((id) => {
              const p = places.find((p) => p.id === id);
              return !p || regionOf(p) === s.regionId;
            });
            regional[s.regionId] = [...new Set([...current, ...(regional[s.regionId] || [])])];
            const sources: [string | undefined, string[]][] = [
              [undefined, s.trip],
              ...Object.entries(regional),
              ...Object.entries(buckets).map(([key, ids]): [string | undefined, string[]] => [
                regions.find((r) => encodeURIComponent(r.name) === key.split('::')[0])?.id,
                ids,
              ]),
            ];
            for (const [owner, ids] of sources)
              for (const id of ids) {
                const place = places.find((p) => p.id === id);
                const region = place ? regionOf(place) : owner;
                if (region) append(region, [id]);
                if (!place) pending.add(id);
              }
            for (const r of regions)
              if (!settings[r.id]) {
                const oldKey = r.id === s.regionId ? s.locationId : s.regionLocations[r.id];
                const fallback = Object.keys(settings).find((key) =>
                  key.startsWith(`${encodeURIComponent(r.name)}::`),
                );
                settings[r.id] = {
                  ...defaultDay,
                  ...(settings[oldKey] || (fallback ? settings[fallback] : undefined) || {}),
                };
              }
          }
          const unassigned: string[] = [];
          for (const id of pending) {
            const place = places.find((p) => p.id === id);
            if (!place) {
              unassigned.push(id);
              continue;
            }
            const owner = regionOf(place);
            if (owner) {
              // A legacy unknown id may have been provisionally attached to the active region.
              for (const key of Object.keys(regional))
                if (key !== owner) regional[key] = regional[key].filter((other) => other !== id);
              append(owner, [id]);
            }
          }
          const prefix = getRegion(s.regionId).name;
          const candidates = places.filter((p) => p.region === prefix);
          const desired =
            s.locationId ||
            s.regionLocations[s.regionId] ||
            (candidates[0] ? locationId(candidates[0]) : '');
          if (
            s.regionTripsMigrated &&
            desired === s.locationId &&
            unassigned.length === pending.size
          )
            return {};
          return {
            locationId: desired,
            regionTrips: regional,
            trip: regional[s.regionId] || [],
            regionTripsMigrated: true,
            daySettings: settings,
            locationsMigrated: true,
            unassignedStops: unassigned,
            regionLocations: { ...s.regionLocations, [s.regionId]: desired },
          };
        }),
      regionId: 'karelia',
      regionTrips: {},
      setRegion: (regionId) =>
        set((s) =>
          s.regionId === regionId
            ? {}
            : {
                regionId,
                locationId: s.regionLocations[regionId] || '',
                trip: s.regionTrips[regionId] || [],
                regionTrips: { ...s.regionTrips, [s.regionId]: s.trip },
              },
        ),
      trip: [],
      durationDays: 1,
      transportMode: 'car',
      setDays: (durationDays) => set({ durationDays }),
      setMode: (transportMode) => set({ transportMode }),
      saved: [],
      customPlaces: [],
      toggleTrip: (id) =>
        set((s) => {
          const trip = s.trip.includes(id)
            ? s.trip.filter((x) => x !== id)
            : s.trip.length < 20
              ? [...s.trip, id]
              : s.trip;
          return {
            trip,
            regionTrips: { ...s.regionTrips, [s.regionId]: trip },
            unassignedStops: s.unassignedStops.filter((x) => x !== id),
          };
        }),
      toggleSaved: (id) =>
        set((s) => ({
          saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [...s.saved, id],
        })),
      reorder: (ids, unloadedIds = []) =>
        set((s) => {
          const retained = new Set([...s.unassignedStops, ...unloadedIds]);
          const trip = [...new Set(ids)];
          // A reorder edits the visible list; missing metadata is not an explicit deletion.
          s.trip.forEach((id, index) => {
            if (retained.has(id) && !trip.includes(id))
              trip.splice(Math.min(index, trip.length), 0, id);
          });
          return { trip, regionTrips: { ...s.regionTrips, [s.regionId]: trip } };
        }),
      addPlace: (p) =>
        set((s) => ({ customPlaces: [...s.customPlaces.filter((x) => x.id !== p.id), p] })),
    }),
    {
      name: 'weekend-explorer-v1',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
