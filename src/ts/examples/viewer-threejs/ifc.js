import ifcopenshell, { util } from 'ifcopenshell';

export { util };

/** WASM directory when serving from src/ts (see README). */
const WASM_BASE = new URL('../../ifcopenshell-wasm/wasm/', import.meta.url).href;

/**
 * Geometry kernel for this sample.
 * Revit-style IFC (extrusions / BREP) needs `opencascade`. Use `passthrough`
 * only for already-triangulated IFC or a minimal WASM profile.
 */
export const DEFAULT_KERNEL = 'opencascade';

/**
 * Boot WASM, open an IFC file, and return an async mesh stream.
 * Call `dispose()` after the viewer has finished consuming the stream.
 * @param {string} [filename='sample.ifc']
 * @param {(msg: string) => void} [setStatus]
 */
export async function generateMeshes(filename = 'sample.ifc', setStatus = () => {}) {
  setStatus('Initializing WASM…');
  await ifcopenshell.init({ wasmBase: WASM_BASE });

  setStatus(`Tessellating ${filename} (kernel: ${DEFAULT_KERNEL})…`);
  const response = await fetch(filename);
  if (!response.ok) {
    throw new Error(`Missing ${filename} next to this example (HTTP ${response.status})`);
  }
  const fileBytes = new Uint8Array(await response.arrayBuffer());
  const model = await ifcopenshell.open(fileBytes, filename);

  const settings = new ifcopenshell.geom.settings();
  settings.set('weld-vertices', true);
  settings.set('mesher-linear-deflection', 0.02);

  const iter = ifcopenshell.geom.iterate(settings, model, {
    numThreads: 1,
    geometryLibrary: DEFAULT_KERNEL,
  });
  if (!(await iter.initialize())) {
    throw new Error(
      `Geometry iterator failed (kernel: ${DEFAULT_KERNEL}). ` +
        'Confirm kernel.opencascade is staged in ifcopenshell-wasm/wasm/plugins/.',
    );
  }

  const limit = 300;

  return {
    util,
    async *[Symbol.asyncIterator]() {
      let count = 0;
      for await (const mesh of iter) {
        yield mesh;
        if (++count >= limit) break;
      }
    },
    dispose() {
      iter.dispose();
      settings.dispose();
      model.dispose();
    },
  };
}
