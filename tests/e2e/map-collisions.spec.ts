import { expect, test, type Page } from '@playwright/test';

async function expectNoCollisions(page: Page) {
  await expect
    .poll(() =>
      page.locator('[data-map-marker-visible="true"]').evaluateAll((markers) => {
        const rects = markers.map((marker) => marker.getBoundingClientRect());
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
  // Titles and cluster counters count as part of the card, too.
  expect(
    await page.locator('[data-map-marker-visible="true"]').evaluateAll((markers) =>
      markers.every((marker) => {
        const card = marker.getBoundingClientRect();
        return [...marker.querySelectorAll('b, span')].every((child) => {
          const rect = child.getBoundingClientRect();
          return (
            rect.left >= card.left &&
            rect.right <= card.right &&
            rect.top >= card.top &&
            rect.bottom <= card.bottom
          );
        });
      }),
    ),
  ).toBe(true);
}

for (const region of ['karelia', 'kolomna']) {
  test(`${region}: all cards, titles and clusters avoid each other at different scales`, async ({
    page,
    isMobile,
  }) => {
    await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
    await page.route('**/api/places', (route) => route.fulfill({ json: { places: [] } }));
    await page.goto('/');
    await expect(page.locator('.priority-video')).toHaveCount(7);
    await page.getByRole('combobox', { name: 'Регион путешествия' }).selectOption(region);
    await expect(page.locator('.map-wrap')).toHaveAttribute('data-region', region);
    await expect(page.locator('.priority-video')).toHaveCount(7);
    await expectNoCollisions(page);
    if (region === 'karelia') {
      await expect
        .poll(() =>
          page
            .locator(
              '.video-marker:not(.priority-video)[data-map-marker-visible="true"], .map-cluster[data-map-marker-visible="true"]',
            )
            .count(),
        )
        .toBeGreaterThan(0);
    }
    const videos = page.locator('.priority-video[data-map-marker-visible="true"]');
    expect(await videos.count()).toBeGreaterThanOrEqual(isMobile ? 2 : 3);
    expect(
      await videos.first().evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    ).toEqual({ width: 60, height: 90 });
    await page.screenshot({
      path: `/tmp/map-${region}-${isMobile ? 'mobile' : 'desktop'}.png`,
      scale: 'css',
    });
    for (const name of [
      'Увеличить масштаб',
      'Уменьшить масштаб',
      'Уменьшить масштаб',
      'Уменьшить масштаб',
    ]) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(400);
      await expectNoCollisions(page);
    }
    await page.getByRole('button', { name: 'Показать весь регион' }).click();
    await page.waitForTimeout(1400);
    await expectNoCollisions(page);
  });
}
