import { describe, expect, it } from 'vitest';
import { yandexRoute, yandexRouteParts } from '../lib/yandex-route';
import { routeInstructions } from '../lib/route-instructions';

describe('Yandex directions', () => {
  for (const mode of ['car', 'walk', 'transit'] as const)
    for (const count of [2, 3, 10, 11, 20])
      it(`preserves every ordered leg for ${count} stops in ${mode}`, () => {
        const stops = Array.from({ length: count }, (_, i) => ({
          latitude: 55 + i / 100,
          longitude: 38 + i / 100,
        }));
        const links = yandexRouteParts(stops, mode).map((href) => new URL(href));
        const actualLegs = links.flatMap((url) => {
          expect(url.searchParams.get('rtt')).toBe(
            { car: 'auto', walk: 'pd', transit: 'mt' }[mode],
          );
          const points = url.searchParams.get('rtext')!.split('~');
          expect(points.length).toBeLessThanOrEqual(10);
          return points.slice(1).map((p, i) => [points[i], p]);
        });
        expect(actualLegs).toEqual(
          stops
            .slice(1)
            .map((p, i) => [
              `${stops[i].latitude},${stops[i].longitude}`,
              `${p.latitude},${p.longitude}`,
            ]),
        );
        expect(
          new URL(yandexRoute([...stops].reverse(), mode)).searchParams.get('rtext')!.split('~')[0],
        ).toBe(`${stops.at(-1)!.latitude},${stops.at(-1)!.longitude}`);
      });
});

it('translates confirmed maneuvers without inventing an unknown turn', () => {
  expect(
    routeInstructions([
      { name: 'Набережная', distance: 120, maneuver: { type: 'turn', modifier: 'left' } },
      { maneuver: { type: 'future-maneuver', modifier: 'right' } },
    ]),
  ).toEqual([
    { text: 'Поверните налево · Набережная', distance: 120 },
    { text: 'Продолжайте движение', distance: 0 },
  ]);
});
