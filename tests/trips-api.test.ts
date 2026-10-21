import { afterEach, expect, it, vi } from 'vitest';
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../lib/db', () => ({ db: { trip: { create } } }));
import { POST } from '../app/api/trips/route';

afterEach(() => {
  vi.unstubAllEnvs();
  create.mockReset();
});
const request = () =>
  new Request('http://localhost/api/trips', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Тестовая поездка',
      durationDays: 1,
      transportMode: 'transit',
      stops: ['third', 'first', 'second'],
    }),
  });
it('saves transit and exact stop order using the existing trip schema', async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://test');
  create.mockResolvedValue({ id: 'test-trip' });
  expect((await POST(request())).status).toBe(201);
  expect(create.mock.calls[0][0].data).toMatchObject({
    transportMode: 'transit',
    stops: {
      create: [
        { placeId: 'third', orderIndex: 0 },
        { placeId: 'first', orderIndex: 1 },
        { placeId: 'second', orderIndex: 2 },
      ],
    },
  });
});
it('honestly reports local-only storage without a configured database', async () => {
  vi.stubEnv('DATABASE_URL', '');
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain('только в браузере');
  expect(create).not.toHaveBeenCalled();
});
