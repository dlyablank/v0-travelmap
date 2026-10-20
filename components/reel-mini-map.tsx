'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Place } from '@/lib/types';
type Shapes = { land: GeoJSON.FeatureCollection; lakes: GeoJSON.FeatureCollection };
let shapes: Promise<Shapes> | null = null;
const mercator = (lat: number) =>
  (-Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)) * 180) /
  Math.PI;

export function ReelMiniMap({
  places,
  current,
  onOpen,
}: {
  places: Place[];
  current: Place;
  onOpen: () => void;
}) {
  const [geography, setGeography] = useState<Shapes | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!shapes)
      shapes = Promise.all(
        ['/land.geojson', '/lakes.geojson'].map((url) =>
          fetch(url).then((r) => {
            if (!r.ok) throw new Error('Map unavailable');
            return r.json();
          }),
        ),
      )
        .then(([land, lakes]) => ({ land, lakes }))
        .catch((error) => {
          shapes = null;
          throw error;
        });
    shapes
      .then((data) => {
        if (!cancelled) setGeography(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const drawing = useMemo(() => {
    const points = [...places, current];
    const xs = points.map((p) => p.longitude),
      ys = points.map((p) => mercator(p.latitude));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
      cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const scale = Math.min(
      225 / Math.max(0.3, Math.max(...xs) - Math.min(...xs)),
      102 / Math.max(0.3, Math.max(...ys) - Math.min(...ys)),
    );
    const project = (lng: number, lat: number) => [
      130 + (lng - cx) * scale,
      70 + (mercator(lat) - cy) * scale,
    ];
    function paths(collection?: GeoJSON.FeatureCollection) {
      return (
        collection?.features.flatMap((feature) => {
          const geometry = feature.geometry;
          const polygons =
            geometry.type === 'Polygon'
              ? [geometry.coordinates]
              : geometry.type === 'MultiPolygon'
                ? geometry.coordinates
                : [];
          return polygons.map((polygon) =>
            polygon
              .map(
                (ring) =>
                  ring
                    .filter((_, i) => i % 3 === 0 || i === ring.length - 1)
                    .map(([lng, lat], i) => {
                      const [x, y] = project(lng, lat);
                      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ') + 'Z',
              )
              .join(' '),
          );
        }) || []
      );
    }
    return { project, land: paths(geography?.land), lakes: paths(geography?.lakes) };
  }, [places, current, geography]);
  return (
    <button
      className="reel-mini-map"
      onClick={onOpen}
      aria-label={`Показать ${current.name} на карте`}
    >
      <svg viewBox="0 0 260 140" aria-hidden="true">
        <rect width="260" height="140" fill="#c4dce4" />
        <g fill="#e4eadb" stroke="#a9bcab" strokeWidth=".5" fillRule="evenodd">
          {drawing.land.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g fill="#c4dce4" fillRule="evenodd">
          {drawing.lakes.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {places
          .filter((p) => p.id !== current.id)
          .map((p) => {
            const [cx, cy] = drawing.project(p.longitude, p.latitude);
            return <circle key={p.id} cx={cx} cy={cy} r="3" fill="#667a6c" stroke="white" />;
          })}
        {(() => {
          const [cx, cy] = drawing.project(current.longitude, current.latitude);
          return (
            <g>
              <circle cx={cx} cy={cy} r="12" fill="#eb654833" />
              <circle
                data-testid="mini-map-current"
                data-place-id={current.id}
                cx={cx}
                cy={cy}
                r="5"
                fill="#eb6548"
                stroke="white"
                strokeWidth="2"
              />
            </g>
          );
        })()}
        <text x="7" y="132" fontSize="6" fill="#466254">
          Обзор · © Natural Earth
        </text>
      </svg>
      <span>
        {current.city} <b>На карту ↗</b>
      </span>
    </button>
  );
}
