'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Place } from './types';
import { locationId } from './locations';
import { defaultDay, type DaySettings } from './day-plan';
import { getRegion } from './regions';
type State = {
  locationId: string;
  locationTrips: Record<string, string[]>;
  regionLocations: Record<string, string>;
  locationsMigrated: boolean;
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
  transportMode: 'car' | 'walk';
  setDays: (n: number) => void;
  setMode: (m: 'car' | 'walk') => void;
  saved: string[];
  customPlaces: Place[];
  toggleTrip: (id: string) => void;
  toggleSaved: (id: string) => void;
  reorder: (ids: string[]) => void;
  addPlace: (p: Place) => void;
};
export const useExplorer = create<State>()(
  persist(
    (set) => ({
      locationId: '',
      locationTrips: {},
      regionLocations: {},
      locationsMigrated: false,
      unassignedStops: [],
      daySettings: {},
      setDaySettings: (patch) =>
        set((s) => ({
          daySettings: {
            ...s.daySettings,
            [s.locationId]: { ...defaultDay, ...s.daySettings[s.locationId], ...patch },
          },
        })),
      setLocation: (id) =>
        set((s) =>
          s.locationId === id
            ? {}
            : {
                locationId: id,
                trip: s.locationTrips[id] || [],
                locationTrips: {
                  ...s.locationTrips,
                  ...(s.locationId ? { [s.locationId]: s.trip } : {}),
                },
                regionLocations: { ...s.regionLocations, [s.regionId]: id },
              },
        ),
      syncLocations: (places) =>
        set((s) => {
          const buckets = { ...s.locationTrips };
          if (s.locationsMigrated && s.locationId) buckets[s.locationId] = s.trip;
          const incoming = s.locationsMigrated
            ? s.unassignedStops
            : [...new Set([...Object.values(s.regionTrips).flat(), ...s.trip])];
          const unassigned: string[] = [];
          for (const id of incoming) {
            const place = places.find((p) => p.id === id);
            if (!place) {
              unassigned.push(id);
              continue;
            }
            const key = locationId(place);
            buckets[key] = [...new Set([...(buckets[key] || []), id])];
          }
          const prefix = getRegion(s.regionId).name;
          const candidates = places.filter((p) => p.region === prefix);
          const desired =
            s.locationId ||
            s.regionLocations[s.regionId] ||
            Object.keys(buckets).find(
              (id) => candidates.some((p) => locationId(p) === id) && buckets[id].length,
            ) ||
            (candidates[0] ? locationId(candidates[0]) : '');
          if (
            s.locationsMigrated &&
            desired === s.locationId &&
            unassigned.length === incoming.length
          )
            return {};
          return {
            locationId: desired,
            locationTrips: buckets,
            trip: buckets[desired] || [],
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
                trip: s.regionLocations[regionId]
                  ? s.locationTrips[s.regionLocations[regionId]] || []
                  : [],
                locationTrips: {
                  ...s.locationTrips,
                  ...(s.locationId ? { [s.locationId]: s.trip } : {}),
                },
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
        set((s) => ({
          trip: s.trip.includes(id)
            ? s.trip.filter((x) => x !== id)
            : s.trip.length < 20
              ? [...s.trip, id]
              : s.trip,
        })),
      toggleSaved: (id) =>
        set((s) => ({
          saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [...s.saved, id],
        })),
      reorder: (trip) => set({ trip }),
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
