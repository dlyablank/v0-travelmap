'use client';
import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import type { ExplorerMapProps } from './explorer-map-types';

const loading = () => <div className="map-loading">Загружаем карту…</div>;
const OverviewMap = dynamic(() => import('./explorer-map-overview'), { ssr: false, loading });
const TwoGisMap = dynamic(() => import('./explorer-map-2gis'), { ssr: false, loading });

export default function ExplorerMap(props: ExplorerMapProps) {
  const key = process.env.NEXT_PUBLIC_DGIS_MAP_KEY?.trim();
  const [unavailable, setUnavailable] = useState(false);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  if (key && !unavailable)
    return <TwoGisMap {...props} apiKey={key} onUnavailable={onUnavailable} />;
  return (
    <>
      <OverviewMap {...props} />
      {unavailable && (
        <div role="status" className="map-error">
          Подробная карта временно недоступна. Показываем обзорную.
        </div>
      )}
    </>
  );
}
