import { afterEach, describe, expect, it } from 'vitest';
import { dayPlan, defaultDay } from '../lib/day-plan';
import { locationId } from '../lib/locations';
import { recommendationCandidates } from '../lib/recommendations';
import { useExplorer } from '../lib/store';
import type { Place, RouteResult } from '../lib/types';
const place = (id: string, city = 'Коломна', longitude = 38.75): Place => ({
  id,
  name: id,
  city,
  region: 'Коломна и окрестности',
  latitude: 55.1,
  longitude,
  category: 'Природа',
  description: '',
  thumbnailUrl: '',
  visitMinutes: 60,
  video: { sourceType: 'upload', playbackUrl: '/test.mp4' },
});
const a = place('a'),
  b = place('b', 'Коломна', 38.77);
const road: RouteResult = {
  coordinates: [
    [38.75, 55.1],
    [38.77, 55.1],
  ],
  distance: 2000,
  duration: 600,
  legs: [{ distance: 2000, duration: 600 }],
  source: 'osrm',
};
afterEach(() =>
  useExplorer.setState({
    regionId: 'karelia',
    trip: [],
    locationId: '',
    locationTrips: {},
    regionTrips: {},
    regionLocations: {},
    locationsMigrated: false,
    regionTripsMigrated: false,
    unassignedStops: [],
    daySettings: {},
  }),
);
describe('one-day plans', () => {
  it('retains old stops until their place metadata becomes available', () => {
    useExplorer.setState({ regionId: 'kolomna', trip: [a.id, 'late'], locationsMigrated: false });
    useExplorer.getState().syncLocations([a]);
    expect(useExplorer.getState().unassignedStops).toEqual(['late']);
    const late = place('late', 'Озёры');
    useExplorer.getState().syncLocations([a, late]);
    expect(useExplorer.getState().unassignedStops).toEqual([]);
    useExplorer.getState().setLocation(locationId(late));
    expect(useExplorer.getState().trip).toEqual([a.id, 'late']);
  });
  it('ignores legacy custom visits and uses place estimates in the timeline', () => {
    const plan = dayPlan([a, b], road, { start: '09:00', end: '11:00', visits: { a: 90 } });
    expect(plan.entries.map((e) => [e.arrival, e.departure])).toEqual([
      [540, 600],
      [610, 670],
    ]);
    expect(plan.finish).toBe(670);
    expect(plan.overflow).toBe(10);
    expect(plan.travel).toBe(10);
  });
  it('does not invent arrival times when road duration is unavailable', () => {
    const plan = dayPlan(
      [a, b],
      { ...road, source: 'straight', duration: null, legs: [{ distance: 1000, duration: null }] },
      defaultDay,
    );
    expect(plan.entries[0].arrival).toBe(540);
    expect(plan.entries[1].arrival).toBeNull();
    expect(plan.finish).toBeNull();
    expect(plan.complete).toBe(false);
  });
  it('keeps different cities in one regional trip across location switches', () => {
    const other = place('other', 'Озёры');
    useExplorer.setState({ regionId: 'kolomna', trip: [a.id, other.id], regionTrips: {} });
    useExplorer.getState().syncLocations([a, b, other]);
    expect(useExplorer.getState().trip).toEqual([a.id, other.id]);
    useExplorer.getState().toggleTrip(b.id);
    useExplorer.getState().setLocation(locationId(other));
    expect(useExplorer.getState().trip).toEqual([a.id, other.id, b.id]);
    useExplorer.getState().setLocation(locationId(a));
    expect(useExplorer.getState().trip).toEqual([a.id, other.id, b.id]);
    useExplorer.getState().toggleTrip(a.id);
    useExplorer.getState().syncLocations([a, b, other]);
    expect(useExplorer.getState().trip).toEqual([other.id, b.id]);
  });
  it('keeps daily settings by region while city browsing does not replace them', () => {
    useExplorer.getState().setRegion('kolomna');
    useExplorer.getState().setLocation(locationId(a));
    useExplorer.getState().setDaySettings({ start: '10:00' });
    const elsewhere = locationId(place('c', 'Озёры'));
    useExplorer.getState().setLocation(elsewhere);
    expect(useExplorer.getState().daySettings.kolomna.start).toBe('10:00');
    useExplorer.getState().setRegion('karelia');
    useExplorer.getState().setDaySettings({ start: '08:00' });
    expect(useExplorer.getState().daySettings.kolomna.start).toBe('10:00');
    expect(useExplorer.getState().daySettings.karelia.start).toBe('08:00');
    useExplorer.getState().setRegion('kolomna');
    useExplorer.getState().setDaySettings({ end: '17:00' }, locationId(a));
    expect(useExplorer.getState().daySettings[locationId(a)]).toEqual({
      ...defaultDay,
      start: '10:00',
      end: '17:00',
    });
    expect(useExplorer.getState().daySettings.kolomna.end).toBe(defaultDay.end);
  });
  it('shortlists at most three videos along the route in the same location', () => {
    const candidates = [
      place('c', 'Коломна', 38.755),
      place('d', 'Коломна', 38.758),
      place('e', 'Коломна', 38.76),
      place('f', 'Коломна', 38.762),
      place('remote', 'Коломна', 39.8),
      { ...place('other', 'Озёры', 38.756), region: 'Карелия' },
    ];
    const result = recommendationCandidates([a, b], [a, b, ...candidates], road, 'car');
    expect(result).toHaveLength(3);
    expect(result.every((r) => ['c', 'd', 'e', 'f'].includes(r.place.id))).toBe(true);
    expect(
      recommendationCandidates([a, b], candidates, { ...road, source: 'straight' }, 'car'),
    ).toEqual([]);
  });
});
