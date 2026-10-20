import { GetObjectCommand } from '@aws-sdk/client-s3';
import { storageClient } from '@/lib/s3';
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const path = key.join('/');
  if (!/^uploads\/[\da-f-]{36}\.(mp4|webm)$/.test(path) || !process.env.S3_BUCKET)
    return new Response('Not found', { status: 404 });
  try {
    const range = req.headers.get('range');
    if (range && !/^bytes=\d*-\d*$/.test(range))
      return new Response('Invalid range', { status: 416 });
    const data = await storageClient().send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: path, Range: range || undefined }),
    );
    const headers = new Headers({
      'Content-Type': data.ContentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
    });
    if (data.ContentLength !== undefined) headers.set('Content-Length', String(data.ContentLength));
    if (data.ContentRange) headers.set('Content-Range', data.ContentRange);
    return new Response(data.Body?.transformToWebStream() as ReadableStream, {
      status: range ? 206 : 200,
      headers,
    });
  } catch {
    return new Response('Media unavailable', { status: 404 });
  }
}
