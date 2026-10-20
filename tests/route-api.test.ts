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
afterEach(() => vi.unstubAllGlobals());
describe('routing API', () => {
  it('returns road geometry and driving duration from OSRM', async () => {
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
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const data = await (await POST(request())).json();
    expect(data.source).toBe('straight');
    expect(data.duration).toBeNull();
    expect(data.message).toContain('по прямой');
  });
  it('does not represent distant road snapping as island access', async () => {
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
