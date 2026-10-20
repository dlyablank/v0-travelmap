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
import type { ExplorerRegion } from '@/lib/regions';
const localStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    land: { type: 'geojson', data: '/land.geojson' },
    lakes: { type: 'geojson', data: '/lakes.geojson' },
    kolomnaRivers: { type: 'geojson', data: '/kolomna-rivers.geojson' },
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
    {
      id: 'kolomna-rivers',
      type: 'line',
      source: 'kolomnaRivers',
      paint: { 'line-color': '#b1d0d9', 'line-width': 6 },
    },
  ],
};
export default function ExplorerMap({
  region,
  places,
  active,
  onSelect,
  route,
  pickMode,
  onPick,
  onReady,
  previewsVisible = true,
}: {
  region: ExplorerRegion;
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
  const [ready, setReady] = useState<maplibregl.Map | null>(null);
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
    const startingStyle: maplibregl.StyleSpecification = {
      ...localStyle,
      layers: [
        {
          id: 'water',
          type: 'background',
          paint: { 'background-color': region.id === 'karelia' ? '#c4dce4' : '#e3e9d9' },
        },
        ...localStyle.layers.slice(1),
      ],
    };
    try {
      m = new maplibregl.Map({
        container: el.current,
        style: startingStyle,
        center: region.center,
        zoom: region.zoom,
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
        setReady(m);
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
            setReady(null);
            m.setStyle(style);
            m.once('style.load', () => {
              setLocal(false);
              setReady(m);
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
  }, [region]);
  useEffect(() => {
    const current = map.current;
    if (!current || ready !== current) return;
    const m = current;
    const records = new Map<
      string,
      { marker: maplibregl.Marker; preview?: ReturnType<typeof createMapVideoPreview> }
    >();
    const connectorLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    connectorLayer.classList.add('map-marker-connectors');
    m.getContainer().append(connectorLayer);
    function arrangeNearbyVideos() {
      connectorLayer.replaceChildren();
      if (region.id !== 'kolomna' || m.isMoving()) return;
      const width = m.getContainer().clientWidth,
        height = m.getContainer().clientHeight;
      const occupied: { x: number; y: number }[] = [];
      let needsCompactLayout = false;
      const candidates: [number, number][] = [];
      for (let row = -3; row <= 3; row++)
        for (let col = -3; col <= 3; col++) candidates.push([col * 96, row * 116]);
      candidates.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
      for (const { marker, preview } of records.values()) {
        if (!preview) continue;
        const point = m.project(marker.getLngLat());
        if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) {
          marker.setOffset([0, 0]);
          continue;
        }
        const available = candidates.find(([dx, dy]) => {
          const x = point.x + dx,
            y = point.y + dy;
          return (
            x >= 48 &&
            x <= width - 48 &&
            y >= 160 &&
            y <= height - 75 &&
            occupied.every((other) => Math.abs(x - other.x) >= 94 || Math.abs(y - other.y) >= 114)
          );
        });
        if (!available) needsCompactLayout = true;
        const offset = available || [0, 0];
        marker.setOffset(offset);
        occupied.push({ x: point.x + offset[0], y: point.y + offset[1] });
        if (offset[0] || offset[1]) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', String(point.x));
          line.setAttribute('y1', String(point.y));
          line.setAttribute('x2', String(point.x + offset[0]));
          line.setAttribute('y2', String(point.y + offset[1]));
          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('cx', String(point.x));
          dot.setAttribute('cy', String(point.y));
          dot.setAttribute('r', '3');
          connectorLayer.append(line, dot);
        }
      }
      if (needsCompactLayout) {
        connectorLayer.replaceChildren();
        const visible = [...records.values()].filter(({ marker, preview }) => {
          const p = m.project(marker.getLngLat());
          return preview && p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;
        });
        const columns = Math.max(1, Math.floor((width - 96) / 96) + 1);
        const rows = Math.ceil(visible.length / columns);
        const top = Math.min(190, Math.max(100, height - 75 - (rows - 1) * 116));
        const slots: { x: number; y: number }[] = [];
        for (let row = 0; row < rows; row++)
          for (let col = 0; col < columns; col++)
            slots.push({
              x: 48 + (col * (width - 96)) / Math.max(1, columns - 1),
              y: top + (row * (height - 75 - top)) / Math.max(1, rows - 1),
            });
        for (const { marker } of visible) {
          const p = m.project(marker.getLngLat());
          slots.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
          const slot = slots.shift()!;
          marker.setOffset([slot.x - p.x, slot.y - p.y]);
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', String(p.x));
          line.setAttribute('y1', String(p.y));
          line.setAttribute('x2', String(slot.x));
          line.setAttribute('y2', String(slot.y));
          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('cx', String(p.x));
          dot.setAttribute('cy', String(p.y));
          dot.setAttribute('r', '3');
          connectorLayer.append(line, dot);
        }
      }
    }
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
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
      const playing = new Set(allowed ? candidates.slice(0, 5) : []);
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
      arrangeNearbyVideos();
      syncPreviews();
    }
    function moving() {
      connectorLayer.replaceChildren();
      syncPreviews();
    }
    m.on('movestart', moving);
    m.on('sourcedata', refresh);
    m.on('moveend', refresh);
    m.on('resize', refresh);
    document.addEventListener('visibilitychange', syncPreviews);
    motion.addEventListener('change', syncPreviews);
    connection?.addEventListener('change', syncPreviews);
    const observer = new ResizeObserver(refresh);
    observer.observe(m.getContainer());
    refresh();
    return () => {
      observer.disconnect();
      connectorLayer.remove();
      document.removeEventListener('visibilitychange', syncPreviews);
      motion.removeEventListener('change', syncPreviews);
      connection?.removeEventListener('change', syncPreviews);
      m.off('movestart', moving);
      m.off('resize', refresh);
      m.off('sourcedata', refresh);
      m.off('moveend', refresh);
      records.forEach((r) => {
        r.preview?.stop();
        r.marker.remove();
      });
      records.clear();
    };
  }, [places, ready, active, autoplay, previewsVisible, pickMode, region]);
  useEffect(() => {
    const m = map.current;
    if (!m || ready !== m || framedVideos.current) return;
    framedVideos.current = true;
    const videos = places.filter((p) => p.video);
    if (!videos.length || active || route || pickMode) return;
    const bounds = new maplibregl.LngLatBounds();
    videos.forEach((p) => bounds.extend([p.longitude, p.latitude]));
    m.fitBounds(bounds, {
      padding: { top: 150, bottom: 110, left: 75, right: 75 },
      maxZoom: region.previewZoom,
      duration: 0,
    });
  }, [ready, places, active, route, pickMode, region]);
  useEffect(() => {
    if (active && ready === map.current)
      map.current?.flyTo({
        center: [active.longitude, active.latitude],
        zoom: Math.max(map.current.getZoom(), 9.2),
        speed: 1.2,
        padding: { left: 40, right: 40, top: 50, bottom: 120 },
      });
  }, [active, ready]);
  useEffect(() => {
    const current = map.current;
    if (!current || ready !== current) return;
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
    if (!m || ready !== m || !local) return;
    const labels: [string, number, number][] =
      region.id === 'karelia'
        ? [
            ['ЛАДОЖСКОЕ\nОЗЕРО', 31.25, 61.05],
            ['ОНЕЖСКОЕ\nОЗЕРО', 35.4, 61.65],
            ['Сортавала', 30.68, 61.7],
            ['Петрозаводск', 34.39, 61.79],
          ]
        : [['Коломна', 38.752, 55.103]];
    const list = labels.map(([text, lng, lat]) => {
      const element = document.createElement('div');
      element.className = text.includes('ОЗЕРО') ? 'geography-label lake-name' : 'geography-label';
      element.textContent = text;
      element.setAttribute('aria-hidden', 'true');
      return new maplibregl.Marker({ element }).setLngLat([lng, lat]).addTo(m);
    });
    return () => list.forEach((l) => l.remove());
  }, [ready, local, region]);
  return (
    <div className={`map-wrap ${pickMode ? 'picking' : ''}`} data-region={region.id}>
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
        {region.id === 'karelia' ? 'КАРЕЛИЯ' : 'КОЛОМНА'}, РОССИЯ <span>↗</span>
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
          onClick={() => {
            const bounds = new maplibregl.LngLatBounds();
            places.forEach((p) => bounds.extend([p.longitude, p.latitude]));
            if (places.length)
              map.current?.fitBounds(bounds, { padding: 80, maxZoom: region.previewZoom });
            else map.current?.flyTo({ center: region.center, zoom: region.zoom });
          }}
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
