import { load } from '@2gis/mapgl';

// Share the SDK request across remounts, including React development mode.
let pending: ReturnType<typeof load> | undefined;
export function loadMapGL() {
  if (!pending) {
    pending = new Promise<Awaited<ReturnType<typeof load>>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Map SDK timed out')), 12000);
      load()
        .then(resolve, reject)
        .finally(() => clearTimeout(timer));
    }).catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  }
  return pending;
}
