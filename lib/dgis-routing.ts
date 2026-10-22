import { dgisFetch } from './dgis-client';
import { normalizeDgisDrivingRoute, normalizeDgisTransitRoute } from './dgis-route';
import type { Place, RouteResult, TransportMode } from './types';

const ROUTING_URL = 'https://routing.api.2gis.com/routing/7.0.0/global';
const TRANSIT_URL = 'https://routing.api.2gis.com/public_transport/2.0';

export async function fetchDgisRoute(
  stops: Pick<Place, 'latitude' | 'longitude'>[],
  mode: TransportMode,
  signal?: AbortSignal,
): Promise<RouteResult | null> {
  if (mode === 'transit') return fetchDgisTransit(stops, signal);

  const transport = mode === 'walk' ? 'pedestrian' : 'driving';
  const body = {
    points: stops.map((s) => ({
      type: mode === 'walk' ? 'walking' : 'stop',
      lon: s.longitude,
      lat: s.latitude,
    })),
    transport,
    route_mode: 'fastest',
    traffic_mode: 'jam',
    locale: 'ru',
  };

  const result = await dgisFetch(ROUTING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    timeoutMs: 12000,
  });
  if (!result.ok) return null;
  return normalizeDgisDrivingRoute(result.json, stops);
}

async function fetchDgisTransit(
  stops: Pick<Place, 'latitude' | 'longitude'>[],
  signal?: AbortSignal,
): Promise<RouteResult | null> {
  if (stops.length < 2) return null;
  const body = {
    source: { point: { lat: stops[0].latitude, lon: stops[0].longitude } },
    target: {
      point: {
        lat: stops[stops.length - 1].latitude,
        lon: stops[stops.length - 1].longitude,
      },
    },
    intermediate_points: stops.slice(1, -1).map((s) => ({
      point: { lat: s.latitude, lon: s.longitude },
    })),
    transport: [
      'metro',
      'light_metro',
      'tram',
      'bus',
      'trolleybus',
      'shuttle_bus',
      'suburban_train',
      'mcc',
      'mcd',
    ],
    locale: 'ru',
    max_result_count: 1,
  };

  const result = await dgisFetch(TRANSIT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    timeoutMs: 12000,
  });
  if (!result.ok) return null;
  return normalizeDgisTransitRoute(result.json, stops);
}
