import { z } from 'zod';
import { categories } from './types';
export const placeInput = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(5).max(800),
  latitude: z.number().min(-85).max(85),
  longitude: z.number().min(-180).max(180),
  city: z.string().trim().min(2).max(80),
  region: z.string().max(80).default('Карелия'),
  category: z.enum(
    categories.slice(1) as ['Природа', 'Красивые виды', 'Приключения', 'Кафе', 'Отели'],
  ),
  thumbnailUrl: z.string().max(120000).default('/media/fallback.svg'),
  visitMinutes: z.number().int().min(5).max(1440).default(60),
  video: z
    .object({
      sourceType: z.enum(['upload', 'youtube', 'instagram', 'tiktok']),
      originalUrl: z.url().optional(),
      playbackUrl: z
        .union([z.url(), z.string().regex(/^\/api\/media\/uploads\/[\da-f-]{36}\.(mp4|webm)$/)])
        .optional(),
    })
    .optional(),
});
export function externalSource(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    const h = u.hostname.replace(/^www\./, '');
    if (['youtube.com', 'youtu.be'].includes(h)) return 'youtube';
    if (h === 'instagram.com' && /^\/reel\//.test(u.pathname)) return 'instagram';
    if (h === 'tiktok.com' || h === 'vm.tiktok.com') return 'tiktok';
  } catch {}
  return null;
}
export function youtubeId(url: string) {
  try {
    const u = new URL(url);
    const id =
      u.hostname === 'youtu.be'
        ? u.pathname.slice(1)
        : u.searchParams.get('v') || u.pathname.match(/\/(?:shorts|embed)\/([^/]+)/)?.[1];
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
