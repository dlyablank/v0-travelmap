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
  };
  visitMinutes: number;
};
export type RouteResult = {
  coordinates: [number, number][];
  distance: number;
  duration: number | null;
  legs: { distance: number; duration: number | null }[];
  source: 'osrm' | 'straight';
  message?: string;
};
