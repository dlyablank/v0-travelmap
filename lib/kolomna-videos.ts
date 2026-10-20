import type { Place } from './types';

const segments: [string, number, number][] = [
  ['kolomna-kremlin', 1, 1298],
  ['kolomna-lazhechnikova', 1, 2035],
  ['kolomna-zaytseva', 2, 30],
  ['kolomna-viewpoint', 2, 180],
  ['kolomna-pastila', 2, 660],
  ['kolomna-golutvin', 2, 2202],
  ['kolomna-strelka', 2, 2350],
];

// Seven distinct place excerpts from two CC BY travel walks, not seven independent films.
export const kolomnaVideos: Record<string, NonNullable<Place['video']>> = Object.fromEntries(
  segments.map(([id, part, start]) => [
    id,
    {
      sourceType: 'upload' as const,
      originalUrl: `https://www.youtube.com/watch?v=${part === 1 ? 'G_TN_YovO80' : 'HJmxirQ6u8M'}&t=${start}s`,
      playbackUrl: `/media/videos/${id}.mp4`,
      previewUrl: `/media/videos/${id}-preview.mp4`,
      credit: {
        author: 'Андрей Елбаев (yelbayev)',
        authorUrl: 'https://www.youtube.com/@yelbayev',
        rightsBasis: 'open-license' as const,
        sourceUrl: `https://commons.wikimedia.org/w/index.php?curid=${part === 1 ? 131591655 : 131591995}`,
        license: 'CC BY 3.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
        changes: `Фрагмент 15 с из прогулки, часть ${part}, с ${Math.floor(start / 60)}:${String(start % 60).padStart(2, '0')}. Звук убран, размер изменён, превью кадрировано. Монтаж оригинала — Лев Дьяконов.`,
      },
    },
  ]),
);
