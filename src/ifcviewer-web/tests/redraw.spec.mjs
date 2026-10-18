// This file was generated with the assistance of an AI coding tool.
//
// On-demand redraw. The viewer only renders when something asked for a frame,
// so two paths must ask: a canvas resize (reconfiguring the surface clears the
// bitmap) and requestRedraw() (for bitmap losses the wasm cannot see). Frames
// are counted as GPUQueue.submit calls, patched in before the wasm loads.
import { test, expect } from '@playwright/test';

const nextFrames = (page, n) => page.evaluate((n) => new Promise((resolve) => {
  const step = () => (n-- > 0 ? requestAnimationFrame(step) : resolve());
  step();
}), n);

const submits = (page) => page.evaluate(() => window.__submits);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__submits = 0;
    const submit = GPUQueue.prototype.submit;
    GPUQueue.prototype.submit = function () {
      window.__submits++;
      return submit.apply(this, arguments);
    };
  });
  await page.goto('/scripting.html');
  await page.waitForFunction(() => !!(window.viewer && window.viewer.isLive()),
                             null, { timeout: 30_000 });
  await page.waitForFunction(() => document.getElementById('sample-btn').onclick,
                             null, { timeout: 30_000 });
  await page.click('#sample-btn');
  await page.waitForTimeout(1500);
});

test('an idle viewer submits nothing', async ({ page }) => {
  const before = await submits(page);
  await nextFrames(page, 30);
  expect(await submits(page)).toBe(before);
});

test('a canvas resize redraws in the tick that reconfigured the surface', async ({ page }) => {
  const size = page.viewportSize();
  const before = await submits(page);
  await page.setViewportSize({ width: size.width - 120, height: size.height - 80 });
  // One frame for the layout change to reach the tick, one for slack.
  await nextFrames(page, 2);
  expect(await submits(page), 'resize left the cleared canvas undrawn').toBeGreaterThan(before);
});

test('requestRedraw draws once, however often it is called in a frame', async ({ page }) => {
  const a = await submits(page);
  await page.evaluate(() => window.viewer.requestRedraw());
  await nextFrames(page, 3);
  const one = (await submits(page)) - a;
  expect(one).toBeGreaterThan(0);

  const b = await submits(page);
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) window.viewer.requestRedraw();
  });
  await nextFrames(page, 3);
  expect((await submits(page)) - b).toBe(one);
});
