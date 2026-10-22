import { describe, expect, it } from 'vitest';
import { defaultDay } from '../lib/day-plan';
import type { Place, RouteResult } from '../lib/types';
import { packDays, weekendVariants } from '../lib/weekend-plan';

const place = (
  id: string,
  visitMinutes: number,
  longitude = 38.75,
): Place => ({
  id,
  name: id,
  city: 'Коломна',
  region: 'Подмосковье',
  latitude: 55.1,
  longitude,
  category: 'Природа',
  description: '',
  thumbnailUrl: '',
  visitMinutes,
  video: { sourceType: 'upload', playbackUrl: '/test.mp4' },
});

function roadFor(stops: Place[], legMinutes: number): RouteResult {
  return {
    coordinates: stops.map((s) => [s.longitude, s.latitude]),
    distance: 1000 * (stops.length - 1),
    duration: legMinutes * 60 * (stops.length - 1),
    legs: stops.slice(1).map(() => ({
      distance: 1000,
      duration: legMinutes * 60,
    })),
    source: 'osrm',
  };
}

describe('weekend plan', () => {
  it('fits a short set into one day', () => {
    const stops = [place('a', 60), place('b', 60, 38.76), place('c', 60, 38.77)];
    const route = roadFor(stops, 10);
    const variants = weekendVariants(stops, route, defaultDay);
    expect(variants.some((v) => v.durationDays === 1 && v.fitStatus !== 'overflow')).toBe(true);
    const one = variants.find((v) => v.id === 'one-day-optimized')!;
    expect(one.days).toHaveLength(1);
    expect(one.overnight).toBe(false);
  });

  it('splits into two days when one day overflows', () => {
    // 09:00–19:00 = 600 min. Four stops × 180 visit + travel forces overnight.
    const stops = [
      place('a', 180),
      place('b', 180, 38.76),
      place('c', 180, 38.77),
      place('d', 180, 38.78),
    ];
    const route = roadFor(stops, 30);
    const packed = packDays(stops, route, defaultDay, 2);
    expect(packed.days.length).toBeGreaterThanOrEqual(2);
    const variants = weekendVariants(stops, route, defaultDay);
    const two = variants.find((v) => v.durationDays === 2);
    expect(two).toBeTruthy();
    expect(two!.overnight).toBe(true);
    expect(two!.eveningPlace?.id).toBeTruthy();
  });

  it('reports overflow when even two days cannot fit', () => {
    const stops = Array.from({ length: 8 }, (_, i) =>
      place(String.fromCharCode(97 + i), 200, 38.75 + i * 0.01),
    );
    const route = roadFor(stops, 40);
    const variants = weekendVariants(stops, route, defaultDay);
    expect(variants.some((v) => v.fitStatus === 'overflow')).toBe(true);
    expect(variants.every((v) => v.durationDays <= 2)).toBe(true);
    expect(variants.every((v) => v.days.length <= 2)).toBe(true);
  });

  it('degrades to visit-only packing when travel time is unknown', () => {
    const stops = [
      place('a', 200),
      place('b', 200, 38.76),
      place('c', 200, 38.77),
      place('d', 200, 38.78),
    ];
    const route: RouteResult = {
      coordinates: stops.map((s) => [s.longitude, s.latitude]),
      distance: 3000,
      duration: null,
      legs: stops.slice(1).map(() => ({ distance: 1000, duration: null })),
      source: 'straight',
    };
    const packed = packDays(stops, route, defaultDay, 2);
    expect(packed.degraded).toBe(true);
    const variants = weekendVariants(stops, route, defaultDay);
    expect(variants.some((v) => v.degraded)).toBe(true);
    expect(variants[0].days.every((d) => d.stops.length >= 1)).toBe(true);
  });

  it('keeps a user-order variant when optimize changes the sequence', () => {
    const stops = [
      place('a', 60, 38.75),
      place('c', 60, 38.79),
      place('b', 60, 38.76),
    ];
    const optimizedLike = [stops[0], stops[2], stops[1]];
    const route = roadFor(optimizedLike, 10);
    const variants = weekendVariants(optimizedLike, route, defaultDay, {
      userOrder: stops,
    });
    expect(variants.some((v) => v.id === 'user-order' && !v.optimized)).toBe(true);
  });

  it('always offers a distinct 2-day option for four or more stops', () => {
    const stops = [
      place('a', 45),
      place('b', 45, 38.76),
      place('c', 45, 38.77),
      place('d', 45, 38.78),
    ];
    const route = roadFor(stops, 10);
    const variants = weekendVariants(stops, route, defaultDay);
    expect(variants.length).toBeGreaterThanOrEqual(2);
    expect(variants.some((v) => v.durationDays === 2 && v.days.length === 2)).toBe(true);
  });
});
