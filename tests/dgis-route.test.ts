import { describe, expect, it } from 'vitest';
import {
  dgisRoute,
  dgisRouteParts,
  normalizeDgisDrivingRoute,
  parseWktLine,
} from '../lib/dgis-route';
import { normalizeDgisPlaces } from '../lib/dgis-places';

describe('2GIS helpers', () => {
  it('builds external directions links for car, walk and transit', () => {
    const stops = [
      { latitude: 55.1, longitude: 38.75 },
      { latitude: 55.11, longitude: 38.76 },
    ];
    expect(dgisRoute(stops, 'car')).toContain('/directions/tab/car/');
    expect(dgisRoute(stops, 'walk')).toContain('/directions/tab/pedestrian/');
    expect(dgisRoute(stops, 'transit')).toContain('/directions/tab/bus/');
    expect(dgisRoute(stops, 'car')).toContain('38.75,55.1');
  });

  it('chunks long routes into overlapping parts', () => {
    const stops = Array.from({ length: 12 }, (_, i) => ({
      latitude: 55 + i * 0.01,
      longitude: 38 + i * 0.01,
    }));
    expect(dgisRouteParts(stops, 'car')).toHaveLength(2);
  });

  it('parses WKT linestrings', () => {
    expect(parseWktLine('LINESTRING(37.5 55.7, 37.6 55.8)')).toEqual([
      [37.5, 55.7],
      [37.6, 55.8],
    ]);
  });

  it('normalizes a driving fixture without live API calls', () => {
    const fixture = {
      result: [
        {
          total_distance: 2000,
          total_duration: 600,
          maneuvers: [
            {
              comment: 'Старт',
              outcoming_path: {
                distance: 2000,
                duration: 600,
                geometry: { selection: 'LINESTRING(38.75 55.1, 38.76 55.11)' },
              },
            },
          ],
        },
      ],
    };
    const route = normalizeDgisDrivingRoute(fixture, [
      { latitude: 55.1, longitude: 38.75 },
      { latitude: 55.11, longitude: 38.76 },
    ]);
    expect(route?.source).toBe('dgis');
    expect(route?.distance).toBe(2000);
    expect(route?.duration).toBe(600);
    expect(route?.legs).toHaveLength(1);
    expect(route?.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it('normalizes places catalog items', () => {
    const items = normalizeDgisPlaces({
      result: {
        items: [
          {
            id: '1',
            name: 'Отель Тест',
            address_name: 'ул. Пример, 1',
            point: { lat: 55.1, lon: 38.75 },
          },
          { id: '2', name: 'Без точки' },
        ],
      },
    });
    expect(items).toHaveLength(1);
    expect(items[0].href).toContain('2gis.ru');
    expect(items[0].source).toBe('dgis');
  });
});
