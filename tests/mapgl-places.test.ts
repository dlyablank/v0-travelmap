import { describe, expect, it } from 'vitest';
import { clusterMapPlaces, mapBounds } from '../lib/mapgl-places';
import { places } from '../lib/data';

describe('2GIS place index', () => {
  it('indexes photos from every region and leaves video selection independent', () => {
    const index = clusterMapPlaces(places);
    const features = index.getClusters([-180, -85, 180, 85], 12);
    expect(features.map((f) => f.properties.id).sort()).toEqual(
      places
        .filter((p) => !p.video)
        .map((p) => p.id)
        .sort(),
    );
    for (const feature of features) {
      const place = places.find((p) => p.id === feature.properties.id)!;
      expect(feature.geometry.coordinates[0]).toBeCloseTo(place.longitude, 12);
      expect(feature.geometry.coordinates[1]).toBeCloseTo(place.latitude, 12);
    }
  });
  it('clusters nearby photos while keeping their real leaf coordinates', () => {
    const index = clusterMapPlaces(places);
    const cluster = index
      .getClusters([-180, -85, 180, 85], 4)
      .find((f) => 'cluster' in f.properties && f.properties.cluster);
    expect(cluster).toBeDefined();
    if (!cluster || !('cluster_id' in cluster.properties) || !('point_count' in cluster.properties))
      throw new Error('Expected a cluster');
    const id = Number(cluster.properties.cluster_id);
    const leaves = index.getLeaves(id, Infinity);
    expect(leaves).toHaveLength(Number(cluster.properties.point_count));
    expect(index.getClusterExpansionZoom(id)).toBeGreaterThan(4);
    expect(leaves.every((leaf) => !places.find((p) => p.id === leaf.properties.id)!.video)).toBe(
      true,
    );
  });
  it('uses longitude/latitude order for both regions and accepts an empty filter', () => {
    expect(mapBounds([])).toBeNull();
    expect(
      mapBounds([
        [34, 62],
        [38, 55],
        [30, 61],
      ]),
    ).toEqual({ southWest: [30, 55], northEast: [38, 62] });
    expect(clusterMapPlaces([]).getClusters([-180, -85, 180, 85], 4)).toEqual([]);
  });
});
