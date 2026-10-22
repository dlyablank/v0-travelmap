import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasDgisApiKey } from '@/lib/dgis-client';
import { fetchDgisRoute } from '@/lib/dgis-routing';
import { routeInstructions, type RoutingStep } from '@/lib/route-instructions';
import { straightRoute } from '@/lib/routing';

const schema = z.object({
  stops: z
    .array(
      z.object({
        latitude: z.number().min(-85).max(85),
        longitude: z.number().min(-180).max(180),
      }),
    )
    .min(2)
    .max(20),
  mode: z.enum(['car', 'walk', 'transit']),
});

async function osrmRoute(
  stops: { latitude: number; longitude: number }[],
  mode: 'car' | 'walk',
  request: Request,
) {
  if (mode === 'walk' && !process.env.WALKING_ROUTING_URL) {
    return straightRoute(
      stops,
      'Пешеходный маршрутизатор не настроен. Показаны расстояния по прямой, без оценки времени.',
    );
  }
  const base =
    mode === 'walk'
      ? process.env.WALKING_ROUTING_URL!
      : process.env.ROUTING_URL || 'https://router.project-osrm.org/route/v1/driving';
  const coords = stops.map((p) => `${p.longitude},${p.latitude}`).join(';');
  const res = await fetch(
    `${base.replace(/\/$/, '')}/${coords}?overview=full&geometries=geojson&steps=true`,
    {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(12000)]),
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error('upstream');
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('no route');
  if (data.waypoints?.some((p: { distance: number }) => p.distance > 1500))
    throw new Error('inaccessible');
  const r = data.routes[0];
  return {
    coordinates: r.geometry.coordinates,
    distance: r.distance,
    duration: r.duration,
    legs: r.legs.map((l: { distance: number; duration: number; steps?: RoutingStep[] }) => ({
      distance: l.distance,
      duration: l.duration,
      instructions: routeInstructions(l.steps),
    })),
    source: 'osrm' as const,
  };
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Выберите от 2 до 20 корректных точек.' }, { status: 400 });
  const { stops, mode } = parsed.data;

  if (hasDgisApiKey()) {
    try {
      const dgis = await fetchDgisRoute(stops, mode, request.signal);
      if (dgis) return NextResponse.json(dgis);
    } catch {
      // Fall through to OSRM / straight without exposing key details.
    }
  }

  if (mode === 'transit')
    return NextResponse.json(
      straightRoute(
        stops,
        'Актуальные рейсы, остановки и пересадки смотрите в Яндекс Картах или 2GIS для каждого перехода. Время пути неизвестно; расстояния показаны по прямой.',
      ),
    );

  try {
    return NextResponse.json(await osrmRoute(stops, mode, request));
  } catch {
    return NextResponse.json(
      straightRoute(
        stops,
        'Дорожный маршрут недоступен: сервис не отвечает или точка требует водного транспорта. Показаны расстояния по прямой; время в пути не рассчитано.',
      ),
    );
  }
}
