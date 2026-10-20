export type MapVideoCandidate = { id: string; x: number; y: number; width: number; height: number };
export const mapMarkerSize = {
  video: { width: 60, height: 90 },
  place: { width: 46, height: 64 },
} as const;
export type MapVideoViewport = {
  width: number;
  height: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};
export function videoRect(item: MapVideoCandidate) {
  return {
    left: item.x - item.width / 2,
    right: item.x + item.width / 2,
    top: item.y - item.height / 2,
    bottom: item.y + item.height / 2,
  };
}
export function videosOverlap(a: MapVideoCandidate, b: MapVideoCandidate, gap = 8) {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap
  );
}
// Retain on-screen selections before filling empty slots. Panning never re-ranks survivors.
export function selectMapVideos(
  candidates: MapVideoCandidate[],
  previous: string[],
  viewport: MapVideoViewport,
  target = 5,
) {
  const onScreen = candidates.filter((item) => {
    const rect = videoRect(item);
    return (
      rect.right > 0 && rect.left < viewport.width && rect.bottom > 0 && rect.top < viewport.height
    );
  });
  const visible = onScreen.filter((item) => {
    const rect = videoRect(item);
    return (
      rect.left >= (viewport.left ?? 8) &&
      rect.right <= viewport.width - (viewport.right ?? 8) &&
      rect.top >= (viewport.top ?? 8) &&
      rect.bottom <= viewport.height - (viewport.bottom ?? 8)
    );
  });
  const selected: MapVideoCandidate[] = [];
  for (const id of previous) {
    const item = onScreen.find((candidate) => candidate.id === id);
    if (item && selected.every((other) => !videosOverlap(item, other))) selected.push(item);
    if (selected.length >= target) break;
  }
  if (selected.length >= target) return selected.map((item) => item.id);
  const remaining = visible
    .filter(
      (item) =>
        !selected.some((other) => other.id === item.id) &&
        selected.every((other) => !videosOverlap(item, other)),
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - viewport.width / 2, a.y - viewport.height / 2) -
          Math.hypot(b.x - viewport.width / 2, b.y - viewport.height / 2) ||
        a.id.localeCompare(b.id),
    );
  let best = [...selected],
    iterations = 0;
  function search(index: number, chosen: MapVideoCandidate[]) {
    if (chosen.length > best.length) best = [...chosen];
    if (
      best.length >= target ||
      ++iterations > 15000 ||
      chosen.length + remaining.length - index <= best.length
    )
      return;
    for (let i = index; i < remaining.length; i++) {
      if (++iterations > 15000) break;
      const item = remaining[i];
      if (chosen.every((other) => !videosOverlap(item, other))) search(i + 1, [...chosen, item]);
      if (best.length >= target || iterations > 15000) break;
    }
  }
  search(0, selected);
  return best.map((item) => item.id);
}

// Videos claim space first. Photos and clusters share the same collision budget,
// including their titles and badges, which are contained inside each card.
export function selectMapMarkers(
  candidates: (MapVideoCandidate & { video: boolean })[],
  previous: { videos: string[]; places: string[] },
  viewport: MapVideoViewport,
  activeId?: string,
) {
  const active = candidates.find((item) => item.id === activeId && !item.video);
  const reserved =
    active && selectMapVideos([active], [active.id], viewport, 1).length ? [active] : [];
  const videos = selectMapVideos(
    candidates.filter(
      (item) => item.video && reserved.every((other) => !videosOverlap(item, other)),
    ),
    previous.videos,
    viewport,
  );
  const occupied = [...reserved, ...candidates.filter((item) => videos.includes(item.id))];
  const photos = candidates.filter((item) => !item.video && item.id !== active?.id);
  const order = [...previous.places, ...photos.map((item) => item.id)];
  const places = reserved.map((item) => item.id);
  for (const id of new Set(order)) {
    const item = photos.find((candidate) => candidate.id === id);
    if (!item || occupied.some((other) => videosOverlap(item, other))) continue;
    if (!selectMapVideos([item], previous.places.includes(id) ? [id] : [], viewport, 1).length)
      continue;
    places.push(id);
    occupied.push(item);
  }
  return { videos, places };
}

type GeoVideo = { id: string; longitude: number; latitude: number };
const mercator = (longitude: number, latitude: number) => ({
  x: (longitude + 180) / 360,
  y:
    (1 -
      Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, latitude)) * Math.PI) / 360)) /
        Math.PI) /
    2,
});
// Find an initial view with as many readable, truly anchored previews as possible.
// This runs once, never in response to the user's pan or zoom.
export function mapVideoCamera(
  videos: GeoVideo[],
  viewport: MapVideoViewport,
  initial: { longitude: number; latitude: number; zoom: number },
) {
  const points = videos.slice(0, 30).map((item) => ({
    ...mercator(item.longitude, item.latitude),
    id: item.id,
  }));
  const focusX = ((viewport.left ?? 8) + viewport.width - (viewport.right ?? 8)) / 2;
  const focusY = ((viewport.top ?? 8) + viewport.height - (viewport.bottom ?? 8)) / 2;
  const origin = mercator(initial.longitude, initial.latitude);
  const countAt = (center: { x: number; y: number }, zoom: number) =>
    selectMapVideos(
      points.map((point) => ({
        id: point.id,
        x: (point.x - center.x) * 512 * 2 ** zoom + focusX,
        y: (point.y - center.y) * 512 * 2 ** zoom + focusY,
        ...mapMarkerSize.video,
      })),
      [],
      viewport,
    ).length;
  let best = { center: origin, zoom: initial.zoom, count: countAt(origin, initial.zoom) };
  if (best.count >= Math.min(5, videos.length)) return initial;
  const centers = [origin, ...points];
  for (const point of points) {
    const neighbours = [...points]
      .sort(
        (a, b) =>
          Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y),
      )
      .slice(0, 5);
    centers.push({
      x: neighbours.reduce((sum, p) => sum + p.x, 0) / neighbours.length,
      y: neighbours.reduce((sum, p) => sum + p.y, 0) / neighbours.length,
    });
  }
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      centers.push({ x: (points[i].x + points[j].x) / 2, y: (points[i].y + points[j].y) / 2 });
  for (let zoom = Math.max(4, Math.floor(initial.zoom * 4) / 4); zoom <= 17; zoom += 0.125) {
    for (const center of centers) {
      const count = countAt(center, zoom);
      if (count > best.count) best = { center, zoom, count };
      if (best.count >= Math.min(5, videos.length)) break;
    }
    if (best.count >= Math.min(5, videos.length)) break;
  }
  return {
    longitude: best.center.x * 360 - 180,
    latitude: (Math.atan(Math.sinh(Math.PI * (1 - 2 * best.center.y))) * 180) / Math.PI,
    zoom: best.zoom,
  };
}
