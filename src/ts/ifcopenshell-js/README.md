# ifcopenshell

Canonical Sphinx docs (including full API reference): [`../docs/index.rst`](../docs/index.rst) (`pip install -r ../docs/requirements.txt && make -C ../docs html`).

Ergonomic TypeScript and JavaScript wrappers for the generated low-level
IfcOpenShell WASM API. Same operations as SWIG Python with JS camelCase
names (`BINDING-API-PARITY-SPEC.md`).

## Install

```bash
npm install ifcopenshell
```

## Usage

```ts
import ifcopenshell from 'ifcopenshell';

// Node / bundlers: packaged assets resolve automatically.
await ifcopenshell.init();

// Browser when you serve the wasm/ directory yourself:
// await ifcopenshell.init({ wasmBase: '/wasm/' });

const response = await fetch('/model.ifc');
const model = await ifcopenshell.open(
  new Uint8Array(await response.arrayBuffer()),
  'model.ifc',
);

const project = model.byType('IfcProject')[0];
console.log(project.Name, model.schema);

const wall = model.createEntity('IfcWall', {
  GlobalId: ifcopenshell.guid.new(),
  Name: 'Demo',
});
console.assert(wall.isA('IfcWall'));
console.assert(model.byId(wall.id()).Name === 'Demo');

const settings = new ifcopenshell.geom.settings();
const iter = ifcopenshell.geom.iterate(settings, model, {
  numThreads: 1,
  geometryLibrary: 'opencascade',
});

model.dispose();
```

WASM still requires `init()` and `dispose()` / `using`. Attribute access uses
properties (`wall.Name`), matching Python.

Geometry follows Python: `ifcopenshell.geom.settings` / `iterate` /
`serializers.obj|svg|ttl`. Viewer-only helpers live under `util` and are not
part of the parity contract.

Tutorials and architecture notes:

- [`../docs/index.rst`](../docs/index.rst) — Sphinx + Furo handbook and API
- [`../WEB-STACK-GUIDE.md`](../WEB-STACK-GUIDE.md)
- [`../PACKAGES-GUIDE.md`](../PACKAGES-GUIDE.md)
- [`../examples/README.md`](../examples/README.md) — chapter hub (`node ../examples/serve.mjs`)

## Development

Build and stage WASM before compiling or testing:

```bash
python nix/wasm_native.py build
python nix/wasm_native.py package
cd src/ts/ifcopenshell-wasm
IFCOPENSHELL_WASM_DIR=/path/to/dist npm run stage
cd ../ifcopenshell-js
npm run build
npm test
```

Use `npm run test:browser` for the browser runtime smoke test.
