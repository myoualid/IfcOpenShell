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

  status.textContent = 'Running lesson…';
  const response = await fetch('sample.ifc');
  if (!response.ok) {
    throw new Error(`Missing sample.ifc (HTTP ${response.status})`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const model = await ifcopenshell.open(bytes, 'sample.ifc');
  const project = model.byType('IfcProject')[0];
  show('step-1', `Opened ${model.schema} · project ${project?.Name ?? '(unnamed)'}`);

  const walls = model.byType('IfcWall');
  let edited = null;
  if (walls.length > 0) {
    const previous = walls[0].Name ?? null;
    walls[0].Name = 'Edited in full example';
    edited = { id: walls[0].id(), previous, name: walls[0].Name };
  }
  show(
    'step-2',
    edited
      ? `#${edited.id}: "${edited.previous}" → "${edited.name}"`
      : 'No walls to edit',
  );

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
  const meshes = [];
  for await (const mesh of iter) {
    if (mesh.faces.length === 0) continue;
    meshes.push(mesh);
    if (meshes.length >= 5) break;
  }
  show('step-3', `Collected ${meshes.length} mesh(es)`);

  const name = walls[0]?.Name ?? '(no wall)';
  console.log(name, meshes.length);
  show('step-4', `${name}  ${meshes.length}`);

  walls.forEach((w) => w.dispose());
  project?.dispose();
  iter.dispose();
  settings.dispose();
  model.dispose();
  status.textContent = 'Done';
}

main().catch((err) => {
  status.textContent = String(err);
  console.error(err);
});
