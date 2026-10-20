import { describe, it, expect } from 'vitest';
import { haversine, optimizeStops, straightRoute } from '../lib/routing';
import { places } from '../lib/data';
import { externalSource, youtubeId, placeInput } from '../lib/validation';
describe('trip planning', () => {
  it('calculates a real great-circle distance and keeps identical points at zero', () => {
    expect(haversine({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(
      111194.9,
      0,
    );
    expect(haversine(places[0], places[0])).toBe(0);
  });
  it('keeps the origin, visits all stops once, and takes the closest next stop', () => {
    const points = [places[0], places[3], places[2]];
    const ordered = optimizeStops(points);
    expect(ordered.map((p) => p.id)).toEqual(['ruskeala', 'ahvenkoski', 'kivach']);
    expect(points[1].id).toBe('kivach');
  });
  it('never invents travel times in fallback mode', () => {
    const route = straightRoute(places.slice(0, 3), 'offline');
    expect(route.source).toBe('straight');
    expect(route.duration).toBeNull();
    expect(route.legs.every((l) => l.duration === null)).toBe(true);
    expect(route.distance).toBeGreaterThan(0);
    expect(route.coordinates).toHaveLength(3);
  });
  it('rejects invalid coordinates and unsafe or impersonated platform URLs', () => {
    expect(placeInput.safeParse({ latitude: 999 }).success).toBe(false);
    expect(externalSource('https://youtube.com.evil.test/shorts/abc')).toBeNull();
    expect(externalSource('javascript:alert(1)')).toBeNull();
    expect(externalSource('https://www.instagram.com/reel/abc/')).toBe('instagram');
    expect(youtubeId('https://youtube.com/shorts/abcdefghijk')).toBe('abcdefghijk');
    expect(youtubeId('https://youtube.com/shorts/bad')).toBeNull();
  });
  it('contains 24 unique named geographic points with plausible regional coordinates', () => {
    expect(places).toHaveLength(24);
    expect(new Set(places.map((p) => p.id)).size).toBe(24);
    expect(
      places.every(
        (p) => p.latitude > 60 && p.latitude < 67 && p.longitude > 29 && p.longitude < 36,
      ),
    ).toBe(true);
  });
});
