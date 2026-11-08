// This file was generated with the assistance of an AI coding tool.
//
// viewer.snapshot(): an offscreen render at any size, drawn as canvas-sized
// tiles and read back asynchronously. The size must come out exactly as
// asked whatever the canvas is, a transparent snapshot must be the opaque
// one minus its background (composited back over white, the two agree), and
// the tiles must not leave seams — which the white comparison also catches,
// since a seam would differ between two renders only by accident.
import { test, expect } from '@playwright/test';

function watchGpuErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (/Uncaptured WebGPU error|is invalid|Not enough memory left/i.test(msg.text()))
      errors.push(msg.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return errors;
}

async function bootWithSample(page) {
  await page.goto('/scripting.html');
  await page.waitForFunction(() => !!(window.viewer && window.viewer.isLive()),
                             null, { timeout: 30_000 });
  await page.evaluate(async () => {
    window.viewer.loadSample();
    await new Promise((r) => setTimeout(r, 2500));
    window.viewer.viewAll();
    // The grid fades into the viewer's background, which a transparent
    // snapshot does not have; leave it out of the comparison.
    window.viewer.setGridVisible(false);
    window.viewer.setOriginAxesVisible(false);
    await new Promise((r) => setTimeout(r, 600));
  });
}

test('snapshots come out at the requested size, larger than the canvas', async ({ page }) => {
  const gpuErrors = watchGpuErrors(page);
  await bootWithSample(page);

  const sizes = await page.evaluate(async () => {
    const dims = async (blob) => {
      const bmp = await createImageBitmap(blob);
      return [bmp.width, bmp.height, blob.type];
    };
    const c = document.getElementById('viewer-canvas');
    return {
      canvas: [c.width, c.height],
      plain: await dims(await window.viewer.snapshot()),
      big: await dims(await window.viewer.snapshot({ width: 4000, height: 2250 })),
      wide: await dims(await window.viewer.snapshot({ width: 1000 })),
      jpeg: await dims(await window.viewer.snapshot({ scale: 0.5, type: 'image/jpeg' })),
    };
  });
  expect(sizes.plain).toEqual([sizes.canvas[0], sizes.canvas[1], 'image/png']);
  expect(sizes.big).toEqual([4000, 2250, 'image/png']);
  expect(sizes.wide[0]).toBe(1000);
  expect(sizes.wide[1]).toBe(Math.round(1000 * sizes.canvas[1] / sizes.canvas[0]));
  expect(sizes.jpeg[2]).toBe('image/jpeg');

  const rejected = await page.evaluate(() =>
    window.viewer.snapshot({ width: 20000, height: 10 }).then(() => null, (e) => e.message));
  expect(rejected).toMatch(/out of range/);

  expect(gpuErrors, gpuErrors.join('\n')).toEqual([]);
});

test('a transparent snapshot over white matches a white-background snapshot', async ({ page }) => {
  const gpuErrors = watchGpuErrors(page);
  await bootWithSample(page);

  const result = await page.evaluate(async () => {
    const pixels = async (blob) => {
      const bmp = await createImageBitmap(blob,
        { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const oc = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = oc.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    };
    // Several tiles in each direction at any test-runner canvas size.
    const W = 2400, H = 1600;
    const t = await pixels(await window.viewer.snapshot({ width: W, height: H, transparent: true }));
    const w = await pixels(await window.viewer.snapshot({ width: W, height: H, background: '#ffffff' }));
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const enc = (l) => 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);
    let maxDiff = 0, transparent = 0, opaque = 0;
    for (let i = 0; i < t.length; i += 4) {
      const a = t[i + 3] / 255;
      if (a === 0) ++transparent;
      if (a === 1) ++opaque;
      for (let c = 0; c < 3; ++c) {
        maxDiff = Math.max(maxDiff, Math.abs(enc(lin(t[i + c]) * a + (1 - a)) - w[i + c]));
      }
    }
    return { maxDiff, transparent, opaque };
  });

  expect(result.transparent, 'the background should be fully transparent').toBeGreaterThan(0);
  expect(result.opaque, 'the model should be opaque').toBeGreaterThan(0);
  expect(result.maxDiff, `max channel difference ${result.maxDiff}`).toBeLessThan(4);

  expect(gpuErrors, gpuErrors.join('\n')).toEqual([]);
});
