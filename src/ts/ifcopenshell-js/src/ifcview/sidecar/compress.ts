import { compress, init, type InitOptions } from '@ioai/wasm-zstd';

/** Desktop offline bake level (SidecarCache.cpp). */
export const SIDECAR_ZSTD_LEVEL = 19;

/** Interactive web bake — same frame format, much faster compression. */
export const SIDECAR_ZSTD_WEB_LEVEL = 3;

const isNodeRuntime = typeof process !== 'undefined' && Boolean(process.versions?.node);

let configuredInit: InitOptions | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Optionally provide wasm-zstd asset location before the first compress.
 * Required in many browser bundlers; Node resolves the package WASM automatically.
 */
export function configureCompressor(options: InitOptions): void {
  configuredInit = options;
  initPromise = null;
}

async function ensureZstdReady(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      if (configuredInit) {
        await init(configuredInit);
        return;
      }

      if (isNodeRuntime) {
        const { readFileSync } = await import('node:fs');
        const { createRequire } = await import('node:module');
        const require = createRequire(import.meta.url);
        const wasmPath = require.resolve('@ioai/wasm-zstd/wasm-zstd.wasm');
        await init({ wasmBinary: readFileSync(wasmPath) });
        return;
      }

      throw new Error(
        'ifcview compressor needs wasm-zstd assets. Call configureCompressor({ wasmUrl }) ' +
          'with the URL of @ioai/wasm-zstd/wasm-zstd.wasm (e.g. Vite: import wasmUrl from "@ioai/wasm-zstd/wasm-zstd.wasm?url").',
      );
    })();
  }
  await initPromise;
}

/** Compress one zstd frame (sidecar blocks and per-chunk geometry). */
export async function compressSidecarBlock(
  raw: Uint8Array,
  level = SIDECAR_ZSTD_WEB_LEVEL,
): Promise<Uint8Array> {
  if (raw.byteLength === 0) {
    return new Uint8Array(0);
  }
  await ensureZstdReady();
  return compress(raw, level);
}

/** Preload wasm-zstd so the first IFC tessellation does not pay init latency. */
export function warmSidecarCompressor(): void {
  void ensureZstdReady().catch(() => {
    /* caller will see the error on first compress */
  });
}
