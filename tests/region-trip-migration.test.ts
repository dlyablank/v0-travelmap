import { beforeEach, expect, it } from 'vitest';
import { useExplorer } from '../lib/store';
import { locationId } from '../lib/locations';
import { places } from '../lib/data';
const a = places.find((p) => p.id === 'suisaari')!;
const b = places.find((p) => p.id === 'syskyanjoki')!;
const c = places.find((p) => p.id === 'kolomna-kremlin')!;
beforeEach(() =>
  useExplorer.setState({
    regionId: 'karelia',
    regionTripsMigrated: false,
    locationsMigrated: true,
    trip: [],
    locationId: locationId(a),
    locationTrips: {},
    regionTrips: {},
    regionLocations: {},
    unassignedStops: [],
    daySettings: {},
    customPlaces: [],
  }),
);
it('merges city buckets once, preserves current order/settings and does not resurrect removals', () => {
  useExplorer.setState({
    trip: [b.id],
    locationId: locationId(b),
    locationTrips: {
      [locationId(a)]: [a.id],
      [locationId(b)]: [b.id, 'removed'],
      [locationId(c)]: [c.id],
    },
    regionTrips: { karelia: ['removed', a.id] },
    daySettings: { [locationId(b)]: { start: '10:00', end: '20:00', visits: {} } },
  });
  useExplorer.getState().syncLocations(places);
  expect(useExplorer.getState().trip).toEqual([b.id, a.id]);
  expect(useExplorer.getState().daySettings.karelia.start).toBe('10:00');
  expect(useExplorer.getState().daySettings[locationId(b)].start).toBe('10:00');
  useExplorer.getState().toggleTrip(a.id);
  useExplorer.getState().syncLocations(places);
  expect(useExplorer.getState().trip).toEqual([b.id]);
  useExplorer.getState().setLocation(locationId(a));
  expect(useExplorer.getState().trip).toEqual([b.id]);
  useExplorer.getState().setRegion('kolomna');
  expect(useExplorer.getState().trip).toEqual([c.id]);
  useExplorer.getState().setRegion('karelia');
  expect(useExplorer.getState().trip).toEqual([b.id]);
});
it('keeps unknown metadata deferred and can resolve it without importing old buckets again', () => {
  const late = { ...b, id: 'late' };
  useExplorer.setState({ trip: [a.id], locationTrips: { [locationId(b)]: ['late'] } });
  useExplorer.getState().syncLocations([a]);
  expect(useExplorer.getState().trip).toEqual([a.id, 'late']);
  expect(useExplorer.getState().unassignedStops).toEqual(['late']);
  useExplorer.getState().syncLocations([a, late]);
  expect(useExplorer.getState().trip).toEqual([a.id, 'late']);
  expect(useExplorer.getState().unassignedStops).toEqual([]);
  useExplorer.getState().reorder(['late', a.id]);
  useExplorer.getState().syncLocations([a, late]);
  expect(useExplorer.getState().trip).toEqual(['late', a.id]);
});
it('keeps collected places beyond the separate 20-stop route limit', () => {
  const many = Array.from({ length: 22 }, (_, i) => ({ ...a, id: `many-${i}` }));
  useExplorer.setState({
    trip: many.slice(0, 10).map((p) => p.id),
    locationTrips: { [locationId(b)]: many.slice(10).map((p) => p.id) },
  });
  useExplorer.getState().syncLocations(many);
  expect(useExplorer.getState().trip).toHaveLength(22);
  useExplorer.getState().toggleTrip('extra');
  expect(useExplorer.getState().trip).toHaveLength(23);
  useExplorer.getState().toggleTrip(many[0].id);
  useExplorer.getState().syncLocations(many);
  expect(useExplorer.getState().trip).toHaveLength(22);
  expect(useExplorer.getState().trip).not.toContain(many[0].id);
});
it('moves a deferred legacy id to its actual region when metadata arrives', () => {
  useExplorer.setState({ trip: [a.id, c.id], locationsMigrated: false });
  useExplorer.getState().syncLocations([a]);
  useExplorer.getState().syncLocations([a, c]);
  expect(useExplorer.getState().trip).toEqual([a.id]);
  useExplorer.getState().setRegion('kolomna');
  expect(useExplorer.getState().trip).toEqual([c.id]);
});
it('preserves deferred ids during visible deletion/reorder and later metadata arrival', () => {
  const late = { ...b, id: 'late' };
  useExplorer.setState({ trip: [a.id], locationTrips: { [locationId(b)]: [b.id, 'late'] } });
  useExplorer.getState().syncLocations([a, b]);
  useExplorer.getState().reorder([b.id]); // Delete only the visible a.
  expect(useExplorer.getState().trip).toEqual([b.id, 'late']);
  expect(useExplorer.getState().unassignedStops).toEqual(['late']);
  useExplorer.getState().syncLocations([a, b, late]);
  expect(useExplorer.getState().trip).toEqual([b.id, 'late']);
  expect(useExplorer.getState().trip).not.toContain(a.id);
  expect(useExplorer.getState().unassignedStops).toEqual([]);
});
it('moves a saved Kolomna region to Podmoskovye and does not restore a removed stop', () => {
  const suburb = `${encodeURIComponent('Коломна и окрестности')}::${encodeURIComponent('Окраина Коломны')}`;
  const kolomna = locationId(places.find((p) => p.id === 'kolomna-golutvin')!);
  useExplorer.setState({
    regionId: 'kolomna',
    regionTripsMigrated: true,
    locationsMigrated: true,
    trip: ['kolomna-kremlin', 'kolomna-zaraysk'],
    regionTrips: {
      karelia: ['suisaari'],
      kolomna: ['kolomna-kremlin', 'kolomna-zaraysk'],
    },
    locationId: suburb,
    locationTrips: { [suburb]: ['kolomna-golutvin'] },
    regionLocations: { kolomna: suburb },
    daySettings: {
      kolomna: { start: '10:00', end: '18:00', visits: {} },
    },
    customPlaces: [
      {
        ...c,
        id: 'custom-bobrenevo',
        region: 'Коломна и окрестности',
        city: 'Старое Бобренево',
      },
    ],
  });
  useExplorer.getState().syncLocations(places);
  const migrated = useExplorer.getState();
  expect(migrated.regionId).toBe('podmoskovye');
  expect(migrated.trip).toEqual(['kolomna-kremlin', 'kolomna-zaraysk']);
  expect(migrated.regionTrips.kolomna).toBeUndefined();
  expect(migrated.regionTrips.karelia).toEqual(['suisaari']);
  expect(migrated.locationId).toBe(kolomna);
  expect(migrated.regionLocations.podmoskovye).toBe(kolomna);
  expect(migrated.regionLocations.kolomna).toBeUndefined();
  expect(migrated.daySettings.podmoskovye.start).toBe('10:00');
  expect(migrated.daySettings.kolomna).toBeUndefined();
  expect(migrated.customPlaces[0]).toMatchObject({
    id: 'custom-bobrenevo',
    region: 'Подмосковье',
    city: 'Коломна',
  });
  useExplorer.getState().toggleTrip('kolomna-zaraysk');
  useExplorer.getState().syncLocations(places);
  expect(useExplorer.getState().trip).toEqual(['kolomna-kremlin']);
  useExplorer.getState().syncLocations(places);
  expect(useExplorer.getState().trip).toEqual(['kolomna-kremlin']);
  expect(useExplorer.getState().regionTrips.podmoskovye).toEqual(['kolomna-kremlin']);
});
it('keeps existing Podmoskovye stops ahead of legacy Kolomna ids', () => {
  useExplorer.setState({
    regionId: 'podmoskovye',
    regionTripsMigrated: true,
    locationsMigrated: true,
    trip: ['kolomna-pastila'],
    regionTrips: {
      podmoskovye: ['kolomna-pastila'],
      kolomna: ['kolomna-kremlin', 'kolomna-pastila'],
    },
  });
  useExplorer.getState().syncLocations(places);
  expect(useExplorer.getState().regionId).toBe('podmoskovye');
  expect(useExplorer.getState().trip).toEqual(['kolomna-pastila', 'kolomna-kremlin']);
  expect(useExplorer.getState().regionTrips.kolomna).toBeUndefined();
  useExplorer.getState().syncLocations(places);
  expect(useExplorer.getState().trip).toEqual(['kolomna-pastila', 'kolomna-kremlin']);
});
