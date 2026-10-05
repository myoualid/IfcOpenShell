import ifcopenshell from 'ifcopenshell';

const status = document.getElementById('status');
const WASM_BASE = new URL('../../ifcopenshell-wasm/wasm/', import.meta.url).href;
const DEFAULT_KERNEL = 'opencascade';

function show(stepId, value) {
  const el = document.getElementById(stepId);
  if (!el) return;
  el.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  el.classList.add('done');
  const step = el.closest('.lesson-step');
  if (step) step.classList.add('done');
}

async function main() {
  status.textContent = 'Initializing WASM…';
  await ifcopenshell.init({ wasmBase: WASM_BASE });

  status.textContent = 'Opening sample.ifc…';
  const response = await fetch('sample.ifc');
  if (!response.ok) {
    throw new Error(`Missing sample.ifc (HTTP ${response.status})`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const model = await ifcopenshell.open(bytes, 'sample.ifc');

  status.textContent = 'Running lesson…';
  const settings = new ifcopenshell.geom.settings();
  settings.set('weld-vertices', true);
  settings.set('mesher-linear-deflection', 0.02);
  show('step-1', 'geom.settings ready (weld-vertices, deflection 0.02)');

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
  show('step-2', `Iterator initialized (geometryLibrary: ${DEFAULT_KERNEL})`);

  const meshes = [];
  for await (const mesh of iter) {
    if (mesh.faces.length === 0) continue;
    meshes.push(mesh);
    if (meshes.length >= 10) break;
  }
  show('step-3', `Collected ${meshes.length} mesh(es)`);

  const mesh = meshes[0];
  if (mesh) {
    const vertices = mesh.vertices.length / 3;
    const triangles = mesh.faces.length / 3;
    console.log(mesh.type, vertices, triangles);
    show('step-4', `${mesh.type}  ${vertices} vertices  ${triangles} triangles`);
  } else {
    show('step-4', 'No meshes collected');
  }

  iter.dispose();
  settings.dispose();
  model.dispose();
  status.textContent = 'Done';
}

main().catch((err) => {
  status.textContent = String(err);
  console.error(err);
});
