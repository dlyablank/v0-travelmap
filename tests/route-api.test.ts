import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/api/route/route';
const payload = {
  stops: [
    { latitude: 61.9456, longitude: 30.5814 },
    { latitude: 61.9157, longitude: 30.6266 },
  ],
  mode: 'car',
};
function request(data = payload) {
  return new Request('http://localhost/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('routing API', () => {
  it('prefers 2GIS when a server key is present', async () => {
    vi.stubEnv('DGIS_API_KEY', 'test-key');
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: [
            {
              total_distance: 1500,
              total_duration: 400,
              maneuvers: [
                {
                  comment: 'Прямо',
                  outcoming_path: {
                    distance: 1500,
                    duration: 400,
                    geometry: { selection: 'LINESTRING(30.58 61.94, 30.62 61.91)' },
                  },
                },
              ],
            },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const data = await (await POST(request())).json();
    expect(data.source).toBe('dgis');
    expect(data.duration).toBe(400);
    expect(String(fetcher.mock.calls[0][0])).toContain('routing.api.2gis.com');
    expect(String(fetcher.mock.calls[0][0])).toContain('key=');
  });
  it('never queries driving for public transit and keeps time unknown', async () => {
    vi.stubEnv('DGIS_API_KEY', '');
    vi.stubEnv('DGIS_KEY', '');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const data = await (await POST(request({ ...payload, mode: 'transit' }))).json();
    expect(fetcher).not.toHaveBeenCalled();
    expect(data.duration).toBeNull();
    expect(data.message).toContain('пересадки');
    expect(data.legs).toHaveLength(1);
  });
  it('uses walking provider steps and does not use driving as pedestrian fallback', async () => {
    vi.stubEnv('DGIS_API_KEY', '');
    vi.stubEnv('DGIS_KEY', '');
    vi.stubEnv('WALKING_ROUTING_URL', 'https://walking.test/route/v1/foot');
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'Ok',
            routes: [
              {
                geometry: { coordinates: [] },
                distance: 120,
                duration: 100,
                legs: [
                  {
                    distance: 120,
                    duration: 100,
                    steps: [
                      {
                        name: 'Парк',
                        distance: 120,
                        maneuver: { type: 'turn', modifier: 'right' },
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    const data = await (await POST(request({ ...payload, mode: 'walk' }))).json();
    expect(fetcher.mock.calls[0][0]).toContain('https://walking.test/route/v1/foot/');
    expect(fetcher.mock.calls[0][0]).toContain('steps=true');
    expect(data.legs[0].instructions[0].text).toBe('Поверните направо · Парк');
    vi.stubEnv('WALKING_ROUTING_URL', '');
    fetcher.mockClear();
    const fallback = await (await POST(request({ ...payload, mode: 'walk' }))).json();
    expect(fetcher).not.toHaveBeenCalled();
    expect(fallback.duration).toBeNull();
  });
  it('returns road geometry and driving duration from OSRM', async () => {
    vi.stubEnv('DGIS_API_KEY', '');
    vi.stubEnv('DGIS_KEY', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'Ok',
            waypoints: [{ distance: 2 }, { distance: 4 }],
            routes: [
              {
                distance: 6100,
                duration: 480,
                geometry: {
                  coordinates: [
                    [30.58, 61.94],
                    [30.62, 61.91],
                  ],
                },
                legs: [{ distance: 6100, duration: 480 }],
              },
            ],
          }),
        ),
      ),
    );
    const response = await POST(request());
    const data = await response.json();
    expect(data.source).toBe('osrm');
    expect(data.duration).toBe(480);
    expect(data.coordinates).toHaveLength(2);
  });
  it('falls back explicitly when upstream is unavailable', async () => {
    vi.stubEnv('DGIS_API_KEY', '');
    vi.stubEnv('DGIS_KEY', '');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const data = await (await POST(request())).json();
    expect(data.source).toBe('straight');
    expect(data.duration).toBeNull();
    expect(data.message).toContain('по прямой');
  });
  it('does not represent distant road snapping as island access', async () => {
    vi.stubEnv('DGIS_API_KEY', '');
    vi.stubEnv('DGIS_KEY', '');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ code: 'Ok', waypoints: [{ distance: 8000 }], routes: [{}] }),
          ),
        ),
    );
    const data = await (await POST(request())).json();
    expect(data.source).toBe('straight');
  });
});
