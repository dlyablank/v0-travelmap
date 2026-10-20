import { describe, expect, it } from 'vitest';
import { selectMapVideos, videosOverlap, mapVideoCamera } from '../lib/map-video-layout';
const viewport = { width: 600, height: 450 };
const point = (id: string, x: number, y = 200) => ({ id, x, y, width: 50, height: 76 });
describe('stable geographic video selection', () => {
  it('keeps existing tiles instead of replacing them with newly centered candidates', () => {
    const initial = [
      point('a', 100),
      point('b', 200),
      point('c', 300),
      point('d', 400),
      point('e', 500),
    ];
    const previous = selectMapVideos(initial, [], viewport);
    expect(previous).toHaveLength(5);
    const next = selectMapVideos(
      [...initial.map((p) => ({ ...p, x: p.x + 10 })), point('new', 350, 310)],
      previous,
      viewport,
    );
    expect(next).toEqual(previous);
  });
  it('fills only the released slot and preserves partially visible old videos', () => {
    const selected = selectMapVideos(
      [
        point('a', -10),
        point('b', 120),
        point('c', 230),
        point('d', 340),
        point('e', 450),
        point('new', 540),
      ],
      ['a', 'b', 'c', 'd', 'e'],
      viewport,
    );
    expect(selected).toContain('a');
    expect(selected).not.toContain('new');
    const next = selectMapVideos(
      [
        point('a', -40),
        point('b', 120),
        point('c', 230),
        point('d', 340),
        point('e', 450),
        point('new', 540),
      ],
      selected,
      viewport,
    );
    expect(next).toEqual(['b', 'c', 'd', 'e', 'new']);
  });
  it('does not overlap or move coordinates when too few distinct screen positions exist', () => {
    const candidates = [
      point('a', 100),
      point('b', 110),
      point('c', 200),
      point('d', 300),
      point('e', 400),
    ];
    const snapshot = JSON.stringify(candidates);
    const selected = selectMapVideos(candidates, ['a'], viewport);
    expect(selected).toHaveLength(4);
    expect(selected).toContain('a');
    expect(selected).not.toContain('b');
    expect(JSON.stringify(candidates)).toBe(snapshot);
    const visible = candidates.filter((p) => selected.includes(p.id));
    expect(
      visible.every((p, i) => visible.slice(i + 1).every((other) => !videosOverlap(p, other))),
    ).toBe(true);
  });
  it('finds five nonoverlapping previews when a greedy central choice would block them', () => {
    const candidates = [
      point('central', 300, 200),
      point('a', 265, 140),
      point('b', 335, 140),
      point('c', 265, 260),
      point('d', 335, 260),
      point('e', 480, 200),
    ];
    const selected = selectMapVideos(candidates, [], viewport);
    expect(selected).toHaveLength(5);
    expect(selected).not.toContain('central');
  });
  it('chooses an initial scale while preserving the geographic source data', () => {
    const videos = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      longitude: 38.75 + i * 0.005,
      latitude: 55.1,
    }));
    const snapshot = JSON.stringify(videos);
    const camera = mapVideoCamera(videos, viewport, { longitude: 38.76, latitude: 55.1, zoom: 7 });
    expect(camera.zoom).toBeGreaterThan(7);
    expect(JSON.stringify(videos)).toBe(snapshot);
  });
});
