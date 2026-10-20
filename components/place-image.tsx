'use client';
import { useState } from 'react';
import type { Place } from '@/lib/types';
export function PlaceImage({
  place,
  className = '',
  loading = 'lazy',
}: {
  place: Place;
  className?: string;
  loading?: 'lazy' | 'eager';
}) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      className={className}
      src={failed ? '/media/fallback.svg' : place.thumbnailUrl}
      alt={`${place.name} — ${place.imageCredit?.startsWith('Карелия') ? 'фото региона' : 'превью'}`}
      loading={loading}
      onError={() => setFailed(true)}
    />
  );
}
