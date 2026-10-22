import { describe, it, expect } from 'vitest';
import { haversine, optimizeStops, straightRoute } from '../lib/routing';
import { places, placeById } from '../lib/data';
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
    const points = [placeById.ruskeala, placeById.kivach, placeById.ahvenkoski];
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
  it('contains unique points in Karelia and Podmoskovye, with Karelia still on seven videos', () => {
    expect(places.length).toBeGreaterThan(38);
    expect(new Set(places.map((p) => p.id)).size).toBe(places.length);
    const karelia = places.filter((p) => p.region === 'Карелия');
    expect(karelia.filter((p) => p.video)).toHaveLength(7);
    expect(
      karelia.every(
        (p) => p.latitude > 60 && p.latitude < 67 && p.longitude > 29 && p.longitude < 36,
      ),
    ).toBe(true);
    const podmoskovye = places.filter((p) => p.region === 'Подмосковье');
    expect(
      podmoskovye.every(
        (p) => p.latitude > 54.6 && p.latitude < 56.5 && p.longitude > 35.8 && p.longitude < 39.2,
      ),
    ).toBe(true);
    for (const id of [
      'kolomna-kremlin',
      'kolomna-lazhechnikova',
      'kolomna-zaytseva',
      'kolomna-viewpoint',
      'kolomna-pastila',
      'kolomna-golutvin',
      'kolomna-strelka',
      'kolomna-bobrenevo',
      'kolomna-zaraysk',
    ])
      expect(podmoskovye.some((p) => p.id === id)).toBe(true);
    for (const id of [
      'kolomna-kremlin',
      'kolomna-lazhechnikova',
      'kolomna-zaytseva',
      'kolomna-viewpoint',
      'kolomna-pastila',
      'kolomna-golutvin',
      'kolomna-strelka',
    ])
      expect(podmoskovye.find((p) => p.id === id)?.video).toBeTruthy();
    for (const place of podmoskovye.filter((p) => !p.video)) {
      expect(place.thumbnailUrl).toBe('/media/fallback.svg');
      expect(place.imageCredit).toContain('видео пока нет');
      expect(place.video?.credit?.rightsBasis).not.toBe('author-permission');
    }
    for (const city of [
      'Коломна',
      'Зарайск',
      'Сергиев Посад',
      'Звенигород',
      'Серпухов',
      'Дмитров',
      'Истра',
      'Верея',
      'Клин',
      'Можайск',
    ]) {
      const group = podmoskovye.filter((p) => p.city === city);
      expect(group.length).toBeGreaterThanOrEqual(3);
      expect(group.length).toBeLessThanOrEqual(city === 'Коломна' ? 8 : 5);
      for (let i = 0; i < group.length; i += 1)
        for (let j = i + 1; j < group.length; j += 1) {
          expect(haversine(group[i], group[j])).toBeGreaterThan(30);
          expect(haversine(group[i], group[j]) / 1000).toBeLessThan(30);
        }
    }
    const moscow = { latitude: 55.7516212, longitude: 37.618122 };
    for (const place of podmoskovye) {
      const km = haversine(moscow, place) / 1000;
      expect(km).toBeGreaterThan(20);
      expect(km).toBeLessThan(220);
    }
  });
});
