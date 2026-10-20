'use client';
import { useEffect, type RefObject } from 'react';
import { createMapVideoPreview } from '@/lib/map-video-preview';

export function useCardVideoPreviews(
  root: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  places: unknown,
) {
  useEffect(() => {
    if (!root.current || !enabled) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = matchMedia('(max-width: 767px)');
    const connection = (
      navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }
    ).connection;
    const items = [...root.current.querySelectorAll<HTMLButtonElement>('[data-preview-url]')].map(
      (button) => ({
        button,
        visible: false,
        preview: createMapVideoPreview(button, button.dataset.previewUrl!, 6),
      }),
    );
    function update() {
      const allowed = !document.hidden && !motion.matches && !connection?.saveData;
      const playing = new Set(
        allowed ? items.filter((item) => item.visible).slice(0, mobile.matches ? 2 : 4) : [],
      );
      items.forEach((item) => {
        if (!playing.has(item)) item.preview.stop();
      });
      playing.forEach((item) => item.preview.start());
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const item = items.find((item) => item.button === entry.target);
          if (item) item.visible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
        }
        update();
      },
      { threshold: [0, 0.2] },
    );
    items.forEach((item) => observer.observe(item.button));
    document.addEventListener('visibilitychange', update);
    motion.addEventListener('change', update);
    mobile.addEventListener('change', update);
    connection?.addEventListener('change', update);
    return () => {
      observer.disconnect();
      items.forEach((item) => item.preview.stop());
      document.removeEventListener('visibilitychange', update);
      motion.removeEventListener('change', update);
      mobile.removeEventListener('change', update);
      connection?.removeEventListener('change', update);
    };
  }, [root, enabled, places]);
}
