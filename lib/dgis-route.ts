import type { Place, RouteResult, TransportMode } from './types';

const RS_TYPE: Record<TransportMode, string> = {
  car: 'car',
  walk: 'pedestrian',
  transit: 'bus',
};

/** External 2GIS directions link (no server key required). */
export function dgisRoute(
  stops: Pick<Place, 'latitude' | 'longitude'>[],
  mode: TransportMode,
) {
  if (stops.length < 2) return 'https://2gis.ru/directions/tab/' + RS_TYPE[mode];
  const points = stops.map((p) => `${p.longitude},${p.latitude}`).join('|');
  return `https://2gis.ru/directions/tab/${RS_TYPE[mode]}/${points}`;
}

/**
 * 2GIS web directions accept a limited chain of points; chunk like Yandex
 * (10 points per part, shared boundary stop).
 */
export function dgisRouteParts(
  stops: Pick<Place, 'latitude' | 'longitude'>[],
  mode: TransportMode,
) {
  const links: string[] = [];
  for (let start = 0; start < stops.length - 1; start += 9)
    links.push(dgisRoute(stops.slice(start, start + 10), mode));
  return links;
}

export function dgisPlaceLink(id: string | undefined, lat: number, lon: number) {
  if (id) return `https://2gis.ru/firm/${id}`;
  return `https://2gis.ru/geo/${lon}%2C${lat}`;
}

export function dgisSearchLink(query: string, lat: number, lon: number) {
  return `https://2gis.ru/search/${encodeURIComponent(query)}/geo/${lon}%2C${lat}`;
}

export function yandexSearchLink(query: string, lat: number, lon: number) {
  return `https://yandex.ru/maps/?text=${encodeURIComponent(query)}&ll=${lon}%2C${lat}&z=16`;
}

export type SearchLinkCard = {
  id: string;
  name: string;
  address?: string;
  href: string;
  source: '2gis-search' | 'yandex-search';
};

export function hotelSearchFallback(lat: number, lon: number): SearchLinkCard[] {
  return [
    {
      id: 'dgis-hotels',
      name: 'Отели рядом в 2GIS',
      href: dgisSearchLink('гостиница', lat, lon),
      source: '2gis-search',
    },
    {
      id: 'yandex-hotels',
      name: 'Отели рядом в Яндекс Картах',
      href: yandexSearchLink('гостиница', lat, lon),
      source: 'yandex-search',
    },
  ];
}

export function mealSearchFallback(
  slot: 'breakfast' | 'lunch' | 'dinner',
  lat: number,
  lon: number,
): SearchLinkCard[] {
  const query =
    slot === 'breakfast' ? 'кафе завтрак' : slot === 'lunch' ? 'кафе' : 'ресторан';
  const label =
    slot === 'breakfast' ? 'Завтрак' : slot === 'lunch' ? 'Обед' : 'Ужин';
  return [
    {
      id: `dgis-${slot}`,
      name: `${label} рядом в 2GIS`,
      href: dgisSearchLink(query, lat, lon),
      source: '2gis-search',
    },
    {
      id: `yandex-${slot}`,
      name: `${label} рядом в Яндекс Картах`,
      href: yandexSearchLink(query, lat, lon),
      source: 'yandex-search',
    },
  ];
}

