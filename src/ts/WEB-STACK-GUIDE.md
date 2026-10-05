# IfcOpenShell Web Stack — architecture and tutorials

Canonical Sphinx docs: [`docs/`](./docs/) (`pip install -r docs/requirements.txt && make -C docs html`).

How the TypeScript/WASM stack under `src/ts/` fits together, with copy-paste
tutorials for parse, geometry, core authoring (`createEntity`), and viewers.

Build and npm mechanics: [PACKAGES-GUIDE.md](./PACKAGES-GUIDE.md).  
Runnable chapters: [`examples/`](./examples/) · [`examples/TUTORIAL.md`](./examples/TUTORIAL.md).

> **API shape.** Same operations as SWIG Python, with JS camelCase:
> `init`, `open`, `file`, `byType`, `byId`, `createEntity`, `isA`,
> `guid.new()`, and attribute properties such as `wall.Name`. High-level
> `ifcopenshell.api.*` authoring helpers are **not** in this branch yet.

---

## Table of contents

1. [What you are building with](#what-you-are-building-with)
2. [Architecture](#architecture)
3. [Packages](#packages)
4. [WASM profiles and plugins](#wasm-profiles-and-plugins)
5. [Installation](#installation)
6. [Tutorial — parse](#tutorial--parse)
7. [Tutorial — geometry](#tutorial--geometry)
8. [Tutorial — create (core authoring)](#tutorial--create-core-authoring)
9. [Tutorial — full stack](#tutorial--full-stack)
10. [Viewer integration](#viewer-integration)
11. [Troubleshooting](#troubleshooting)

---

## What you are building with

| Layer | Role |
|-------|------|
| **C++ / WASM** | Native IFC parse, geometry kernels, generated C API |
| **`@ifcopenshell-js/wasm`** | Staged binaries, Emscripten glue, plugin manifest, `resolveUrls` / `resolveWasmAssets` |
| **`ifcopenshell`** | TypeScript SDK — `init()`, `open()`, `file()`, `IfcFile`, `Entity`, `GeomIterator` |

Typical flow:

```text
init({ wasmBase }) or init({ wasmAssets })  →  open(bytes) or file({ schema })
                      →  byType / createEntity / meshes()
                      →  dispose()
```

You do **not** recompile C++ to use the libraries — only to produce new WASM artifacts.

---

## Architecture

```text
Your app (index.html + app.js)
        │
        ▼
ifcopenshell     init / open / file / IfcFile / Entity / geom
        │
        ▼
@ifcopenshell-js/wasm    resolveUrls() · browser.js · staged wasm/
        │
        ▼
ifcopenshell_wasm.wasm  +  ifcopenshell_api.mjs  +  plugins/*.wasm
```

Plugins (schema, kernel, mapping, serializers) load on demand via
`shell.loadPlugin(kind, id)`. Opening a file sniffs `FILE_SCHEMA` and loads the
matching schema plugin. Geometry iteration loads kernel + mapping plugins.

---

## Packages

| npm name | Use when |
|----------|----------|
| `ifcopenshell` | Apps — recommended single import (`ifcopenshell.geom`, `guid`; `util` is viewer-only) |
| `@ifcopenshell-js/wasm` | Advanced: custom asset hosting, workers, low-level `resolveUrls` / loaders |

Optional subpaths remain available: `ifcopenshell/geom`, `ifcopenshell/serializers`, `ifcopenshell/util`.

---

## WASM profiles and plugins

Built with `python nix/wasm_native.py` (profiles such as `minimal`, `full`).

| Profile | Typical kernels | Use |
|---------|-----------------|-----|
| `minimal` | `passthrough` | Smoke tests, small downloads |
| `full` | `passthrough`, `opencascade`, … | Production tessellation |

Inspect staged plugins in `src/ts/ifcopenshell-wasm/wasm/ifcopenshell_plugins.json`.
Tutorials default to `kernel: 'opencascade'` (required for typical BREP IFC).
Use `passthrough` only on minimal profiles or already-triangulated files.

---

## Installation

### 1. Stage WASM

From the IfcOpenShell repo root (this worktree):

```bash
python nix/wasm_native.py build
python nix/wasm_native.py package
cd src/ts/ifcopenshell-wasm
# Point at your build output if needed:
# set IFCOPENSHELL_WASM_DIR=...
npm run stage
```

Expect under `src/ts/ifcopenshell-wasm/wasm/`:

```text
ifcopenshell_wasm.wasm
ifcopenshell_wasm.mjs
ifcopenshell_api.mjs
ifcopenshell_plugins.json
plugins/...
```

### 2. Build JavaScript `dist/`

```bash
cd src/ts/ifcopenshell-js
npm install
npm run build
```

### 3. Serve examples

```bash
cd src/ts/examples
node serve.mjs
# open http://127.0.0.1:4173/examples/
```

Import map (single entry — `ifcopenshell` loads WASM from `wasmBase`):

```html
<script type="importmap">
{
  "imports": {
    "ifcopenshell": "../../ifcopenshell-js/dist/index.js"
  }
}
</script>
```

`init({ wasmBase })` fetches the staged `wasm/` directory (manifest, `.mjs`, `.wasm`)
via absolute URLs. `@ifcopenshell-js/wasm` remains for Node packaged assets and
advanced custom hosting — not required in example import maps.

---

## Tutorial — parse

```js
import ifcopenshell from 'ifcopenshell';

const wasmBase = new URL('../ifcopenshell-wasm/wasm/', import.meta.url).href;
await ifcopenshell.init({ wasmBase });

const bytes = new Uint8Array(await (await fetch('sample.ifc')).arrayBuffer());
const model = await ifcopenshell.open(bytes, 'sample.ifc');

console.log(model.schema);
const walls = model.byType('IfcWall');
for (const wall of walls) {
  console.log(wall.id(), wall.isA(), wall.Name, wall.GlobalId);
  wall.dispose();
}
model.dispose();
```

Runnable: [`examples/parse/`](./examples/parse/).

---

## Tutorial — geometry

```js
import ifcopenshell from 'ifcopenshell';

await ifcopenshell.init({
  wasmBase: new URL('../ifcopenshell-wasm/wasm/', import.meta.url).href,
});

const bytes = new Uint8Array(await (await fetch('sample.ifc')).arrayBuffer());
const model = await ifcopenshell.open(bytes, 'sample.ifc');

const settings = new ifcopenshell.geom.settings();
settings.set('weld-vertices', true);
settings.set('mesher-linear-deflection', 0.02);

const iter = ifcopenshell.geom.iterate(settings, model, {
  numThreads: 1,
  geometryLibrary: 'opencascade',
});
await iter.initialize();

for await (const mesh of iter) {
  console.log(mesh.type, mesh.vertices.length / 3, mesh.faces.length / 3);
}

iter.dispose();
settings.dispose();
model.dispose();
```

Runnable: [`examples/geom/`](./examples/geom/).

---

## Tutorial — create (core authoring)

High-level `ifcopenshell.api.*` is not available yet. Use core authoring APIs:

```js
import ifcopenshell from 'ifcopenshell';

await ifcopenshell.init({
  wasmBase: new URL('../ifcopenshell-wasm/wasm/', import.meta.url).href,
});

const model = await ifcopenshell.file({ schema: 'IFC4' });
const wall = model.createEntity('IfcWall', {
  GlobalId: ifcopenshell.guid.new(),
  Name: 'Demo Wall',
});
console.log(wall.id(), wall.Name);
console.log(model.toString().slice(0, 500));

wall.dispose();
model.dispose();
```

Runnable: [`examples/create/`](./examples/create/).

---

## Tutorial — full stack

Open a sample, list walls, edit a name, tessellate a few meshes — see
[`examples/full/`](./examples/full/).

---

## Viewer integration

| Chapter | Engine |
|---------|--------|
| [`examples/viewer-threejs/`](./examples/viewer-threejs/) | Three.js |
| [`examples/viewer-babylon/`](./examples/viewer-babylon/) | Babylon.js |

Each viewer chapter inlines conversion of detached `Mesh` snapshots (typed
arrays + column-major `transform`) into scene objects and recenters for WebGL
precision — see `examples/viewer-threejs/viewer.js` and
`examples/viewer-babylon/app.js`.

IfcViewerWeb and generated-API authoring sync tutorials are deferred until that
surface lands in this tree.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Failed to resolve packaged WASM assets | Run `npm run stage` in `ifcopenshell-wasm` |
| Import map 404 for `dist/` | `cd ifcopenshell-js && npm run build` |
| Geometry iterator failed / `E is not a function` | Use `opencascade` for BREP IFC (tutorial default); `passthrough` only works for triangulated geometry |
| `WebAssembly.Compile is disallowed` (>8MB) | Plugin load must use `loadAsync: true` (fixed in generated `ifcopenshell_api.mjs`) — hard-reload after restaging |
| `Call init() before open()` | Always `await ifcopenshell.init(...)` first |
| `file://` CORS / WASM errors | Serve with `node examples/serve.mjs` (HTTP only) |
