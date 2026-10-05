# IfcOpenShell JS/WASM — tutorial (chapters)

Copy-paste tutorials for static **`index.html` + `app.js`** apps. Each chapter is a
runnable folder under [`examples/`](./).

| Chapter | Folder | What you learn |
|---------|--------|----------------|
| **0** | [`00-installation/`](./00-installation/) | Stage WASM, build `dist/`, verify setup |
| **1** | [`parse/`](./parse/) | `init` → `open` → `byType` |
| **2** | [`geom/`](./geom/) | `geom.settings` + `geom.iterate` + mesh buffers |
| **3** | [`create/`](./create/) | `file()` + `createEntity` + `guid.new()` |
| **4** | [`full/`](./full/) | Parse + edit + tessellate |
| **5** | [`viewer-threejs/`](./viewer-threejs/) | Three.js integration |
| **6** | [`viewer-babylon/`](./viewer-babylon/) | Babylon.js integration |
| — | [`smoke/`](./smoke/) | Minimal create / open demo |

Open [`index.html`](./index.html) after serving this directory.

---

## Prerequisites

```bash
# From IfcOpenShell repo root
python nix/wasm_native.py build
python nix/wasm_native.py package
cd src/ts/ifcopenshell-wasm && npm run stage
cd ../ifcopenshell-js && npm run build
cd ../examples && node serve.mjs
```

Then open http://127.0.0.1:4173/examples/

---

## API contract (every chapter)

```js
import ifcopenshell from 'ifcopenshell';

await ifcopenshell.init({
  wasmBase: new URL('../ifcopenshell-wasm/wasm/', import.meta.url).href,
});

const model = await ifcopenshell.open(bytes, 'model.ifc');
// or: const model = await ifcopenshell.file({ schema: 'IFC4' });

const walls = model.byType('IfcWall');
console.log(walls[0].Name, walls[0].isA(), walls[0].id());
```

Same operations as SWIG Python with JS camelCase. Always call `dispose()` on files/entities/geometry handles
when finished.

Each chapter inlines its own `init` / fetch / open (and viewer conversion)
logic so you can read the full flow in that folder. Import maps list only
`ifcopenshell`; `init({ wasmBase })` loads the served `wasm/` assets.

---

## Chapter notes

Chapters 1–4 are step lessons: each page shows only the IFC API for that step,
then fills in a live result underneath. Snippets below match the Sphinx tutorials
in `../docs/tutorials/`.

### 0 — Installation

HEAD-checks `dist/` and staged WASM, then runs `init({ wasmBase })`.

```js
await ifcopenshell.init({
  wasmBase: new URL('../../ifcopenshell-wasm/wasm/', import.meta.url).href,
});
```

### 1 — Parse

Steps: open → `byType` → read attributes → log.

```js
const model = await ifcopenshell.open(bytes, 'sample.ifc');
const walls = model.byType('IfcWall');
const summary = {
  id: walls[0].id(),
  type: walls[0].isA(),
  name: walls[0].Name,
  guid: walls[0].GlobalId,
};
```

### 2 — Geometry

Steps: `geom.settings` → `geom.iterate` → async for-of → inspect buffers.
`geometryLibrary` defaults to `opencascade` in examples (needed for
Revit-style BREP / extrusions). For a minimal WASM profile only, set
`DEFAULT_KERNEL` in `geom/app.js` to `passthrough`.

```js
const settings = new ifcopenshell.geom.settings();
const iter = ifcopenshell.geom.iterate(settings, model, {
  numThreads: 1,
  geometryLibrary: 'opencascade',
});
await iter.initialize();
for await (const mesh of iter) { /* … */ }
```

### 3 — Create

Steps: `file()` → `createEntity` → read → `toString()`. Core authoring —
not generated `ifcopenshell.api.*`.

```js
const model = await ifcopenshell.file({ schema: 'IFC4' });
model.createEntity('IfcWall', {
  GlobalId: ifcopenshell.guid.new(),
  Name: 'Tutorial wall',
});
```

### 4 — Full

Steps: open → edit wall `Name` → tessellate → log.

```js
walls[0].Name = 'Edited in full example';
const iter = ifcopenshell.geom.iterate(settings, model, {
  numThreads: 1,
  geometryLibrary: 'opencascade',
});
```

### 5 / 6 — Viewers

Tessellate → convert in the chapter’s own `viewer.js` / `app.js` →
recenter + Z-up camera. The on-page snippet is IFC tessellation only:

```js
for await (const mesh of iter) {
  // mesh.vertices / mesh.faces / mesh.transform → Three.js / Babylon
}
```

---

## Deferred

- Generated `ifcopenshell.api.*` authoring tutorials
- Authoring sync / IfcViewerWeb chapters
- Slice npm packages (`@ifcopenshell/core`, `/parse`, …)

See [WEB-STACK-GUIDE.md](../WEB-STACK-GUIDE.md) for architecture prose.