/** Parse WKT LINESTRING / MULTILINESTRING into [lon, lat] pairs. */
export function parseWktLine(wkt: string | undefined | null): [number, number][] {
  if (!wkt) return [];
  const coords = [...wkt.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map(
    (m) => [Number(m[1]), Number(m[2])] as [number, number],
  );
  return coords.filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

type DgisManeuver = {
  comment?: string;
  outcoming_path_comment?: string;
  outcoming_path?: {
    distance?: number;
    duration?: number;
    geometry?: string | { selection?: string };
  };
};

type DgisRouteOption = {
  total_distance?: number;
  total_duration?: number;
  maneuvers?: DgisManeuver[];
  begin_pedestrian_path?: { geometry?: { selection?: string } };
  end_pedestrian_path?: { geometry?: { selection?: string } };
};

function geometryFromManeuver(maneuver: DgisManeuver): [number, number][] {
  const raw = maneuver.outcoming_path?.geometry;
  const wkt = typeof raw === 'string' ? raw : raw?.selection;
  return parseWktLine(wkt);
}

/**
 * Normalize a 2GIS Routing 7.x car/pedestrian result into RouteResult.
 * Legs are split at intermediate waypoints when waypoint indexes are unavailable:
 * we distribute total distance/duration proportionally by straight segments if needed,
 * or keep a single aggregated leg chain from maneuvers when stop count is 2.
 */
export function normalizeDgisDrivingRoute(
  payload: unknown,
  stops: Pick<Place, 'latitude' | 'longitude'>[],
): RouteResult | null {
  const root = payload as {
    result?: DgisRouteOption[] | { items?: DgisRouteOption[] };
  };
  const options = Array.isArray(root.result)
    ? root.result
    : root.result?.items && Array.isArray(root.result.items)
      ? root.result.items
      : null;
  const option = options?.[0];
  if (!option || option.total_distance == null || option.total_duration == null) return null;

  const coordinates: [number, number][] = [];
  const begin = parseWktLine(option.begin_pedestrian_path?.geometry?.selection);
  coordinates.push(...begin);

  const instructions: { text: string; distance: number }[] = [];
  for (const maneuver of option.maneuvers || []) {
    coordinates.push(...geometryFromManeuver(maneuver));
    const text = maneuver.comment || maneuver.outcoming_path_comment;
    if (text)
      instructions.push({
        text,
        distance: maneuver.outcoming_path?.distance || 0,
      });
  }
  coordinates.push(...parseWktLine(option.end_pedestrian_path?.geometry?.selection));

  if (coordinates.length < 2) {
    coordinates.length = 0;
    coordinates.push(
      ...stops.map((s) => [s.longitude, s.latitude] as [number, number]),
    );
  }

  // Split into N-1 legs by nearest coordinate to each stop (except first).
  const legs = buildLegsFromCoordinates(
    stops,
    coordinates,
    option.total_distance,
    option.total_duration,
    instructions,
  );

  return {
    coordinates,
    distance: option.total_distance,
    duration: option.total_duration,
    legs,
    source: 'dgis',
  };
}

function buildLegsFromCoordinates(
  stops: Pick<Place, 'latitude' | 'longitude'>[],
  coordinates: [number, number][],
  totalDistance: number,
  totalDuration: number,
  instructions: { text: string; distance: number }[],
) {
  if (stops.length < 2) return [];
  if (stops.length === 2) {
    return [
      {
        distance: totalDistance,
        duration: totalDuration,
        instructions: instructions.slice(0, 12),
      },
    ];
  }

  const indexes = [0];
  for (let s = 1; s < stops.length; s++) {
    let best = indexes[indexes.length - 1] + 1;
    let bestDist = Infinity;
    for (let i = best; i < coordinates.length; i++) {
      const dlat = coordinates[i][1] - stops[s].latitude;
      const dlon = coordinates[i][0] - stops[s].longitude;
      const d = dlat * dlat + dlon * dlon;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    indexes.push(Math.max(best, indexes[indexes.length - 1] + 1));
  }
  indexes[indexes.length - 1] = coordinates.length - 1;

  const segmentLengths: number[] = [];
  for (let s = 0; s < stops.length - 1; s++) {
    let len = 0;
    for (let i = indexes[s]; i < indexes[s + 1]; i++) {
      const a = coordinates[i];
      const b = coordinates[i + 1];
      if (!a || !b) continue;
      const dlat = ((b[1] - a[1]) * Math.PI) / 180;
      const dlon = ((b[0] - a[0]) * Math.PI) / 180;
      const lat1 = (a[1] * Math.PI) / 180;
      const lat2 = (b[1] * Math.PI) / 180;
      len +=
        6371000 *
        2 *
        Math.atan2(
          Math.sqrt(
            Math.sin(dlat / 2) ** 2 +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2,
          ),
          Math.sqrt(
            1 -
              (Math.sin(dlat / 2) ** 2 +
                Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2),
          ),
        );
    }
    segmentLengths.push(Math.max(len, 1));
  }
  const sum = segmentLengths.reduce((a, b) => a + b, 0) || 1;

  return segmentLengths.map((len, index) => ({
    distance: Math.round((totalDistance * len) / sum),
    duration: Math.round((totalDuration * len) / sum),
    instructions: index === 0 ? instructions.slice(0, 8) : undefined,
  }));
}

export function normalizeDgisTransitRoute(
  payload: unknown,
  stops: Pick<Place, 'latitude' | 'longitude'>[],
): RouteResult | null {
  const list = Array.isArray(payload)
    ? payload
    : (payload as { result?: unknown[] })?.result;
  if (!Array.isArray(list) || !list.length) return null;
  const best = list[0] as {
    total_distance?: number;
    total_duration?: number;
    movements?: {
      alternatives?: {
        geometry?: { selection?: string }[];
        platforms?: { geometry?: { selection?: string } }[];
      }[];
      waypoint?: { lon?: number; lat?: number };
    }[];
  };
  if (best.total_distance == null || best.total_duration == null) return null;

  const coordinates: [number, number][] = stops.map((s) => [
    s.longitude,
    s.latitude,
  ]);
  // Prefer stop anchors; append any WKT scraps if present.
  for (const movement of best.movements || []) {
    for (const alt of movement.alternatives || []) {
      for (const geom of alt.geometry || []) {
        coordinates.push(...parseWktLine(geom.selection));
      }
    }
  }

  const legs =
    stops.length === 2
      ? [
          {
            distance: best.total_distance,
            duration: best.total_duration,
            instructions: [
              {
                text: 'Маршрут общественного транспорта по данным 2GIS. Уточняйте рейсы в навигаторе.',
                distance: best.total_distance,
              },
            ],
          },
        ]
      : buildLegsFromCoordinates(
          stops,
          coordinates,
          best.total_distance,
          best.total_duration,
          [],
        );

  return {
    coordinates,
    distance: best.total_distance,
    duration: best.total_duration,
    legs,
    source: 'dgis',
    message:
      'Маршрут ОТ по данным 2GIS. Актуальные рейсы и пересадки уточняйте в навигаторе перед выходом.',
  };
}
