'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Place } from './types';
type State = {
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
