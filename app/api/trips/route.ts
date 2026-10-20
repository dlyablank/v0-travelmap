import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
const input = z.object({
  title: z.string().min(1).max(100),
  durationDays: z.number().int().min(1).max(2),
  transportMode: z.enum(['car', 'walk']),
  stops: z.array(z.string().max(100)).min(1).max(20),
});
export async function POST(req: Request) {
  const p = input.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Некорректная поездка.' }, { status: 400 });
  if (!process.env.DATABASE_URL)
    return NextResponse.json(
      { error: 'Поездка сохранена только в браузере. База не подключена.' },
      { status: 503 },
    );
  try {
    const { stops, ...data } = p.data;
    const trip = await db.trip.create({
      data: {
        ...data,
        stops: { create: stops.map((placeId, orderIndex) => ({ placeId, orderIndex })) },
      },
    });
    return NextResponse.json({ id: trip.id }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Не удалось сохранить поездку на сервере; локальная копия доступна.' },
      { status: 503 },
    );
  }
}
