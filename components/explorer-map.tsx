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
import { selectMapMarkers, mapVideoCamera, mapMarkerSize } from '@/lib/map-video-layout';
import type { Place, RouteResult } from '@/lib/types';
import { inRegion, type ExplorerRegion } from '@/lib/regions';
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
  onNeedVideos,
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
  onNeedVideos?: () => void;
  previewsVisible?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const initialRegion = useRef(region);
  const framedRegion = useRef<string | null>(null);
  const focusRegion = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState<maplibregl.Map | null>(null);
  const [mapCreated, setMapCreated] = useState<maplibregl.Map | null>(null);
  const [local, setLocal] = useState(true);
  const [error, setError] = useState('');
  const [legend, setLegend] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const selectedVideos = useRef<string[]>([]);
  const updatePlaces = useRef<(() => void) | null>(null);
  const syncVideoState = useRef<(() => void) | null>(null);
  const playbackState = useRef({ active, autoplay, previewsVisible, pickMode, route });
  useEffect(() => {
    playbackState.current = { active, autoplay, previewsVisible, pickMode, route };
    syncVideoState.current?.();
  }, [active, autoplay, previewsVisible, pickMode, route]);
  const callbacks = useRef({ onSelect, onPick, pickMode, places, region, onReady, onNeedVideos });
  useEffect(() => {
    callbacks.current = { onSelect, onPick, pickMode, places, region, onReady, onNeedVideos };
  }, [onSelect, onPick, pickMode, places, region, onReady, onNeedVideos]);
  useEffect(() => {
    updatePlaces.current?.();
  }, [places]);
  useEffect(() => {
    focusRegion.current?.();
  }, [region]);
  useEffect(() => {
    if (!el.current) return;
    const region = initialRegion.current;
    let destroyed = false;
    let m: maplibregl.Map;
    const startingStyle: maplibregl.StyleSpecification = {
      ...localStyle,
      layers: [
        {
          id: 'water',
          type: 'background',
          paint: { 'background-color': '#c4dce4' },
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
        minZoom: 2,
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
        setMapCreated(m);
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
            m.once('style.load', () => {
              setLocal(false);
              setReady(m);
            });
            m.setStyle(style);
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
    if (!current || mapCreated !== current) return;
    const m = current;
    const records = new Map<
      string,
      { marker: maplibregl.Marker; preview?: ReturnType<typeof createMapVideoPreview> }
    >();
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (
      navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }
    ).connection;
    let selectedPlaces: string[] = [];
    function syncPreviews() {
      const bounds = m.getContainer().getBoundingClientRect();
      if (!bounds.width || !bounds.height) {
        records.forEach((record) => record.preview?.stop());
        return;
      }
      const state = playbackState.current;
      const candidates = [...records.entries()].map(([id, record]) => {
        const point = m.project(record.marker.getLngLat());
        const element = record.marker.getElement();
        const video = element.classList.contains('priority-video');
        return {
          id,
          x: point.x,
          y: point.y,
          video,
          ...mapMarkerSize[video ? 'video' : 'place'],
        };
      });
      const previous = state.active
        ? [state.active.id, ...selectedVideos.current.filter((id) => id !== state.active!.id)]
        : selectedVideos.current;
      const selection = selectMapMarkers(
        candidates,
        { videos: previous, places: selectedPlaces },
        {
          width: bounds.width,
          height: bounds.height,
          top: Math.min(130, bounds.height / 4),
          bottom: 40,
          left: 12,
          right: 60,
        },
        state.active?.id,
      );
      const selected = selection.videos;
      selectedVideos.current = selected;
      selectedPlaces = selection.places;
      const visible = new Set([...selected, ...selectedPlaces]);
      const allowed =
        state.autoplay &&
        state.previewsVisible &&
        !state.active &&
        !state.pickMode &&
        !document.hidden &&
        !motion.matches &&
        !connection?.saveData &&
        bounds.width > 0 &&
        bounds.height > 0;
      for (const [id, record] of records) {
        const element = record.marker.getElement();
        element.classList.toggle('is-active', state.active?.id === id);
        element.style.display = visible.has(id) ? '' : 'none';
        element.dataset.mapMarkerVisible = String(visible.has(id));
        if (element.classList.contains('priority-video')) {
          element.dataset.mapVideoVisible = String(visible.has(id));
          if (!visible.has(id) || !allowed) record.preview?.stop();
        }
      }
      for (const id of selected) if (allowed) records.get(id)?.preview?.start();
      // Fallback geography labels must not cover cards or each other either.
      const occupied = [...records.values()]
        .map((record) => record.marker.getElement())
        .filter((element) => element.dataset.mapMarkerVisible === 'true')
        .map((element) => element.getBoundingClientRect());
      m.getContainer()
        .querySelectorAll<HTMLElement>('.geography-label')
        .forEach((label) => {
          const rect = label.getBoundingClientRect();
          const overlaps = occupied.some(
            (other) =>
              rect.left < other.right + 8 &&
              rect.right > other.left - 8 &&
              rect.top < other.bottom + 8 &&
              rect.bottom > other.top - 8,
          );
          label.style.visibility = overlaps ? 'hidden' : '';
          if (!overlaps) occupied.push(rect);
        });
    }
    syncVideoState.current = syncPreviews;
    const sourceId = 'places';
    const placeFeature = (p: Place): GeoJSON.Feature<GeoJSON.Point> => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.longitude, p.latitude] },
      properties: { id: p.id },
    });
    function updateData(force = false) {
      const features = callbacks.current.places.filter((p) => !p.video).map(placeFeature);
      if (m.getSource(sourceId))
        (m.getSource(sourceId) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
      else {
        if (!force && !m.isStyleLoaded()) return;
        m.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
          cluster: true,
          clusterRadius: 48,
          clusterMaxZoom: 8,
        });
      }
      if (!m.getLayer('place-probe'))
        m.addLayer({
          id: 'place-probe',
          type: 'circle',
          source: sourceId,
          paint: { 'circle-radius': 0, 'circle-opacity': 0 },
        });
      refresh();
    }
    function styleLoaded() {
      updateData(true);
    }
    updatePlaces.current = updateData;
    function refresh() {
      if (!m.getSource(sourceId) || !m.isSourceLoaded(sourceId)) return;
      const places = callbacks.current.places;
      const videoFeatures = places.filter((p) => p.video).map(placeFeature);
      const width = m.getContainer().clientWidth,
        height = m.getContainer().clientHeight;
      const region = callbacks.current.region;
      if (framedRegion.current !== region.id && width > 0 && height > 0) {
        const firstFrame = framedRegion.current === null;
        framedRegion.current = region.id;
        const state = playbackState.current;
        const videos = places.filter((p) => p.video && inRegion(p, region));
        if (!state.active && !state.route && !state.pickMode) {
          const padding = { top: Math.min(130, height / 4), bottom: 40, left: 12, right: 60 };
          let view = { center: region.center, zoom: region.zoom, padding };
          if (videos.length) {
            const bounds = new maplibregl.LngLatBounds();
            videos.forEach((p) => bounds.extend([p.longitude, p.latitude]));
            const initial = m.cameraForBounds(bounds, { padding, maxZoom: region.previewZoom });
            if (initial?.center && initial.zoom !== undefined) {
              const center = maplibregl.LngLat.convert(initial.center);
              const camera = mapVideoCamera(
                videos,
                { width, height, ...padding },
                { longitude: center.lng, latitude: center.lat, zoom: initial.zoom },
              );
              view = { center: [camera.longitude, camera.latitude], zoom: camera.zoom, padding };
            }
          }
          selectedVideos.current = [];
          if (firstFrame) m.jumpTo(view);
          else m.flyTo({ ...view, duration: 1000 });
        }
      }
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
          btn.className = `video-marker ${playbackState.current.active?.id === p.id ? 'is-active' : ''}`;
          if (p.video) btn.classList.add('priority-video');
          btn.setAttribute('aria-label', `Показать ${p.name}`);
          btn.dataset.placeId = p.id;
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
        const size = mapMarkerSize[btn.classList.contains('priority-video') ? 'video' : 'place'];
        btn.style.setProperty('--map-marker-width', `${size.width}px`);
        btn.style.setProperty('--map-marker-height', `${size.height}px`);
        const marker = new maplibregl.Marker({
          element: btn,
          anchor: 'center',
        })
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
    focusRegion.current = refresh;
    let frame = 0;
    function moving() {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          syncPreviews();
        });
    }
    m.on('move', moving);
    m.on('style.load', styleLoaded);
    m.on('sourcedata', refresh);
    function settled() {
      refresh();
      const state = playbackState.current;
      if (
        selectedVideos.current.length < 5 &&
        state.previewsVisible &&
        !state.active &&
        !state.pickMode
      )
        callbacks.current.onNeedVideos?.();
    }
    m.on('moveend', settled);
    m.on('resize', refresh);
    document.addEventListener('visibilitychange', syncPreviews);
    motion.addEventListener('change', syncPreviews);
    connection?.addEventListener('change', syncPreviews);
    const observer = new ResizeObserver(refresh);
    observer.observe(m.getContainer());
    updateData();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      if (syncVideoState.current === syncPreviews) syncVideoState.current = null;
      if (updatePlaces.current === updateData) updatePlaces.current = null;
      if (focusRegion.current === refresh) focusRegion.current = null;
      document.removeEventListener('visibilitychange', syncPreviews);
      motion.removeEventListener('change', syncPreviews);
      connection?.removeEventListener('change', syncPreviews);
      m.off('move', moving);
      m.off('style.load', styleLoaded);
      m.off('resize', refresh);
      m.off('sourcedata', refresh);
      m.off('moveend', settled);
      records.forEach((r) => {
        r.preview?.stop();
        r.marker.remove();
      });
      records.clear();
    };
  }, [mapCreated]);
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
    const labels: [string, number, number][] = [
      ['ЛАДОЖСКОЕ\nОЗЕРО', 31.25, 61.05],
      ['ОНЕЖСКОЕ\nОЗЕРО', 35.4, 61.65],
      ['Сортавала', 30.68, 61.7],
      ['Петрозаводск', 34.39, 61.79],
      ['Коломна', 38.752, 55.103],
    ];
    const list = labels.map(([text, lng, lat]) => {
      const element = document.createElement('div');
      element.className = text.includes('ОЗЕРО') ? 'geography-label lake-name' : 'geography-label';
      element.textContent = text;
      element.setAttribute('aria-hidden', 'true');
      return new maplibregl.Marker({ element }).setLngLat([lng, lat]).addTo(m);
    });
    syncVideoState.current?.();
    return () => list.forEach((l) => l.remove());
  }, [ready, local]);
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
          aria-label="Показать все места"
          title="Показать все места на карте"
          onClick={() => {
            const bounds = new maplibregl.LngLatBounds();
            places.forEach((p) => bounds.extend([p.longitude, p.latitude]));
            if (places.length && map.current) {
              const height = map.current.getContainer().clientHeight;
              map.current.fitBounds(bounds, {
                padding: { top: Math.min(130, height / 4) + 45, bottom: 85, left: 42, right: 90 },
                maxZoom: 12.5,
                duration: 1000,
              });
            } else map.current?.flyTo({ center: region.center, zoom: region.zoom });
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
