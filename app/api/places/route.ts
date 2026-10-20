import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { places } from '@/lib/data';
import { demoVideos } from '@/lib/demo-videos';
import { placeInput, externalSource } from '@/lib/validation';
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ places, storage: 'local' });
  try {
    const rows = await db.place.findMany({
      include: { videos: true },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({
      places: rows.map(({ videos, ...p }) => {
        const video = videos[0];
        const demo = demoVideos[p.id];
        return {
          ...p,
          video: video && {
            ...video,
            ...(demo && video.playbackUrl === demo.playbackUrl
              ? { credit: demo.credit, previewUrl: demo.previewUrl }
              : {}),
          },
        };
      }),
      storage: 'postgres',
    });
  } catch {
    return NextResponse.json({
      places,
      storage: 'local',
      warning: 'База недоступна. Новые места сохраняются в этом браузере.',
    });
  }
}
export async function POST(req: Request) {
  const parsed = placeInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Проверьте название, описание и координаты.' },
      { status: 400 },
    );
  const { video, ...data } = parsed.data;
  if (
    video?.sourceType !== 'upload' &&
    video?.originalUrl &&
    externalSource(video.originalUrl) !== video.sourceType
  )
    return NextResponse.json({ error: 'Неподдерживаемая ссылка на видео.' }, { status: 400 });
  if (video?.sourceType === 'upload') {
    const base = process.env.S3_PUBLIC_URL;
    if (
      !video.playbackUrl ||
      !(
        /^\/api\/media\/uploads\/[\da-f-]{36}\.(mp4|webm)$/.test(video.playbackUrl) ||
        (base && video.playbackUrl.startsWith(`${base.replace(/\/$/, '')}/uploads/`))
      )
    )
      return NextResponse.json(
        { error: 'Загрузите файл через форму приложения.' },
        { status: 400 },
      );
  }
  if (!process.env.DATABASE_URL)
    return NextResponse.json(
      { error: 'Серверное хранение не настроено. Используйте локальное сохранение.' },
      { status: 503 },
    );
  try {
    const p = await db.place.create({
      data: {
        ...data,
        videos: video ? { create: { ...video, thumbnailUrl: data.thumbnailUrl } } : undefined,
      },
      include: { videos: true },
    });
    return NextResponse.json({ ...p, video: p.videos[0] }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'База данных недоступна.' }, { status: 503 });
  }
}
