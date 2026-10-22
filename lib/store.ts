'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Place } from './types';
import { locationId } from './locations';
import { defaultDay, type DaySettings } from './day-plan';
import { regionIdForPlace, regions, canonicalRegionId } from './regions';
import { migrateExplorerState } from './region-migration';
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
  setDaySettings: (settings: Partial<DaySettings>, scope?: string) => void;
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
  toggleTrip: (id: string, ownerRegion?: string) => void;
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
      setDaySettings: (patch, scope) =>
        set((s) => ({
          daySettings: {
            ...s.daySettings,
            [scope || s.regionId]: {
              ...defaultDay,
              ...(s.daySettings[scope || s.regionId] || s.daySettings[s.regionId]),
              ...patch,
            },
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
          const base = migrateExplorerState(s);
          const migrationChanged =
            base.regionId !== s.regionId ||
            base.locationId !== s.locationId ||
            base.trip !== s.trip ||
            JSON.stringify(base.regionTrips) !== JSON.stringify(s.regionTrips) ||
            JSON.stringify(base.daySettings) !== JSON.stringify(s.daySettings) ||
            JSON.stringify(base.regionLocations) !== JSON.stringify(s.regionLocations) ||
            JSON.stringify(base.locationTrips) !== JSON.stringify(s.locationTrips) ||
            JSON.stringify(base.customPlaces) !== JSON.stringify(s.customPlaces);
          const regional = {
            ...base.regionTrips,
            ...(base.regionTripsMigrated ? { [base.regionId]: base.trip } : {}),
          };
          const settings = { ...base.daySettings };
          const pending = new Set(s.unassignedStops);
          const regionOf = (place: Place) => regionIdForPlace(place);
          const append = (region: string, ids: string[]) => {
            regional[region] = [...new Set([...(regional[region] || []), ...ids])];
          };
          if (!base.regionTripsMigrated) {
            const buckets = { ...base.locationTrips };
            const removed = new Set(
              s.locationsMigrated && base.locationId
                ? (buckets[base.locationId] || []).filter((id) => !base.trip.includes(id))
                : [],
            );
            if (s.locationsMigrated && base.locationId) buckets[base.locationId] = base.trip;
            for (const id of removed) pending.delete(id);
            for (const key of Object.keys(regional))
              regional[key] = regional[key].filter((id) => !removed.has(id));
            // Current visible order is newest; append other cities without sorting it away.
            const current = base.trip.filter((id) => {
              const p = places.find((p) => p.id === id);
              return !p || regionOf(p) === base.regionId;
            });
            regional[base.regionId] = [
              ...new Set([...current, ...(regional[base.regionId] || [])]),
            ];
            const sources: [string | undefined, string[]][] = [
              [undefined, base.trip],
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
                const oldKey = r.id === base.regionId ? base.locationId : base.regionLocations[r.id];
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
          const candidates = places.filter((p) => regionIdForPlace(p) === base.regionId);
          const desired =
            base.locationId ||
            base.regionLocations[base.regionId] ||
            (candidates[0] ? locationId(candidates[0]) : '');
          if (
            !migrationChanged &&
            base.regionTripsMigrated &&
            desired === base.locationId &&
            unassigned.length === pending.size
          )
            return {};
          return {
            regionId: base.regionId,
            locationId: desired,
            locationTrips: base.locationTrips,
            regionTrips: regional,
            trip: regional[base.regionId] || [],
            regionTripsMigrated: true,
            daySettings: settings,
            locationsMigrated: true,
            unassignedStops: unassigned,
            regionLocations: { ...base.regionLocations, [base.regionId]: desired },
            customPlaces: base.customPlaces,
          };
        }),
      regionId: 'podmoskovye',
      regionTrips: {},
      setRegion: (regionId) =>
        set((s) => {
          const id = canonicalRegionId(regionId);
          return s.regionId === id
            ? {}
            : {
                regionId: id,
                locationId: s.regionLocations[id] || '',
                trip: s.regionTrips[id] || [],
                regionTrips: { ...s.regionTrips, [s.regionId]: s.trip },
              };
        }),
      trip: [],
      durationDays: 1,
      transportMode: 'car',
      setDays: (durationDays) => set({ durationDays }),
      setMode: (transportMode) => set({ transportMode }),
      saved: [],
      customPlaces: [],
      toggleTrip: (id, ownerRegion) =>
        set((s) => {
          const owner = ownerRegion || s.regionId;
          const previous = owner === s.regionId ? s.trip : s.regionTrips[owner] || [];
          const trip = previous.includes(id)
            ? previous.filter((other) => other !== id)
            : [...previous, id];
          return {
            ...(owner === s.regionId ? { trip } : {}),
            regionTrips: { ...s.regionTrips, [owner]: trip },
            unassignedStops: s.unassignedStops.filter((other) => other !== id),
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
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== 'object') return current;
        return { ...current, ...migrateExplorerState(persisted as Partial<State>) };
      },
    },
  ),
);
