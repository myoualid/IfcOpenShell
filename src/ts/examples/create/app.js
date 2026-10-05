import ifcopenshell from 'ifcopenshell';

const status = document.getElementById('status');
const WASM_BASE = new URL('../../ifcopenshell-wasm/wasm/', import.meta.url).href;

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
  const model = await ifcopenshell.file({ schema: 'IFC4' });
  show('step-1', `Empty ${model.schema} file`);

  const project = model.createEntity('IfcProject', {
    GlobalId: ifcopenshell.guid.new(),
    Name: 'Tutorial project',
  });
  const wall = model.createEntity('IfcWall', {
    GlobalId: ifcopenshell.guid.new(),
    Name: 'Tutorial wall',
  });
  show('step-2', `Created #${project.id()} IfcProject and #${wall.id()} IfcWall`);

  const walls = model.byType('IfcWall');
  console.log(project.id(), wall.Name);
  console.log(walls.length);
  show('step-3', `#${project.id()}  ${wall.Name}\n${walls.length} wall(s)`);

  const stepText = model.toString();
  console.log(stepText);
  const excerpt = stepText.length > 1200 ? `${stepText.slice(0, 1200)}\n\n… (truncated)` : stepText;
  show('step-4', excerpt);

  walls.forEach((w) => w.dispose());
  project.dispose();
  wall.dispose();
  model.dispose();
  status.textContent = 'Done';
}

main().catch((err) => {
  status.textContent = String(err);
  console.error(err);
});
