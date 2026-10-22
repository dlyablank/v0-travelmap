'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as MapGLMap, HtmlMarker, Polyline } from '@2gis/mapgl/types';
import { Minus, Plus, LocateFixed, Navigation, Layers, Play, Pause } from 'lucide-react';
import { loadMapGL } from '@/lib/mapgl-loader';
import { clusterMapPlaces, mapBounds } from '@/lib/mapgl-places';
import { addMapMarkerActions, syncMapMarkerTrip } from '@/lib/map-marker-actions';
import { createMapVideoPreview } from '@/lib/map-video-preview';
import { selectMapMarkers, mapMarkerSize } from '@/lib/map-video-layout';
import { inRegion, regionAtCenter } from '@/lib/regions';
import type { ExplorerMapProps } from './explorer-map-types';

type SDK = Awaited<ReturnType<typeof loadMapGL>>;
type MarkerRecord = {
  marker: HtmlMarker;
  element: HTMLElement;
  video: boolean;
  preview?: ReturnType<typeof createMapVideoPreview>;
};
type MapSession = { map: MapGLMap; sdk: SDK };

export default function TwoGisMap(
  props: ExplorerMapProps & {
    apiKey: string;
    onUnavailable: () => void;
  },
) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  const [session, setSession] = useState<MapSession | null>(null);
  const [autoplay, setAutoplay] = useState(true);
  const [legend, setLegend] = useState(false);
  const update = useRef<(() => void) | null>(null);
  const sync = useRef<(() => void) | null>(null);
  const focus = useRef<(() => void) | null>(null);
  const disposeMarkers = useRef<(() => void) | null>(null);
  const disposeRoute = useRef<(() => void) | null>(null);
  const selected = useRef({ videos: [] as string[], places: [] as string[] });
  const framedRegion = useRef<string | null>(null);
  const playback = useRef({
    autoplay,
    active: props.active,
    visible: props.previewsVisible !== false,
    pick: props.pickMode,
  });
  useEffect(() => {
    callbacks.current = props;
  });
  useEffect(() => {
    playback.current = {
      autoplay,
      active: props.active,
      visible: props.previewsVisible !== false,
      pick: props.pickMode,
    };
    sync.current?.();
  }, [autoplay, props.active, props.previewsVisible, props.pickMode, props.tripIds]);
  useEffect(() => {
    update.current?.();
  }, [props.places]);
  useEffect(() => {
    focus.current?.();
  }, [props.region, props.focusRequest]);

  useEffect(() => {
    let disposed = false;
    let map: MapGLMap | undefined;
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    const initial = callbacks.current;
    loadMapGL()
      .then((sdk) => {
        if (disposed || !container.current) return;
        map = new sdk.Map(container.current, {
          key: initial.apiKey,
          center: initial.region.center,
          zoom: initial.region.zoom,
          minZoom: 2,
          maxZoom: 19,
          pitch: 0,
          rotation: 0,
          lang: 'ru',
          zoomControl: false,
          enableTrackResize: true,
          disablePitchByUserInteraction: true,
          disableRotationByUserInteraction: true,
          defaultBackgroundColor: '#e3e9d9',
        });
        const current = map;
        // Keep the SDK copyright control enabled; MapGL renders its own attribution.
        startupTimer = setTimeout(() => {
          if (!disposed) initial.onUnavailable();
        }, 20000);
        current.once('styleload', () => {
          clearTimeout(startupTimer);
          if (!disposed) {
            setSession({ map: current, sdk });
            callbacks.current.onReady?.();
          }
        });
        current.on('styleloaderror', () => {
          if (!disposed) initial.onUnavailable();
        });
        current.on('click', (event) => {
          if (callbacks.current.pickMode)
            callbacks.current.onPick(event.lngLat[1], event.lngLat[0]);
        });
      })
      .catch(() => {
        if (!disposed) initial.onUnavailable();
      });
    return () => {
      disposed = true;
      clearTimeout(startupTimer);
      disposeMarkers.current?.();
      disposeRoute.current?.();
      map?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!session || !container.current) return;
    const { map, sdk } = session;
    const element = container.current;
    const records = new Map<string, MarkerRecord>();
    let clusters = clusterMapPlaces(callbacks.current.places);
    let frame = 0;
    let framing = false;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (
      navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }
    ).connection;

    function syncMarkers() {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) {
        records.forEach((record) => record.preview?.stop());
        return;
      }
      const state = playback.current;
      const candidates = [...records]
        .map(([id, record]) => {
          const [x, y] = map.project(record.marker.getCoordinates());
          return {
            id,
            x,
            y,
            video: record.video,
            ...mapMarkerSize[record.video ? 'video' : 'place'],
          };
        })
        .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y));
      const previous = state.active
        ? {
            ...selected.current,
            videos: [
              state.active.id,
              ...selected.current.videos.filter((id) => id !== state.active!.id),
            ],
          }
        : selected.current;
      selected.current = selectMapMarkers(
        candidates,
        previous,
        {
          width,
          height,
          top: Math.min(130, height / 4),
          bottom: 40,
          left: 12,
          right: 60,
        },
        state.active?.id,
      );
      const visible = new Set([...selected.current.videos, ...selected.current.places]);
      const allowed =
        state.autoplay &&
        state.visible &&
        !state.active &&
        !state.pick &&
        !document.hidden &&
        !motion.matches &&
        !connection?.saveData;
      for (const [id, record] of records) {
        const shown = visible.has(id);
        record.element.style.display = shown ? '' : 'none';
        record.element.dataset.mapMarkerVisible = String(shown);
        record.element.classList.toggle('is-active', state.active?.id === id);
        syncMapMarkerTrip(record.element, callbacks.current.tripIds?.includes(id) || false);
        const root = record.marker.getContent();
        root.style.visibility = shown ? 'visible' : 'hidden';
        root.style.pointerEvents = shown ? 'auto' : 'none';
        record.marker.setZIndex(state.active?.id === id ? 5 : record.video ? 4 : 3);
        if (record.video) {
          record.element.dataset.mapVideoVisible = String(shown);
          if (shown && allowed) record.preview?.start();
          else record.preview?.stop();
        }
      }
    }

    function frameRegion() {
      const { region, places, active, route, pickMode } = callbacks.current;
      const request =
        callbacks.current.focusRequest === undefined
          ? region.id
          : String(callbacks.current.focusRequest);
      if (!element.clientWidth || !element.clientHeight || framedRegion.current === request) return;
      const first = framedRegion.current === null;
      framedRegion.current = request;
      if (active || route || pickMode) return;
      selected.current = { videos: [], places: [] };
      const regionPlaces = places.filter((place) => inRegion(place, region));
      const videos = regionPlaces.filter((place) => place.video);
      const bounds = mapBounds(
        (region.fitToVideos && videos.length ? videos : regionPlaces).map((p) => [
          p.longitude,
          p.latitude,
        ]),
      );
      framing = true;
      const animation = { animate: !first && !motion.matches, duration: 1000 };
      if (bounds) {
        map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 }, { animate: false });
        map.fitBounds(bounds, {
          padding: {
            top: Math.min(130, element.clientHeight / 4) + 45,
            bottom: 85,
            left: 42,
            right: 90,
          },
          maxZoom: region.previewZoom,
          animation,
        });
      } else {
        map.setCenter(region.center, animation);
        map.setZoom(region.zoom, animation);
      }
      framing = false;
    }

    function refresh() {
      if (!element.clientWidth || !element.clientHeight) {
        syncMarkers();
        return;
      }
      frameRegion();
      const bounds = map.getBounds({ skipPadding: true });
      const features = clusters.getClusters(
        [bounds.southWest[0], bounds.southWest[1], bounds.northEast[0], bounds.northEast[1]],
        Math.max(0, Math.floor(map.getStyleZoom())),
      );
      const places = callbacks.current.places;
      const byId = new Map(places.map((p) => [p.id, p]));
      const videos = places
        .filter((p) => p.video)
        .map((p) => ({
          type: 'Feature' as const,
          properties: { id: p.id },
          geometry: { type: 'Point' as const, coordinates: [p.longitude, p.latitude] },
        }));
      const seen = new Set<string>();
      for (const feature of [...features, ...videos]) {
        const properties = feature.properties;
        const cluster = 'cluster' in properties && properties.cluster === true;
        const count = 'point_count' in properties ? Number(properties.point_count) : 0;
        const id = cluster ? `c${properties.cluster_id}` : String(properties.id);
        if (seen.has(id)) continue;
        seen.add(id);
        const coordinates = feature.geometry.coordinates;
        if (records.has(id)) {
          records.get(id)!.marker.setCoordinates(coordinates);
          continue;
        }
        const place = cluster ? undefined : byId.get(id);
        if (!cluster && !place) continue;
        const button = document.createElement(cluster ? 'button' : 'div');
        if (button instanceof HTMLButtonElement) button.type = 'button';
        button.style.display = 'none';
        const video = !!place?.video;
        button.className = cluster
          ? 'map-cluster'
          : `video-marker${video ? ' priority-video' : ''}`;
        const size = mapMarkerSize[video ? 'video' : 'place'];
        button.style.setProperty('--map-marker-width', `${size.width}px`);
        button.style.setProperty('--map-marker-height', `${size.height}px`);
        const sample =
          place ||
          (cluster
            ? byId.get(clusters.getLeaves(Number(properties.cluster_id), 1)[0]?.properties.id)
            : undefined);
        if (sample) {
          const image = document.createElement('img');
          image.src = sample.thumbnailUrl;
          image.alt = '';
          image.onerror = () => {
            image.onerror = null;
            image.src = '/media/fallback.svg';
          };
          button.append(image);
        }
        const badge = document.createElement('span');
        badge.textContent = cluster ? String(properties.point_count) : video ? '▶' : '✦';
        button.append(badge);
        let preview: ReturnType<typeof createMapVideoPreview> | undefined;
        if (place) {
          button.dataset.placeId = place.id;
          button.setAttribute('aria-label', `Показать ${place.name}`);
          const name = document.createElement('b');
          name.textContent = place.name;
          button.append(name);
          addMapMarkerActions(button, place, () => callbacks.current.onTripToggle?.(place.id));
          if (place.video?.playbackUrl) {
            button.classList.add('has-video');
            preview = createMapVideoPreview(
              button,
              place.video.previewUrl || place.video.playbackUrl,
            );
          }
        } else button.setAttribute('aria-label', `Приблизить ${count} мест`);
        button.onclick = (event) => {
          event.stopPropagation();
          if (cluster) {
            map.setCenter(coordinates, { duration: 500, animate: !motion.matches });
            map.setZoom(clusters.getClusterExpansionZoom(Number(properties.cluster_id)) + 0.2, {
              duration: 500,
              animate: !motion.matches,
            });
          } else if (place) {
            if (callbacks.current.pickMode)
              callbacks.current.onPick(place.latitude, place.longitude);
            else callbacks.current.onSelect(place);
          }
        };
        const marker = new sdk.HtmlMarker(map, {
          coordinates,
          html: button,
          anchor: [size.width / 2, size.height / 2],
          interactive: true,
          preventMapInteractions: true,
          disableRounding: true,
          labeling: { type: 'none' },
        });
        marker.getContent().classList.add('mapgl-place-marker');
        records.set(id, { marker, element: button, video, preview });
      }
      for (const [id, record] of records)
        if (!seen.has(id)) {
          record.preview?.stop();
          record.marker.destroy();
          records.delete(id);
        }
      syncMarkers();
    }
    function moving() {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          syncMarkers();
        });
    }
    function settled() {
      const wasFraming = framing;
      refresh();
      if (!wasFraming) {
        const center = map.getCenter();
        const next = regionAtCenter([center[0], center[1]], callbacks.current.region.id);
        if (next.id !== callbacks.current.region.id) callbacks.current.onRegionChange?.(next.id);
      }
      const state = playback.current;
      if (selected.current.videos.length < 5 && state.visible && !state.active && !state.pick)
        callbacks.current.onNeedVideos?.();
    }
    function updatePlaces() {
      clusters = clusterMapPlaces(callbacks.current.places);
      // Cluster IDs belong to an index revision; individual player DOM stays intact.
      for (const [id, record] of records)
        if (id.startsWith('c') && !record.element.dataset.placeId) {
          record.marker.destroy();
          records.delete(id);
        }
      refresh();
    }
    function resize() {
      if (element.clientWidth && element.clientHeight) map.invalidateSize();
      refresh();
    }
    update.current = updatePlaces;
    focus.current = refresh;
    sync.current = syncMarkers;
    map.on('move', moving);
    map.on('moveend', settled);
    document.addEventListener('visibilitychange', syncMarkers);
    motion.addEventListener('change', syncMarkers);
    connection?.addEventListener('change', syncMarkers);
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    refresh();
    let disposed = false;
    function cleanup() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      if (update.current === updatePlaces) update.current = null;
      if (focus.current === refresh) focus.current = null;
      if (sync.current === syncMarkers) sync.current = null;
      map.off('move', moving);
      map.off('moveend', settled);
      document.removeEventListener('visibilitychange', syncMarkers);
      motion.removeEventListener('change', syncMarkers);
      connection?.removeEventListener('change', syncMarkers);
      records.forEach((record) => {
        record.preview?.stop();
        record.marker.destroy();
      });
      records.clear();
      if (disposeMarkers.current === cleanup) disposeMarkers.current = null;
    }
    disposeMarkers.current = cleanup;
    return cleanup;
  }, [session]);

  useEffect(() => {
    if (!session || !props.active) return;
    const { map } = session;
    const animation = {
      animate: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      duration: 800,
    };
    map.setPadding({ top: 50, bottom: 120, left: 40, right: 40 }, animation);
    map.setCenter([props.active.longitude, props.active.latitude], animation);
    map.setZoom(Math.max(map.getZoom(), 9.2), animation);
  }, [props.active, session]);

  useEffect(() => {
    if (!session || !props.route?.coordinates.length) return;
    const { map, sdk } = session;
    const route = props.route;
    const lines: Polyline[] = [];
    if (route.coordinates.length > 1)
      lines.push(
        new sdk.Polyline(map, {
          coordinates: route.coordinates,
          width: 4,
          color: '#f06445',
          interactive: false,
          ...(route.source === 'straight' ? { dashLength: 8, gapLength: 8 } : {}),
        }),
      );
    const bounds = mapBounds(route.coordinates);
    if (bounds)
      map.fitBounds(bounds, {
        padding: { top: 130, bottom: 130, left: 60, right: 60 },
        maxZoom: 11,
        animation: {
          duration: 800,
          animate: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        },
      });
    let disposed = false;
    function cleanup() {
      if (disposed) return;
      disposed = true;
      lines.forEach((line) => line.destroy());
      if (disposeRoute.current === cleanup) disposeRoute.current = null;
    }
    disposeRoute.current = cleanup;
    return cleanup;
  }, [props.route, session]);

  return (
    <div
      className={`map-wrap ${props.pickMode ? 'picking' : ''}`}
      data-region={props.region.id}
      data-map-provider="2gis"
    >
      <div ref={container} className="map-canvas" data-testid="map" />
      <button
        className="map-video-toggle"
        aria-label="Видео на карте"
        aria-pressed={autoplay}
        onClick={() => setAutoplay(!autoplay)}
      >
        {autoplay ? <Pause size={14} /> : <Play size={14} />} <span>Видео на карте</span>
      </button>
      <div className="overview-label">2ГИС{!session ? ' · загрузка…' : ''}</div>
      <div className="map-region">
        <span className="live-dot" />
        {props.region.name.toUpperCase()}, РОССИЯ <span>↗</span>
      </div>
      <div className="map-controls">
        <button
          aria-label="Увеличить масштаб"
          onClick={() => session?.map.setZoom(session.map.getZoom() + 1)}
        >
          <Plus size={20} />
        </button>
        <button
          aria-label="Уменьшить масштаб"
          onClick={() => session?.map.setZoom(session.map.getZoom() - 1)}
        >
          <Minus size={20} />
        </button>
        <i />
        <button
          aria-label="Показать все места"
          title="Показать все места на карте"
          onClick={() => {
            if (!session) return;
            const bounds = mapBounds(props.places.map((p) => [p.longitude, p.latitude]));
            if (bounds)
              session.map.fitBounds(bounds, {
                padding: {
                  top: Math.min(130, session.map.getSize()[1] / 4) + 45,
                  bottom: 85,
                  left: 42,
                  right: 90,
                },
                skipMapPadding: true,
                maxZoom: 12.5,
                animation: {
                  duration: 1000,
                  animate: !matchMedia('(prefers-reduced-motion: reduce)').matches,
                },
              });
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
          Карта и картографические данные — 2ГИС.
          <br />
          Миниатюры показывают места. Пунктир маршрута — расстояние по прямой.
        </div>
      )}
      <div className="map-bottom">
        <Navigation size={14} />
        <span>Хорошие выходные ближе, чем кажется</span>
      </div>
      {props.pickMode && (
        <div className="pick-hint">Нажмите на карте, чтобы выбрать место для видео</div>
      )}
    </div>
  );
}
