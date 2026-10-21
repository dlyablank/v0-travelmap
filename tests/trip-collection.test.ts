import { expect, it } from 'vitest';
import { collectedTripIds, cityTripStops } from '../lib/trip-collection';
import { locationId } from '../lib/locations';
import { places } from '../lib/data';
import { regionAtCenter } from '../lib/regions';

it('collects every region and pending id without duplicates', () => {
  expect(
    collectedTripIds({
      trip: ['a', 'b'],
      regionTrips: { karelia: ['a'], kolomna: ['c', 'd'] },
      unassignedStops: ['e', 'b'],
    }),
  ).toEqual(['a', 'c', 'd', 'b', 'e']);
});
it('builds a city plan without consuming the other saved cities', () => {
  const selected = places.filter((p) =>
    ['suisaari', 'kolomna-kremlin', 'kolomna-lazhechnikova', 'kolomna-golutvin'].includes(p.id),
  );
  const ids = selected.map((p) => p.id);
  const city = locationId(selected.find((p) => p.id === 'kolomna-kremlin')!);
  expect(cityTripStops(ids, places, city, 'kolomna').map((p) => p.id)).toEqual([
    'kolomna-kremlin',
    'kolomna-lazhechnikova',
  ]);
  expect(ids).toHaveLength(4);
});
it('recognises camera regions and stays stable between them', () => {
  expect(regionAtCenter([38.76, 55.104], 'karelia').id).toBe('kolomna');
  expect(regionAtCenter([32.1, 61.94], 'kolomna').id).toBe('karelia');
  expect(regionAtCenter([35.43, 58.52], 'karelia').id).toBe('karelia');
});
