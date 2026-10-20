'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Minus,
  Plus,
  LocateFixed,
  Navigation,
  Layers,
  Map as MapIcon,
  Play,
  Pause,
} from 'lucide-react';
import { createMapVideoPreview } from '@/lib/map-video-preview';
import type { Place, RouteResult } from '@/lib/types';
const localStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    land: { type: 'geojson', data: '/land.geojson' },
    lakes: { type: 'geojson', data: '/lakes.geojson' },
  },
  layers: [
    { id: 'water', type: 'background', paint: { 'background-color': '#c4dce4' } },
    {
      id: 'land',
      type: 'fill',
      source: 'land',
      paint: { 'fill-color': '#e3e9d9', 'fill-outline-color': '#b4c9ba' },
    },
    {
      id: 'lakes',
      type: 'fill',
      source: 'lakes',
      paint: { 'fill-color': '#c4dce4', 'fill-outline-color': '#b1d0d9' },
    },
  ],
};
export default function ExplorerMap({
  places,
  active,
  onSelect,
  route,
  pickMode,
  onPick,
  onReady,
  previewsVisible = true,
}: {
  places: Place[];
  active: Place | null;
  onSelect: (p: Place) => void;
  route: RouteResult | null;
  pickMode: boolean;
  onPick: (lat: number, lng: number) => void;
  onReady?: () => void;
  previewsVisible?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const framedVideos = useRef(false);
  const [ready, setReady] = useState(false);
  const [local, setLocal] = useState(true);
  const [error, setError] = useState('');
  const [legend, setLegend] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const callbacks = useRef({ onSelect, onPick, pickMode, places, onReady });
  useEffect(() => {
    callbacks.current = { onSelect, onPick, pickMode, places, onReady };
  }, [onSelect, onPick, pickMode, places, onReady]);
  useEffect(() => {
    if (!el.current) return;
    let destroyed = false;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: el.current,
        style: localStyle,
        center: [32.1, 61.94],
        zoom: 6.5,
        minZoom: 4,
        maxZoom: 17,
        attributionControl: { compact: true },
      });
      map.current = m;
      const observer = new ResizeObserver(() => {
        if (el.current?.clientHeight) m.resize();
      });
      observer.observe(el.current!);
      m.on('remove', () => observer.disconnect());
      m.addControl(
        new maplibregl.AttributionControl({
          customAttribution: '© OpenStreetMap contributors · Natural Earth',
        }),
      );
      m.on('load', () => {
        if (destroyed) return;
        setReady(true);
        callbacks.current.onReady?.();
      });
      m.on('click', (e) => {
        if (callbacks.current.pickMode) callbacks.current.onPick(e.lngLat.lat, e.lngLat.lng);
      });
      m.on('error', () => {
        if (!destroyed) setError('Часть карты не загрузилась. Места и поездка доступны.');
      });
      fetch('https://tiles.openfreemap.org/styles/positron', { signal: AbortSignal.timeout(8000) })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((style) => {
          if (!destroyed) {
            setReady(false);
            m.setStyle(style);
            m.once('style.load', () => {
              setLocal(false);
              setReady(true);
            });
          }
        })
        .catch(() => {});
    } catch {
      queueMicrotask(() => {
        if (!destroyed) setError('Браузер не поддерживает WebGL. Используйте ленту мест.');
      });
    }
    return () => {
      destroyed = true;
      markers.current.forEach((v) => v.remove());
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const current = map.current;
    if (!current || !ready) return;
    const m = current;
    const records = new Map<
      string,
      { marker: maplibregl.Marker; preview?: ReturnType<typeof createMapVideoPreview> }
    >();
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = matchMedia('(max-width: 767px)');
    const connection = (
      navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }
    ).connection;
    function syncPreviews() {
      const bounds = m.getContainer().getBoundingClientRect();
      const allowed =
        autoplay &&
        previewsVisible &&
        !active &&
        !pickMode &&
        !document.hidden &&
        !motion.matches &&
        !connection?.saveData &&
        bounds.width > 0 &&
        bounds.height > 0 &&
        !m.isMoving();
      const candidates = [...records.values()]
        .filter(({ marker, preview }) => {
          const p = m.project(marker.getLngLat());
          return preview && p.x >= 0 && p.x <= bounds.width && p.y >= 0 && p.y <= bounds.height;
        })
        .sort((a, b) => {
          const center = m.getCenter();
          return a.marker.getLngLat().distanceTo(center) - b.marker.getLngLat().distanceTo(center);
        });
      const playing = new Set(allowed ? candidates.slice(0, mobile.matches ? 1 : 3) : []);
      // Stop old decoders before starting new ones.
      for (const record of records.values()) if (!playing.has(record)) record.preview?.stop();
      for (const record of playing) record.preview?.start();
    }
    const sourceId = 'places';
    const placeFeature = (p: Place): GeoJSON.Feature<GeoJSON.Point> => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.longitude, p.latitude] },
      properties: { id: p.id },
    });
    // Videos stay directly selectable at every zoom. Only photo places cluster.
    const videoFeatures = places.filter((p) => p.video).map(placeFeature);
    const features = places.filter((p) => !p.video).map(placeFeature);
    if (m.getSource(sourceId))
      (m.getSource(sourceId) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    else
      m.addSource(sourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        cluster: true,
        clusterRadius: 48,
        clusterMaxZoom: 8,
      });
    if (!m.getLayer('place-probe'))
      m.addLayer({
        id: 'place-probe',
        type: 'circle',
        source: sourceId,
        paint: { 'circle-radius': 0, 'circle-opacity': 0 },
      });
    function refresh() {
      if (!m.isSourceLoaded(sourceId)) return;
      const seen = new Set<string>();
      for (const f of [...m.querySourceFeatures(sourceId), ...videoFeatures]) {
        if (f.geometry.type !== 'Point') continue;
        const props = f.properties!;
        const key = props.cluster ? `c${props.cluster_id}` : String(props.id);
        if (seen.has(key)) continue;
        seen.add(key);
        const coords = f.geometry.coordinates as [number, number];
        if (records.has(key)) {
          records.get(key)!.marker.setLngLat(coords);
          continue;
        }
        const btn = document.createElement('button');
        let preview: ReturnType<typeof createMapVideoPreview> | undefined;
        if (props.cluster) {
          btn.className = 'map-cluster';
          btn.setAttribute('aria-label', `Приблизить ${props.point_count} мест`);
          const photoPlaces = places.filter((p) => !p.video);
          const sample =
            photoPlaces.find((p) => Math.abs(p.longitude - coords[0]) < 2) || photoPlaces[0];
          if (sample) {
            const img = document.createElement('img');
            img.src = sample.thumbnailUrl;
            img.alt = '';
            img.onerror = () => {
              img.src = '/media/fallback.svg';
              img.onerror = null;
            };
            btn.append(img);
          }
          const badge = document.createElement('span');
          badge.textContent = `${props.point_count}`;
          btn.append(badge);
          btn.onclick = () => {
            (m.getSource(sourceId) as GeoJSONSource)
              .getClusterExpansionZoom(props.cluster_id)
              .then((z) => m.easeTo({ center: coords, zoom: z + 0.2 }));
          };
        } else {
          const p = places.find((p) => p.id === props.id);
          if (!p) continue;
          btn.className = `video-marker ${active?.id === p.id ? 'is-active' : ''}`;
          if (p.video) btn.classList.add('priority-video');
          btn.setAttribute('aria-label', `Показать ${p.name}`);
          const img = document.createElement('img');
          img.src = p.thumbnailUrl;
          img.alt = '';
          img.onerror = () => {
            img.src = '/media/fallback.svg';
            img.onerror = null;
          };
          btn.append(img);
          const badge = document.createElement('span');
          badge.textContent = p.video ? '▶' : '✦';
          btn.append(badge);
          const name = document.createElement('b');
          name.textContent = p.name;
          btn.append(name);
          if (p.video?.playbackUrl) {
            btn.classList.add('has-video');
            preview = createMapVideoPreview(btn, p.video.previewUrl || p.video.playbackUrl);
          }
          btn.onclick = (e) => {
            e.stopPropagation();
            if (callbacks.current.pickMode) callbacks.current.onPick(p.latitude, p.longitude);
            else callbacks.current.onSelect(p);
          };
        }
        const marker = new maplibregl.Marker({ element: btn, anchor: 'bottom' })
          .setLngLat(coords)
          .addTo(m);
        records.set(key, { marker, preview });
      }
      for (const [key, record] of records)
        if (!seen.has(key)) {
          record.preview?.stop();
          record.marker.remove();
          records.delete(key);
        }
      markers.current = [...records.values()].map((r) => r.marker);
      syncPreviews();
    }
    m.on('movestart', syncPreviews);
    m.on('sourcedata', refresh);
    m.on('moveend', refresh);
    m.on('resize', syncPreviews);
    document.addEventListener('visibilitychange', syncPreviews);
    motion.addEventListener('change', syncPreviews);
    mobile.addEventListener('change', syncPreviews);
    connection?.addEventListener('change', syncPreviews);
    const observer = new ResizeObserver(syncPreviews);
    observer.observe(m.getContainer());
    refresh();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncPreviews);
      motion.removeEventListener('change', syncPreviews);
      mobile.removeEventListener('change', syncPreviews);
      connection?.removeEventListener('change', syncPreviews);
      m.off('movestart', syncPreviews);
      m.off('resize', syncPreviews);
      m.off('sourcedata', refresh);
      m.off('moveend', refresh);
      records.forEach((r) => {
        r.preview?.stop();
        r.marker.remove();
      });
      records.clear();
    };
  }, [places, ready, active, autoplay, previewsVisible, pickMode]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || framedVideos.current) return;
    framedVideos.current = true;
    const videos = places.filter((p) => p.video);
    if (!videos.length || active || route || pickMode) return;
    const bounds = new maplibregl.LngLatBounds();
    videos.forEach((p) => bounds.extend([p.longitude, p.latitude]));
    m.fitBounds(bounds, {
      padding: { top: 150, bottom: 110, left: 75, right: 75 },
      maxZoom: 7.5,
      duration: 0,
    });
  }, [ready, places, active, route, pickMode]);
  useEffect(() => {
    if (active && ready)
      map.current?.flyTo({
        center: [active.longitude, active.latitude],
        zoom: Math.max(map.current.getZoom(), 9.2),
        speed: 1.2,
        padding: { left: 40, right: 40, top: 50, bottom: 120 },
      });
  }, [active, ready]);
  useEffect(() => {
    const current = map.current;
    if (!current || !ready) return;
    const m = current;
    const data: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: route?.coordinates || [] },
      properties: {},
    };
    if (m.getSource('route')) (m.getSource('route') as GeoJSONSource).setData(data);
    else {
      m.addSource('route', { type: 'geojson', data });
      m.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#f06445',
          'line-width': 4,
          'line-dasharray': route?.source === 'straight' ? [2, 2] : [1, 0],
        },
      });
    }
    if (m.getLayer('route-line'))
      m.setPaintProperty(
        'route-line',
        'line-dasharray',
        route?.source === 'straight' ? [2, 2] : [1, 0],
      );
    if (route?.coordinates.length) {
      const bounds = new maplibregl.LngLatBounds();
      route.coordinates.forEach((c) => bounds.extend(c));
      m.fitBounds(bounds, { padding: 100, maxZoom: 11 });
    }
  }, [route, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !local) return;
    const labels: [string, number, number][] = [
      ['ЛАДОЖСКОЕ\nОЗЕРО', 31.25, 61.05],
      ['ОНЕЖСКОЕ\nОЗЕРО', 35.4, 61.65],
      ['Сортавала', 30.68, 61.7],
      ['Петрозаводск', 34.39, 61.79],
    ];
    const list = labels.map(([text, lng, lat]) => {
      const element = document.createElement('div');
      element.className = text.includes('ОЗЕРО') ? 'geography-label lake-name' : 'geography-label';
      element.textContent = text;
      element.setAttribute('aria-hidden', 'true');
      return new maplibregl.Marker({ element }).setLngLat([lng, lat]).addTo(m);
    });
    return () => list.forEach((l) => l.remove());
  }, [ready, local]);
  return (
    <div className={`map-wrap ${pickMode ? 'picking' : ''}`}>
      <div ref={el} className="map-canvas" data-testid="map" />
      <button
        className="map-video-toggle"
        aria-pressed={autoplay}
        onClick={() => setAutoplay(!autoplay)}
      >
        {autoplay ? <Pause size={14} /> : <Play size={14} />}
        Видео на карте
      </button>
      {local && (
        <div className="overview-label">
          <MapIcon size={13} /> Обзорная карта{!ready ? ' · загрузка…' : ''}
        </div>
      )}
      <div className="map-region">
        <span className="live-dot" />
        КАРЕЛИЯ, РОССИЯ <span>↗</span>
      </div>
      <div className="map-controls">
        <button aria-label="Увеличить масштаб" onClick={() => map.current?.zoomIn()}>
          <Plus size={20} />
        </button>
        <button aria-label="Уменьшить масштаб" onClick={() => map.current?.zoomOut()}>
          <Minus size={20} />
        </button>
        <i />
        <button
          aria-label="Показать весь регион"
          onClick={() => map.current?.flyTo({ center: [32.1, 61.94], zoom: 6.5 })}
        >
          <LocateFixed size={19} />
        </button>
      </div>
      <button
        className="map-layers"
        aria-label="Источники карты"
        onClick={() => setLegend(!legend)}
      >
        <Layers size={18} />
      </button>
      {legend && (
        <div className="map-legend">
          {local
            ? 'Локальная обзорная карта Natural Earth. Для дорожных деталей нужен доступ к tiles.openfreemap.org.'
            : 'OpenFreeMap · данные OpenStreetMap.'}
          <br />
          Миниатюры показывают места. Пунктир маршрута — расстояние по прямой.
        </div>
      )}
      <div className="map-bottom">
        <Navigation size={14} />
        <span>Хорошие выходные ближе, чем кажется</span>
      </div>
      {error && (
        <div role="status" className="map-error">
          {error}
        </div>
      )}
      {pickMode && <div className="pick-hint">Нажмите на карте, чтобы выбрать место для видео</div>}
    </div>
  );
}
