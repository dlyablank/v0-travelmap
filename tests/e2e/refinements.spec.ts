import { expect, test, type Page } from '@playwright/test';
import { installMapGLFixture } from '../fixtures/mapgl-sdk';
import { places } from '../../lib/data';
import { locationId } from '../../lib/locations';

test.skip(!process.env.NEXT_PUBLIC_DGIS_MAP_KEY, 'Use the SDK contract fixture with a dummy key.');
async function setup(page: Page) {
  await page.addInitScript(installMapGLFixture);
  await page.route('https://mapgl.2gis.com/api/js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: '/* SDK fixture */' }),
  );
  await page.route('**/api/places', (r) => r.fulfill({ json: { places: [] } }));
}

test('map navigation only changes the camera; collection is global and mobile chrome stays compact', async ({
  page,
  isMobile,
}) => {
  await setup(page);
  await page.goto('/');
  await expect(page.locator('.priority-video')).toHaveCount(14);
  await expect(page.locator('.place-card')).toHaveCount(places.length);
  if (isMobile) {
    const box = (await page.locator('.map-panel').boundingBox())!;
    expect(box.y).toBeLessThanOrEqual(104);
    expect(box.height).toBeGreaterThan(page.viewportSize()!.height * 0.8);
    const first = page.locator('.priority-video[data-map-video-visible="true"]').first();
    const id = (await first.getAttribute('data-place-id'))!;
    const action = first.locator('.map-trip-toggle');
    await action.click();
    await expect(action).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.active-preview')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Регион путешествия' }).selectOption('podmoskovye');
    const other = page
      .locator('.priority-video[data-place-id^="kolomna-"][data-map-video-visible="true"]')
      .first();
    await expect(other).toBeVisible();
    await other.locator('.map-trip-toggle').click();
    await expect(page.locator('.active-preview')).toHaveCount(0);
    await page.reload();
    await expect(
      page.locator(`.priority-video[data-place-id="${id}"] .map-trip-toggle`),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /Моя поездка, мест: 2/ }).click();
    await expect(page.getByRole('main', { name: 'Поездки по городам' })).toBeVisible();
    await expect(page.locator('.trip-city-card')).toHaveCount(2);
    await page.getByRole('link', { name: 'Вернуться к местам', exact: true }).click();
    await expect(page.locator('.priority-video')).toHaveCount(14);
    await page.screenshot({ path: '/tmp/mobile-map-refinement.png', scale: 'css' });
  } else {
    await page
      .getByRole('button', { name: 'Добавить в поездку Суйсари на острове', exact: true })
      .click();
  }
  await expect(page.locator('.selected-stops')).toHaveCount(0);
  await page.getByRole('button', { name: 'Природа', exact: true }).click();
  const count = await page.locator('.place-card').count();
  await page.getByRole('combobox', { name: 'Регион путешествия' }).selectOption('podmoskovye');
  await expect(page.locator('.place-card')).toHaveCount(count);
  await expect(page.getByRole('button', { name: 'Природа', exact: true })).toHaveClass(/active/);
  await page.evaluate(() =>
    (window as unknown as { mapglNavigate: (p: number[]) => void }).mapglNavigate([32.1, 61.94]),
  );
  await expect(page.getByRole('combobox', { name: 'Регион путешествия' })).toHaveValue('karelia');
  const view = await page.evaluate(() =>
    (window as unknown as { mapglView: () => { center: number[] } }).mapglView(),
  );
  expect(view.center).toEqual([32.1, 61.94]);
  await expect(page.locator('.place-card')).toHaveCount(count);
});

