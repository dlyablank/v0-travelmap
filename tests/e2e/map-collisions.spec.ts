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
  const offenders = await page.locator('[data-map-marker-visible="true"]').evaluateAll((markers) =>
    markers.flatMap((marker) => {
      const card = marker.getBoundingClientRect();
      return [...marker.querySelectorAll('b, span')]
        .map((child) => {
          const rect = child.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return '';
          const outside =
            rect.left < card.left - 1 ||
            rect.right > card.right + 1 ||
            rect.top < card.top - 1 ||
            rect.bottom > card.bottom + 1;
          return outside
            ? `${marker.getAttribute('aria-label') || marker.className} :: ${child.tagName} ${child.textContent} left ${Math.round(rect.left - card.left)} top ${Math.round(rect.top - card.top)} right ${Math.round(rect.right - card.right)} bottom ${Math.round(rect.bottom - card.bottom)}`
            : '';
        })
        .filter(Boolean);
    }),
  );
  expect(offenders).toEqual([]);
}

for (const region of ['karelia', 'podmoskovye']) {
  test(`${region}: all cards, titles and clusters avoid each other at different scales`, async ({
    page,
    isMobile,
  }, testInfo) => {
    await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
    await page.route('**/api/places', (route) => route.fulfill({ json: { places: [] } }));
    await page.goto('/');
    await expect(page.locator('.priority-video')).toHaveCount(14);
    await page.getByRole('combobox', { name: 'Регион путешествия' }).selectOption(region);
    await expect(page.locator('.map-wrap')).toHaveAttribute('data-region', region);
    await expect(page.locator('.priority-video')).toHaveCount(14);
    await expect
      .poll(() =>
        page
          .locator(
            `.priority-video${region === 'podmoskovye' ? '[data-place-id^="kolomna-"]' : ':not([data-place-id^="kolomna-"])'}[data-map-marker-visible="true"]`,
          )
          .count(),
      )
      .toBeGreaterThanOrEqual(region === 'podmoskovye' ? 1 : isMobile ? 2 : 3);
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
    expect(await videos.count()).toBeGreaterThanOrEqual(
      region === 'podmoskovye' ? 1 : isMobile ? 2 : 3,
    );
    const size = await videos.first().evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(Math.abs(size.width - 60)).toBeLessThan(1);
    expect(Math.abs(size.height - 90)).toBeLessThan(1);
    await page.screenshot({
      path: testInfo.outputPath(`map-${region}.png`),
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
    await page.getByRole('button', { name: 'Показать все места' }).click();
    await page.waitForTimeout(1400);
    await expectNoCollisions(page);
  });
}
