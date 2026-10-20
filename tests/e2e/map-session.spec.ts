import { expect, test, type Page } from '@playwright/test';
import { places as demoPlaces } from '../../lib/data';

async function pan(page: Page, dx: number, dy: number, mobile: boolean) {
  const start = await page.locator('.map-wrap').evaluate((element) => {
    const r = element.getBoundingClientRect();
    for (const fy of [0.6, 0.7, 0.5, 0.8])
      for (const fx of [0.5, 0.4, 0.6, 0.3]) {
        const x = r.left + r.width * fx,
          y = r.top + r.height * fy;
        if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return { x, y };
      }
    throw new Error('No free map area for drag');
  });
  if (mobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let i = 1; i <= 8; i++)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: start.x + (dx * i) / 8, y: start.y + (dy * i) / 8 }],
      });
    await page.waitForTimeout(180);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 });
    await page.waitForTimeout(180);
    await page.mouse.up();
  }
}

test('panning keeps existing players and appends fresh geographic videos without overlaps', async ({
  page,
  isMobile,
}) => {
  let published: (typeof demoPlaces)[number] | null = null;
  let gateUpdates = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.route('**/api/places', async (r) => {
    if (gateUpdates) await gate;
    await r.fulfill({ json: { places: published ? [published] : [] } });
  });
  try {
    await page.goto('/');
    const players = page.locator('.map-wrap video');
    await expect.poll(() => players.count()).toBeGreaterThanOrEqual(3);
    const initialCount = await players.count();
    expect(initialCount).toBeLessThanOrEqual(5);
    await expect
      .poll(() =>
        players.evaluateAll((es) =>
          es.every(
            (e) => !(e as HTMLVideoElement).paused && (e as HTMLVideoElement).currentTime > 0.2,
          ),
        ),
      )
      .toBe(true);
    await players.evaluateAll((es) =>
      es.forEach((e) => {
        e.dataset.retained = 'original';
      }),
    );
    await expect(page.locator('.map-marker-connectors')).toHaveCount(0);
    await expect(
      page.locator(
        '.priority-video[data-map-video-visible="true"].maplibregl-marker-anchor-center',
      ),
    ).toHaveCount(initialCount);
    await pan(page, 20, 6, isMobile);
    await expect(page.locator('.map-wrap video[data-retained="original"]')).toHaveCount(
      initialCount,
    );
    await expect
      .poll(() =>
        page
          .locator('.map-wrap video[data-retained="original"]')
          .evaluateAll((es) => es.every((e) => !(e as HTMLVideoElement).paused)),
      )
      .toBe(true);
    const mapBox = (await page.locator('.map-wrap').boundingBox())!;
    gateUpdates = true;
    for (let i = 0; i < 4; i++) {
      await pan(page, -Math.min(100, mapBox.width * 0.2), 0, isMobile);
      if ((await players.count()) < initialCount) break;
    }
    expect(await players.count()).toBeLessThan(initialCount);
    const survivors = await page
      .locator('.priority-video[data-map-video-visible="true"]')
      .evaluateAll((es) =>
        es.map((e) => {
          const r = e.getBoundingClientRect();
          return {
            id: e.getAttribute('data-place-id')!,
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
          };
        }),
      );
    expect(survivors.length).toBeGreaterThanOrEqual(2);
    const references = survivors
      .map((p) => ({ ...p, place: demoPlaces.find((place) => place.id === p.id)! }))
      .sort((a, b) => a.place.longitude - b.place.longitude);
    const a = references[0],
      b = references.at(-1)!;
    const scale = (b.x - a.x) / ((b.place.longitude - a.place.longitude) / 360);
    const target = await page.locator('.map-wrap').evaluate((element) => {
      const box = element.getBoundingClientRect();
      const videos = [
        ...element.querySelectorAll<HTMLElement>('.priority-video[data-map-video-visible="true"]'),
      ].map((e) => e.getBoundingClientRect());
      for (let y = box.top + 200; y < box.bottom - 90; y += 90)
        for (let x = box.left + 45; x < box.right - 90; x += 70) {
          if (
            document.elementFromPoint(x, y)?.tagName === 'CANVAS' &&
            videos.every(
              (r) => x < r.left - 34 || x > r.right + 34 || y < r.top - 50 || y > r.bottom + 50,
            )
          )
            return { x, y };
        }
      throw new Error('No free slot for a new geographic video');
    });
    const worldX = (a.place.longitude + 180) / 360 + (target.x - a.x) / scale;
    const worldY =
      (1 - Math.log(Math.tan(Math.PI / 4 + (a.place.latitude * Math.PI) / 360)) / Math.PI) / 2 +
      (target.y - a.y) / scale;
    published = {
      ...demoPlaces[0],
      id: 'session-new-video',
      name: 'Новое тестовое видео',
      longitude: worldX * 360 - 180,
      latitude: (Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY))) * 180) / Math.PI,
    };
    release();
    const fresh = page.locator('.priority-video[data-place-id="session-new-video"]');
    await expect(fresh).toHaveAttribute('data-map-video-visible', 'true');
    await expect(fresh.locator('video')).toHaveCount(1);
    for (const survivor of survivors)
      await expect(
        page.locator(`.priority-video[data-place-id="${survivor.id}"] video`),
      ).toHaveAttribute('data-retained', 'original');
    const actual = (await fresh.boundingBox())!;
    expect(Math.abs(actual.x + actual.width / 2 - target.x)).toBeLessThan(2);
    expect(Math.abs(actual.y + actual.height / 2 - target.y)).toBeLessThan(2);
    expect(
      await page.locator('.priority-video[data-map-video-visible="false"] video').count(),
    ).toBe(0);
    expect(await players.count()).toBeLessThanOrEqual(5);
    expect(
      await page.locator('.priority-video[data-map-video-visible="true"]').evaluateAll((es) =>
        es.every((e, i) => {
          const a = e.getBoundingClientRect();
          return es.slice(i + 1).every((other) => {
            const b = other.getBoundingClientRect();
            return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
          });
        }),
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/map-session-${isMobile ? 'mobile' : 'desktop'}.png`,
      scale: 'css',
    });
  } finally {
    release();
  }
});

test('loading the detailed map style preserves already playing video elements', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('https://tiles.openfreemap.org/styles/positron', async (route) => {
    await gate;
    await route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          { id: 'test-background', type: 'background', paint: { 'background-color': '#d9e4d5' } },
        ],
      },
    });
  });
  await page.route('**/api/places', (route) => route.fulfill({ json: { places: [] } }));
  try {
    await page.goto('/');
    const players = page.locator('.map-wrap video');
    await expect.poll(() => players.count()).toBeGreaterThan(0);
    await expect
      .poll(() =>
        players.evaluateAll((elements) =>
          elements.every(
            (video) =>
              !(video as HTMLVideoElement).paused && (video as HTMLVideoElement).currentTime > 0.2,
          ),
        ),
      )
      .toBe(true);
    const count = await players.count();
    await players.evaluateAll((elements) =>
      elements.forEach((video) => {
        video.dataset.styleProof = 'retained';
      }),
    );
    release();
    await expect(page.locator('.overview-label')).toBeHidden();
    await expect(page.locator('.map-wrap video[data-style-proof="retained"]')).toHaveCount(count);
    await expect
      .poll(() =>
        players.evaluateAll((elements) =>
          elements.every((video) => !(video as HTMLVideoElement).paused),
        ),
      )
      .toBe(true);
  } finally {
    release();
  }
});