test('the next buffered player starts at half a swipe and reverses without rebuilding', async ({
  page,
  isMobile,
}) => {
  await setup(page);
  await page.goto('/');
  await expect(page.locator('.priority-video')).toHaveCount(14);
  if (isMobile)
    await page.getByRole('button', { name: 'Смотреть видеоленту', exact: true }).click();
  else await page.getByRole('button', { name: 'Открыть Суйсари на острове', exact: true }).click();
  const reel = page.getByRole('dialog', { name: 'Видео путешествий' });
  const next = reel.locator('.reel-slide[data-place-id="syskyanjoki"] video');
  await expect(next).toHaveCount(1);
  await next.evaluate((el) => {
    el.dataset.retained = 'preloaded';
  });
  const track = reel.locator('.reel-track');
  await track.evaluate((el) => {
    const touch = new Touch({ identifier: 1, target: el, clientX: 100, clientY: 800 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch] }));
  });
  const move = async (fraction: number) =>
    track.evaluate((el, fraction) => {
      const touch = new Touch({
        identifier: 1,
        target: el,
        clientX: 100,
        clientY: 800 - el.clientHeight * fraction,
      });
      el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [touch] }));
    }, fraction);
  await move(0.49);
  await expect(reel.locator('.video-frame[data-active="true"]')).toHaveAttribute(
    'data-place-id',
    'suisaari',
  );
  await move(0.51);
  await expect(next).toHaveAttribute('data-active', 'true');
  await expect.poll(() => next.evaluate((el) => !(el as HTMLVideoElement).paused)).toBe(true);
  await expect(reel.locator('video[data-active="true"]')).toHaveCount(1);
  await move(0.3);
  await expect(reel.locator('.video-frame[data-active="true"]')).toHaveAttribute(
    'data-place-id',
    'suisaari',
  );
  await move(0.6);
  await track.evaluate((el) =>
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] })),
  );
  await expect(next).toHaveAttribute('data-retained', 'preloaded');
  await expect(reel.getByRole('heading', { name: 'Река Сюскюянйоки' })).toBeVisible();
  await expect
    .poll(() =>
      reel
        .locator('video')
        .evaluateAll((els) => els.filter((el) => !(el as HTMLVideoElement).paused).length),
    )
    .toBe(1);
});

test('trip dashboard groups every city and a city route preserves the rest', async ({ page }) => {
  await setup(page);
  const ids = ['suisaari', 'kolomna-kremlin', 'kolomna-lazhechnikova', 'kolomna-golutvin'];
  await page.addInitScript(
    (ids) =>
      localStorage.setItem(
        'weekend-explorer-v1',
        JSON.stringify({
          state: {
            regionId: 'karelia',
            trip: [ids[0]],
            regionTrips: { karelia: [ids[0]], kolomna: ids.slice(1) },
            regionTripsMigrated: true,
            locationsMigrated: true,
          },
          version: 0,
        }),
      ),
    ids,
  );
  await page.goto('/trip');
  await expect(page.locator('.trip-city-card')).toHaveCount(2);
  await expect(page.locator('.trip-city-place')).toHaveCount(4);
  await page.getByRole('link', { name: 'Составить маршрут: Коломна', exact: true }).click();
  await expect(page.locator('.stops > li')).toHaveCount(3);
  await expect(page.getByRole('combobox', { name: 'Город поездки' })).toHaveValue(
    locationId(places.find((p) => p.id === 'kolomna-kremlin')!),
  );
  let requested = 0;
  await page.route('**/api/route', (r) => {
    const body = r.request().postDataJSON();
    requested = body.stops.length;
    return r.fulfill({
      json: {
        coordinates: body.stops.map((p: { longitude: number; latitude: number }) => [
          p.longitude,
          p.latitude,
        ]),
        distance: 1000,
        duration: 600,
        source: 'osrm',
        legs: [
          { distance: 1000, duration: 600 },
          { distance: 1000, duration: 600 },
        ],
      },
    });
  });
  await page.getByRole('button', { name: 'Собрать маршрут', exact: true }).click();
  await expect.poll(() => requested).toBe(3);
  await page.getByRole('button', { name: 'Все города и добавленные места', exact: true }).click();
  await expect(page.locator('.trip-city-card')).toHaveCount(2);
  await expect(page.locator('.trip-city-place')).toHaveCount(4);
  await page.screenshot({
    path: `/tmp/trips-grouped-${page.viewportSize()!.width}.png`,
    scale: 'css',
  });
});
