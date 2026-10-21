import type { Place, RouteResult } from '@/lib/types';
import type { ExplorerRegion } from '@/lib/regions';

export interface ExplorerMapProps {
  region: ExplorerRegion;
  places: Place[];
  active: Place | null;
  onSelect: (place: Place) => void;
  route: RouteResult | null;
  pickMode: boolean;
  onPick: (latitude: number, longitude: number) => void;
  onReady?: () => void;
  onNeedVideos?: () => void;
  previewsVisible?: boolean;
}
