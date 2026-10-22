import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dgisFetch, hasDgisApiKey } from '@/lib/dgis-client';
import { HOTEL_QUERY, normalizeDgisPlaces } from '@/lib/dgis-places';

const schema = z.object({
  latitude: z.number().min(-85).max(85),
  longitude: z.number().min(-180).max(180),
  radius: z.number().int().min(200).max(5000).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = schema.safeParse({
    latitude: Number(url.searchParams.get('lat')),
    longitude: Number(url.searchParams.get('lon')),
    radius: url.searchParams.has('radius')
      ? Number(url.searchParams.get('radius'))
      : undefined,
  });
  if (!parsed.success)
    return NextResponse.json({ error: 'Укажите корректные lat и lon.' }, { status: 400 });

  if (!hasDgisApiKey())
    return NextResponse.json({ items: [], fallback: 'links' as const, source: null });

  const { latitude, longitude, radius = 2500 } = parsed.data;
  const endpoint = new URL('https://catalog.api.2gis.com/3.0/items');
  endpoint.searchParams.set('q', HOTEL_QUERY);
  endpoint.searchParams.set('location', `${longitude},${latitude}`);
  endpoint.searchParams.set('radius', String(radius));
  endpoint.searchParams.set('page_size', '5');
  endpoint.searchParams.set('fields', 'items.point,items.address_name,items.full_address_name');
  endpoint.searchParams.set('locale', 'ru_RU');

  const result = await dgisFetch(endpoint.toString(), {
    signal: request.signal,
    timeoutMs: 10000,
  });
  if (!result.ok)
    return NextResponse.json({ items: [], fallback: 'links' as const, source: null });

  return NextResponse.json({
    items: normalizeDgisPlaces(result.json, 5),
    fallback: null,
    source: 'dgis' as const,
  });
}
