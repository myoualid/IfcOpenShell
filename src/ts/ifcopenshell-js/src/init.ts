import {
  IfcOpenShellError,
  IfcOpenShellErrorCode,
  IfcOpenShellErrorKind,
  abortError,
  isIfcOpenShellAbortError,
} from './errors.js';
import type {
  EmscriptenFS,
  EmscriptenOptions,
  IfcOpenshellApiFactory,
  IfcOpenshellModule,
  InitOptions,
  PluginKind,
  PluginManifest,
  WasmAssets,
} from './types.js';

/** Initialized IfcOpenShell runtime and its ergonomic low-level API. */
export interface IfcOpenShell {
  /**
   * @internal Generated WASM module. Escape hatch only — not part of the
   * public app API. Prefer {@link open}, {@link file}, and facade methods.
   */
  readonly raw: IfcOpenshellModule;
  readonly fs: EmscriptenFS | null;
  loadPlugin(kind: PluginKind, id: string): Promise<void>;
  loadedPlugins(): string[];
}

export {
  IfcOpenShellError,
  IfcOpenShellErrorCode,
  IfcOpenShellErrorKind,
  abortError,
  isIfcOpenShellAbortError,
};

/**
 * Initialize the packaged or explicitly configured WASM runtime.
 *
 * Plugins are loaded lazily through {@link IfcOpenShell.loadPlugin}. Native
 * handles returned by the API must be disposed by their owners.
 *
 * @param options Asset locations and optional plugin-loader overrides.
 * @returns An initialized, frozen runtime facade.
 */
export async function init(options: InitOptions = {}): Promise<IfcOpenShell> {
  let assets: WasmAssets;
  try {
    if (options.wasmAssets) {
      assets = options.wasmAssets;
    } else if (options.wasmBase) {
      assets = await resolveFromBase(options.wasmBase);
    } else {
      assets = await resolveRuntime();
    }
  } catch (error) {
    if (error instanceof IfcOpenShellError) throw error;
    throw new IfcOpenShellError('Failed to resolve packaged WASM assets', error);
  }
  const loader = options.pluginLoader ?? assets.pluginLoader;

  validateAssets(assets);

  let fs: EmscriptenFS | null = null;
  const initModule = (opts?: EmscriptenOptions) =>
    Promise.resolve(assets.initModule(opts)).then((mod) => {
      fs = readFs(mod);
      return mod;
    });

  const createModule = await resolveApiFactory(assets);
  let raw: IfcOpenshellModule;
  try {
    raw = await createModule(initModule, assets.wasmUrl, {
      pluginBaseUrl: assets.pluginBaseUrl,
      pluginManifest: assets.manifest as Record<string, Record<string, { wasm: string; depends?: string[] }>>,
      pluginLoader: loader,
    });
  } catch (error) {
    throw new IfcOpenShellError('Failed to instantiate IfcOpenShell WASM', error);
  }

  const shell: IfcOpenShell = {
    raw,
    fs,
    loadPlugin: (kind, id) => loadPlugin(raw, kind, id),
    loadedPlugins: () => raw.loadedPlugins(),
  };
  return Object.freeze(shell);
}

/**
 * Resolve a served `wasm/` directory (browser / CDN) without importing
 * `@ifcopenshell-js/wasm` — so bare-browser apps only need an import map for
 * `ifcopenshell`.
 */
async function resolveFromBase(wasmBase: string): Promise<WasmAssets> {
  const normalizedBase = wasmBase.endsWith('/') ? wasmBase : `${wasmBase}/`;
  const manifestResponse = await fetch(new URL('ifcopenshell_plugins.json', normalizedBase));
  if (!manifestResponse.ok) {
    throw new IfcOpenShellError(
      `Failed to load WASM plugin manifest: ${manifestResponse.status}`,
    );
  }
  const manifest = (await manifestResponse.json()) as PluginManifest;
  const initModuleUrl = new URL('ifcopenshell_wasm.mjs', normalizedBase).href;
  const apiModuleUrl = new URL('ifcopenshell_api.mjs', normalizedBase).href;
  const [wasmModule, apiModule] = await Promise.all([
    import(/* @vite-ignore */ /* webpackIgnore: true */ initModuleUrl),
    import(/* @vite-ignore */ /* webpackIgnore: true */ apiModuleUrl),
  ]);

  return {
    initModule: wasmModule.default,
    wasmUrl: new URL('ifcopenshell_wasm.wasm', normalizedBase).href,
    pluginBaseUrl: normalizedBase,
    manifest,
    apiModuleUrl,
    createIfcOpenshellModule: apiModule.createIfcOpenshellModule,
  };
}

async function resolveRuntime(): Promise<WasmAssets> {
  const wasm = await import('@ifcopenshell-js/wasm');
  return await wasm.resolveWasmAssets() as WasmAssets;
}

async function resolveApiFactory(assets: WasmAssets): Promise<IfcOpenshellApiFactory> {
  if (typeof assets.createIfcOpenshellModule === 'function') return assets.createIfcOpenshellModule;

  const specifier = assets.apiModuleUrl!;
  try {
    const mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ specifier);
    if (typeof mod.createIfcOpenshellModule !== 'function') {
      throw new IfcOpenShellError(`${specifier} does not export createIfcOpenshellModule`);
    }
    return mod.createIfcOpenshellModule as IfcOpenshellApiFactory;
  } catch (error) {
    throw new IfcOpenShellError(
      `Failed to load IfcOpenShell API module from ${specifier}`,
      error,
    );
  }
}

function validateAssets(assets: WasmAssets | undefined): asserts assets is WasmAssets {
  if (typeof assets?.initModule !== 'function') {
    throw new IfcOpenShellError('wasmAssets.initModule must be the ifcopenshell_wasm.mjs module factory');
  }
  if (typeof assets.wasmUrl !== 'string' || assets.wasmUrl.length === 0) {
    throw new IfcOpenShellError('wasmAssets.wasmUrl must point to ifcopenshell_wasm.wasm');
  }
  if (typeof assets.pluginBaseUrl !== 'string' || assets.pluginBaseUrl.length === 0) {
    throw new IfcOpenShellError('wasmAssets.pluginBaseUrl must point to the plugin directory');
  }
  if (!assets.manifest || typeof assets.manifest !== 'object') {
    throw new IfcOpenShellError('wasmAssets.manifest must be a plugin manifest object');
  }
  if (
    typeof assets.createIfcOpenshellModule !== 'function' &&
    (typeof assets.apiModuleUrl !== 'string' || assets.apiModuleUrl.length === 0)
  ) {
    throw new IfcOpenShellError(
      'wasmAssets must provide createIfcOpenshellModule or apiModuleUrl',
    );
  }
}

function readFs(mod: unknown): EmscriptenFS | null {
  const fs = (mod as { FS?: unknown } | null)?.FS;
  if (
    fs &&
    typeof fs === 'object' &&
    typeof (fs as { writeFile?: unknown }).writeFile === 'function' &&
    typeof (fs as { readFile?: unknown }).readFile === 'function'
  ) {
    return fs as EmscriptenFS;
  }
  return null;
}

async function loadPlugin(raw: IfcOpenshellModule, kind: PluginKind, id: string): Promise<void> {
  try {
    await raw.loadPlugin(kind, id);
  } catch (error) {
    const key = `${kind}:${id}`;
    const suffix = error instanceof Error && error.message ? `: ${error.message}` : '';
    throw new IfcOpenShellError(`Failed to load plugin ${key}${suffix}`, error);
  }
}
