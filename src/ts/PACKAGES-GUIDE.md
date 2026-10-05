# IfcOpenShell JavaScript packages — build, layout, and usage

Canonical Sphinx docs: [`docs/`](./docs/) (`pip install -r docs/requirements.txt && make -C docs html`).

How the two packages under `src/ts/` fit together, how WASM is staged, and how
to build and run the TypeScript SDK.

User-facing tutorials: [WEB-STACK-GUIDE.md](./WEB-STACK-GUIDE.md),
[`examples/index.html`](./examples/index.html), [`examples/TUTORIAL.md`](./examples/TUTORIAL.md).

---

## Why two folders?

| Folder | npm name | Responsibility |
|--------|----------|----------------|
| `src/ts/ifcopenshell-wasm/` | `@ifcopenshell-js/wasm` | Native runtime — `.wasm`, generated `.mjs` glue, plugin manifest, browser/Node loaders |
| `src/ts/ifcopenshell-js/` | `ifcopenshell` | High-level TypeScript SDK — `init`, `open`, `file`, `IfcFile`, `Entity`, geom, serializers |

**Why separate them?**

1. **Size and lifecycle** — WASM artifacts are large and rebuilt by Emscripten; the TS layer changes often.
2. **Runtime targets** — browser (`browser.js`) vs Node (`index.js`) share the same staged `wasm/` directory.
3. **Lazy plugins** — schema parsers, kernels, mappings ship as side modules via `shell.loadPlugin()`.
4. **Reuse** — workers/viewers can depend on WASM alone.

The JS package depends on the WASM package (`@ifcopenshell-js/wasm`). Installing the
umbrella pulls WASM transitively once packages are published; in this worktree
use local folders and run `npm run stage` yourself.

---

## Architecture at a glance

```text
C++ (IfcParse, IfcGeom, ifcapi)
  src/ifcwrap/binding_generator/  +  generated C API
        │
        ▼  codegen + Emscripten (nix/wasm_native.py)
  build output …/ifcwrap/wasm/
    ifcopenshell_wasm.{mjs,wasm,node.mjs,node.wasm}
    ifcopenshell_api.{mjs,d.ts}
    ifcopenshell_plugins.json
    plugins/*.wasm
        │
        ▼  npm run stage  (src/ts/ifcopenshell-wasm/scripts/stage.mjs)
  src/ts/ifcopenshell-wasm/wasm/
        │
        ├─► @ifcopenshell-js/wasm
        │     resolveWasmAssets()  — Node
        │     resolveUrls()        — browser
        │     asset-manifest.js    — bundler-friendly URLs
        │
        └─► ifcopenshell
              init → open / file / IfcFile / Entity / geom
              npm run build → dist/
```

Typical startup (camelCase session API):

```js
import ifcopenshell from 'ifcopenshell';

await ifcopenshell.init(); // or init({ wasmAssets }) when serving wasm/ yourself
const model = await ifcopenshell.open(bytes, 'model.ifc');
// or: const model = await ifcopenshell.file({ schema: 'IFC4' });
```

Schema plugins load automatically from the STEP header (or from `file({ schema })`).
Geometry kernels load when you call `ifcopenshell.geom.iterate(...)`.

---

## What is inside the main WASM vs plugins?

The main `ifcopenshell_wasm.wasm` is the Emscripten **host** (memory, FS, plugin
registry, generated C API trampolines, shared IfcParse/IfcGeom infrastructure).

| Plugin kind | Role | Example IDs |
|-------------|------|-------------|
| `schema` | Schema-specific STEP parsing | `ifc2x3`, `ifc4`, … |
| `kernel` | Tessellation backend | `passthrough`, `opencascade`, … |
| `mapping` | Schema-specific geometry mapping | per schema |
| `geometry_serializer` | Mesh export (OBJ, …) | `obj` |
| `document` / `tree` | serializers / spatial backends | profile-dependent |

Manifest: `wasm/ifcopenshell_plugins.json`.

---

## Package reference (today)

### `@ifcopenshell-js/wasm`

| Entry | Purpose |
|-------|---------|
| `browser.js` | Browser `resolveUrls(baseUrl)` |
| `index.js` | Node `resolveWasmAssets()` |
| `./api` | Generated `ifcopenshell_api.mjs` types/glue |
| `wasm/` | Staged binaries (not always committed) |

### `ifcopenshell`

| Export / subpath | Purpose |
|------------------|---------|
| default / `init`, `open`, `file`, `guid`, `geom` | Session API (camelCase) |
| `IfcFile`, `Entity` | Model and entity wrappers |
| `./geom` | `settings`, `iterate`, `iterator`, `serializers`, matrix helpers |
| `./serializers` | `obj`, `svg`, `ttl` |
| `./util` | Viewer helpers only (`meshColor`, …) — not Python parity |

---

## Build pipeline

From the repository root of this worktree:

```bash
# 1. Build WASM (needs emsdk / toolchain — see nix/ and win/ docs)
python nix/wasm_native.py build
python nix/wasm_native.py package

# 2. Stage into the npm wasm package
cd src/ts/ifcopenshell-wasm
npm install
# Optional: IFCOPENSHELL_WASM_DIR=/path/to/build/output
npm run stage

# 3. Build TypeScript
cd ../ifcopenshell-js
npm install
npm run build
npm test
```

Windows helpers may also exist under `build/` (for example `build-wasm-native.bat`).
Use whichever path your environment already documents.

---

## Local development workflow

```bash
# After staging + JS build:
cd src/ts/examples
node serve.mjs
# http://127.0.0.1:4173/examples/
```

Smoke-only page: `/examples/smoke/`.  
Chapter hub: `/examples/`.

For Node tests, `init()` resolves packaged assets via `@ifcopenshell-js/wasm`
without a custom import map.

---

## Installing into an app

Until packages are published to a registry:

```json
{
  "dependencies": {
    "ifcopenshell": "file:../path/to/src/ts/ifcopenshell-js",
    "@ifcopenshell-js/wasm": "file:../path/to/src/ts/ifcopenshell-wasm"
  }
}
```

Bundlers that understand `new URL(..., import.meta.url)` (for example Vite) can
consume the wasm package’s asset manifest. Otherwise serve `wasm/` over HTTP and
pass `init({ wasmAssets: await resolveUrls('/wasm/') })`.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `WASM artifacts are missing` | Never ran `npm run stage` |
| Browser 404 on `.wasm` / `.mjs` | Wrong `resolveUrls` base or not serving `src/ts` |
| `Call init() before open()` | Forgot `await ifcopenshell.init()` |
| Geometry kernel missing | Profile lacks that plugin — try `passthrough` |

---

## Related paths

| Path | Role |
|------|------|
| `src/ifcwrap/binding_generator/` | C API / binding generation |
| `nix/wasm_native.py` | WASM build orchestration |
| `src/ts/examples/` | Teaching chapters |
| `src/ts/ifcopenshell-js/README.md` | Package quick start |
