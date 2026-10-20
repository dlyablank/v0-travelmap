'use client';
/** Capture only a file the user explicitly selected; no external media downloads. */
export function videoThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (image = '/media/fallback.svg') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(image);
    };
    const timer = setTimeout(() => finish(), 5000);
    video.muted = true;
    video.preload = 'auto';
    video.onloadeddata = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 180;
        canvas.height = Math.round((180 * video.videoHeight) / video.videoWidth) || 320;
        canvas.height = Math.min(canvas.height, 480);
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', 0.65));
      } catch {
        finish();
      }
    };
    video.onerror = () => finish();
    video.src = url;
  });
}
