export const categories = [
  'Все места',
  'Природа',
  'Красивые виды',
  'Приключения',
  'Кафе',
  'Отели',
] as const;
export type Category = Exclude<(typeof categories)[number], 'Все места'>;
export type Place = {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  city: string;
  region: string;
  category: Category;
  thumbnailUrl: string;
  imageCredit?: string;
  imagePage?: string;
  video?: {
    sourceType: 'upload' | 'youtube' | 'tiktok' | 'instagram';
    originalUrl?: string;
    playbackUrl?: string;
    previewUrl?: string;
    credit?: {
      author: string;
      authorUrl?: string;
      recordedAt?: string;
      rightsBasis?: 'open-license' | 'public-domain' | 'author-permission';
      sourceUrl: string;
      license: string;
      licenseUrl: string;
      changes?: string;
    };
  };
  visitMinutes: number;
};
export type TransportMode = 'car' | 'walk' | 'transit';
export type RouteResult = {
  stopIds?: string[];
  mode?: 'car' | 'walk' | 'transit';
  locationId?: string;
  coordinates: [number, number][];
  distance: number;
  duration: number | null;
  legs: {
    distance: number;
    duration: number | null;
    instructions?: { text: string; distance: number }[];
  }[];
  source: 'osrm' | 'straight';
  message?: string;
};
