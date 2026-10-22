import { expect, test, type Page } from '@playwright/test';
import { installMapGLFixture } from '../fixtures/mapgl-sdk';
import { places } from '../../lib/data';

test.skip(
  !process.env.NEXT_PUBLIC_DGIS_MAP_KEY,
  'Run with a dummy MapGL key and the SDK fixture; no paid API calls.',
);

async function setup(page: Page) {
  await page.addInitScript(installMapGLFixture);
  await page.route('https://mapgl.2gis.com/api/js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: '/* MapGL contract fixture installed by addInitScript. */',
    }),
  );
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
  await page.route('**/api/places', (route) => route.fulfill({ json: { places: [] } }));
}
async function collisions(page: Page) {
  await expect
    .poll(() =>
      page.locator('[data-map-marker-visible="true"]').evaluateAll((elements) => {
        const rects = elements.map((element) => element.getBoundingClientRect());
        return rects.every((a, i) =>
          rects
            .slice(i + 1)
            .every(
              (b) =>
                a.right + 7 <= b.left ||
                b.right + 7 <= a.left ||
                a.bottom + 7 <= b.top ||
                b.bottom + 7 <= a.top,
            ),
        );
      }),
    )
    .toBe(true);
}

test('MapGL keeps geographic HTML players and one map across panning, updates and regions', async ({
  page,
  isMobile,
}) => {
  await setup(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-map-provider="2gis"] .priority-video')).toHaveCount(14);
  const canvas = page.locator('.mapgl-fixture-canvas');
  await canvas.evaluate((element) => {
    element.dataset.instance = 'original';
  });
  await page.locator('.priority-video').evaluateAll((elements) =>
    elements.forEach((element) => {
      element.dataset.retained = 'original';
    }),
  );
  for (const region of ['podmoskovye', 'karelia']) {
    await page.getByRole('combobox', { name: 'Регион путешествия' }).selectOption(region);
    await expect(canvas).toHaveAttribute('data-instance', 'original');
    await expect(page.locator('.priority-video[data-retained="original"]')).toHaveCount(14);
    await expect
      .poll(() => page.locator('.priority-video[data-map-video-visible="true"]').count())
      .toBeGreaterThan(0);
    expect(
      await page.locator('.priority-video[data-map-video-visible="true"]').count(),
    ).toBeLessThanOrEqual(5);
    await collisions(page);
  }
  const players = page.locator('.map-wrap video');
  await expect.poll(() => players.count()).toBeGreaterThan(0);
  await expect
    .poll(() =>
      players.evaluateAll((elements) =>
        elements.every(
          (element) =>
            !(element as HTMLVideoElement).paused &&
            (element as HTMLVideoElement).currentTime > 0.2,
        ),
      ),
    )
    .toBe(true);
  await players.evaluateAll((elements) =>
    elements.forEach((element) => {
      element.dataset.player = 'original';
    }),
  );
  const count = await players.count();
  const point = await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    for (const fx of [0.5, 0.3, 0.7])
      for (const fy of [0.6, 0.7, 0.8]) {
        const x = rect.x + rect.width * fx,
          y = rect.y + rect.height * fy;
        if (document.elementFromPoint(x, y) === element) return { x, y };
      }
    throw new Error('No empty map area');
  });
  if (isMobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    for (let i = 1; i <= 8; i++)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: point.x + i * 3, y: point.y + i }],
      });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 24, point.y + 8, { steps: 8 });
    await page.mouse.up();
  }
  await expect(page.locator('.map-wrap video[data-player="original"]')).toHaveCount(count);
  await collisions(page);
  // Marker center and SDK projection refer to the real place, including its anchor.
  const anchored = await page.locator('.priority-video[data-map-video-visible="true"]').evaluateAll(
    (elements, locations) =>
      elements.every((element) => {
        const place = locations.find((p) => p.id === (element as HTMLElement).dataset.placeId)!;
        const root = element.parentElement as HTMLElement;
        const coordinates = JSON.parse(root.dataset.sdkCoordinates!) as number[];
        const pixel = JSON.parse(root.dataset.sdkPixel!) as number[];
        const rect = element.getBoundingClientRect(),
          mapRect = element.closest('.map-canvas')!.getBoundingClientRect();
        return (
          !!place &&
          Math.abs(coordinates[0] - place.longitude) < 1e-9 &&
          Math.abs(coordinates[1] - place.latitude) < 1e-9 &&
          Math.abs(rect.left + rect.width / 2 - mapRect.left - pixel[0]) < 1 &&
          Math.abs(rect.top + rect.height / 2 - mapRect.top - pixel[1]) < 1
        );
      }),
    places,
  );
  expect(anchored).toBe(true);
  await page.getByRole('button', { name: 'Видео на карте', exact: true }).click();
  await expect(players).toHaveCount(0);
  await page.getByRole('button', { name: 'Видео на карте', exact: true }).click();
  await expect.poll(() => players.count()).toBeGreaterThan(0);
  const chosen = page.locator('.priority-video[data-map-video-visible="true"]').first();
  const name = (await chosen.getAttribute('aria-label'))!.replace('Показать ', '');
  await chosen.click();
  await expect(page.locator('.active-preview h2')).toHaveText(name);
  await expect(players).toHaveCount(0);
  await page.getByRole('button', { name: 'Закрыть место', exact: true }).click();
  await expect(page.locator('.active-preview')).toHaveCount(0);
  await expect.poll(() => players.count()).toBeGreaterThan(0);
  // Navigation unmounts the map: native objects must be removed before SDK destroy.
  await page.getByRole('button', { name: /Моя поездка/ }).click();
  await expect(page).toHaveURL(/\/trip/);
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as Window & {
            mapglFixture: { maps: number; cleanupErrors: number; destroyed: number };
          }
        ).mapglFixture,
    ),
  ).toMatchObject({ maps: 1, cleanupErrors: 0, destroyed: 1 });
  expect(errors).toEqual([]);
});

test('a failed MapGL SDK keeps the existing map and place selection available', async ({
  page,
}) => {
  await page.route('https://mapgl.2gis.com/**', (route) => route.abort());
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
  await page.route('**/api/places', (route) => route.fulfill({ json: { places: [] } }));
  await page.goto('/');
  await expect(
    page.getByRole('status').filter({ hasText: 'Подробная карта временно недоступна' }),
  ).toBeVisible();
  await expect(page.locator('[data-map-provider="overview"] .priority-video')).toHaveCount(14);
  await collisions(page);
  await page.locator('.priority-video[data-map-video-visible="true"]').first().click();
  await expect(page.locator('.active-preview')).toBeVisible();
});
