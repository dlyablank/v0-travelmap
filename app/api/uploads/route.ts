import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
const MAX = 50 * 1024 * 1024;
export async function POST(req: Request) {
  if (
    !process.env.S3_ENDPOINT ||
    !process.env.S3_BUCKET ||
    !process.env.S3_ACCESS_KEY_ID ||
    !process.env.S3_SECRET_ACCESS_KEY
  )
    return NextResponse.json(
      {
        error:
          'Хранилище видео не подключено. Администратору нужно задать S3_* в окружении. Пока можно добавить ссылку на видео.',
      },
      { status: 503 },
    );
  if (Number(req.headers.get('content-length') || 0) > MAX + 65536)
    return NextResponse.json({ error: 'Максимальный размер — 50 МБ.' }, { status: 413 });
  // Bound the stream even when content-length is missing or forged.
  const reader = req.body?.getReader();
  if (!reader) return NextResponse.json({ error: 'Нет файла.' }, { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX) {
      await reader.cancel();
      return NextResponse.json({ error: 'Максимальный размер — 50 МБ.' }, { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  const mime = req.headers.get('content-type');
  const mp4 = bytes.length > 12 && bytes.toString('ascii', 4, 8) === 'ftyp';
  const webm = bytes.length > 4 && bytes.readUInt32BE(0) === 0x1a45dfa3;
  if (!(mime === 'video/mp4' && mp4) && !(mime === 'video/webm' && webm))
    return NextResponse.json({ error: 'Нужен корректный MP4 или WebM.' }, { status: 415 });
  const key = `uploads/${crypto.randomUUID()}.${mp4 ? 'mp4' : 'webm'}`;
  try {
    const client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    });
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: mime!,
        ContentDisposition: 'inline',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return NextResponse.json({
      url: process.env.S3_PUBLIC_URL
        ? `${process.env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`
        : `/api/media/${key}`,
    });
  } catch {
    return NextResponse.json(
      { error: 'Не удалось загрузить видео. Проверьте подключение к хранилищу.' },
      { status: 503 },
    );
  }
}
