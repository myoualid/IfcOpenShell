# Architecture

Bonsai Web loads an IFC model, draws it in a WebGPU viewer, and lets panels and ribbon buttons query and change that model. The shape follows Bonsai in Blender: tools hold state, operators perform actions, and modules contribute both.

`src/index.js` is `Bonsai`, the session: viewer and operators, no shell. `Shell` in `src/gui.js` builds the GUI around a `Bonsai`. The page passes `BonsaiWebConfiguration` from `app/configuration/config.js`; that folder is not part of the bundle, so edits apply on refresh.

```text
app/index.html          full GUI  → dist/bonsai.js + dist/gui.js  (Bonsai + Shell)
app/headless.html       viewer    → dist/bonsai.js                (Bonsai)

src/
  index.js              Bonsai: context, operator registration, viewer boot
  gui.js                Shell: layout, ribbon, panel dialog, progress bar
  assets.js             CDN URLs for the viewer scripts, zstd, and es-module-shims
  ops.js                Operator, Ops, the ops singleton, Ctrl+Z / Ctrl+Y
  context/
    signals.js          the signal bus, plus the boot/load logger
    store.js            bonsai.store: models and the read-only scene
    context.js          bonsai.context: what is current
  modules/
    operators.js        module id → operator classes, registerOperators. Does not import panels.
    ui.js               panel classes for the GUI host. Not imported by headless.
    <id>/operators.js   operator classes for one module
    <id>/ui.js          panel classes for one module
    viewer/events.js    viewer picks, selection changes and model loads → signals
  tool/                 Ifc, Loader, Federation, Element, Pset, Scene, Terminal, Viewer
  pipeline/             convert worker, zip, .ifcview sidecar writer
  util/log.js           timestamped logger
vendor/                 gitignored local copies; the page loads its dependencies from jsDelivr
```

## Boot

The GUI page builds chrome first, then starts the viewer:

```js
const bonsai = new Bonsai( document.body, configuration );
new Shell( bonsai, configuration );
bonsai.start();
```

1. **Session.** `new Bonsai(container, configuration)` applies `config.geometry`, sets `context.dom` to the container, creates its own `.bonsai-viewport` element (`bonsai.viewport`, `context.viewport`) inside it, registers operators into the ops singleton, and binds the keyboard. js-signals is bundled, and `ifcopenshell` is only ever imported dynamically, so nothing here waits on a download.
2. **Shell.** `new Shell(bonsai, configuration)` builds the gui2 `World` from `config.ui` inside `context.dom`, wraps it in a `Layout`, and moves `context.viewport` into its `#Viewport` region. The element is moved, never replaced, so every reference to it stays valid.
3. **Chrome.** `bindRibbon` and `mountUi` take `bonsai.context`. Panels are constructed with `{ context }`. Progress listens on `context.signals`.

`bonsai.start()` then boots the viewer and IfcOpenShell. The promise resolves at step 6:

4. **Viewer.** `createViewer()` appends `#viewer-canvas` and its overlays to `context.viewport` and starts IfcViewer, once per session. `tool.Viewer.get()` returns it from then on. Picks, selection changes and model loads go to `modules/viewer/events.js`, which dispatches the signals. Drag-and-drop is wired. `viewerReady` fires. The viewer samples the canvas itself; the host does not write `canvas.width` or `canvas.height`.
5. **IfcOpenShell.** `ifcopenshell.init()` on the main thread. This instance is for opening live IFC files. Geometry conversion uses a separate instance inside a worker.
6. **Ready.** `appReady` fires.

Operators that need the viewer return false from `poll()` until step 4, so a ribbon click during boot does nothing rather than throwing.

Without a `Shell`, the viewer draws straight into the container: `await new Bonsai(container).start()`. With no config, every built-in operator is registered. Terminal commands stay registered; their `poll()` returns false until a terminal panel exists.

`destroy()` removes the overlays the viewer added and drops the viewer reference. IfcViewer has no teardown method of its own; its listeners go with it.

## Two copies of a model

A loaded model is geometry plus, when possible, a live IFC file.

```text
.ifc bytes
   ├─ worker: tessellate → .ifcview sidecar → IfcViewer (WebGPU)
   └─ main thread: ifcopenshell.open → tool.Ifc.set
```

`tool.Loader` owns that lifecycle.

| Input | What happens |
|-------|----------------|
| `.ifcview` | Streamed straight into the viewer. Already-loaded sources are left as they are. |
| `.ifc` | If a matching source is already in the scene, only the live file is opened. Otherwise the bytes are converted in a worker, the sidecar is offered as a download, and both the sidecar and the live file are attached to one `sourceId`. |
| `.zip` | A pair of `.ifc` and `.ifcview` inside the archive streams the sidecar and opens the IFC. An archive with only `.ifc` goes through conversion. |
| URL | `loadIfcUrl` fetches, converts, and pairs, with no save prompt. The sample button uses this. |

Conversion settings come from `configuration.geometry` (`app/configuration/config.geometry.js`), applied at boot with `Loader.configure()`. Conversion uses `src/pipeline/ifcopenshell/convert.js`, the same `ifcopenshell` package and geometry settings as `threejs.html`, with `kernel` as the geometry library. `thread: 'auto'` and `thread: 'worker'` run the `.ifc` → `.ifcview` conversion in a worker at every file size. A single `iterator.next()` can block for 100 ms or more, and a kernel crash in the worker cannot poison the main-thread runtime that holds live files. That worker is a classic worker: it installs the page import map with es-module-shims from jsDelivr, then loads the wasm glue from the same URLs the page already fetched. The worker tessellation loop does not yield. `thread: 'main'` is an explicit opt-in and yields every 30 ms so the page can paint. `numThreads` is 1 unless the ifcopenshell runtime reports `threadsSupported` (a pthreads build) and the page is cross-origin isolated; only then does it follow the core count, up to 8. The current wasm build has no pthreads, so explicit `numThreads` values are clamped to 1 as well. Load operators and `Loader.benchmark(file, options)` accept `{ kernel, thread, numThreads, settings }`. Headless: `await bonsai.ops.Project.Benchmark(file, { kernel: 'manifold' })`. Both paths zstd-compress the sidecar and report progress that the host re-dispatches on `modelLoadStarted`.

`openIfcFile` reads `FILE_SCHEMA` from the first 4KB, loads that schema plugin if it is missing, then calls `ifcopenshell.open`. On success it attaches the file with `Ifc.set` and fires `liveIfcReady`.

Models are additive. Passing `{ replace: true }` to `addFile`, or calling `Loader.clear()`, drops the scene and disposes live files first.

## Store

`bonsai.store` (`src/context/store.js`) is the session's data, like `bpy.data`:

```js
{ models: [], scene: { background, unit, falseOrigin, fog, grids } }
```

It holds one entry per model and never one per object. Objects stay in the viewer and are addressed by `objectId`, so a federation with millions of objects costs the store nothing extra.

`store.scene` is read-only: assigning a field throws. Each field reads its source of truth when it is read: `background` from the value `tool.Scene.setBackground` recorded (the viewer has no getter), `unit` from the federation, `falseOrigin`, `fog` and `grids` from the viewer. Change them with `bonsai.ops.Scene.*` or `tool.Scene`.

Each entry in `store.models` is `{ id, name, file }`.

- `id` is the viewer source id, counting up from 0. Blank projects reserve the next id with `registerFileSource` and do not stream it.
- `name` is the filename (`.ifc` or `.ifcview`). `house`, `house.ifc`, and `house.ifcview` are the same model.
- `file` is the IfcOpenShell file, or null while only the `.ifcview` is loaded. Attribute, property, quantity, and spatial queries read this file. Picks still carry a GlobalId, a type string, and a name from the sidecar element table.

`tool.Ifc.get()` returns that file. With no argument it is the most recently stored file. A string is the model name, with or without `.ifc`. A number is the model id. `entity()` returns null until a file is open. `globalId()` works either way because the viewer pick's `guid` is the IFC GlobalId.

## Context and signals

`bonsai.context` (`src/context/context.js`) is what is current, like `bpy.context`. It owns nothing. Each property is a reference into the store or a fresh plain object, so any value can be kept, compared or passed back to a tool:

| Property | Value |
|----------|-------|
| `scene` | `store.scene` |
| `camera` | `{ target, distance, yaw, pitch, eye, ortho }`. `tool.Viewer.get().setCamera(camera)` restores it. |
| `controls` | `{ preset, section, fly, ortho, grid, axes, fog, xray, outline }` |
| `activeObject` | The last pick, or null. `objectPicked` sets it and `modelCleared` clears it. `liveIfcReady` dispatches it again so a pick made during conversion fills in once the file opens. |
| `selectedIds` | Selected objectIds, ascending. |
| `activeModel` | The `store.models` entry of `activeObject`, or null. |
| `signals`, `dom`, `viewport` | The bus, the page element Bonsai was given, and the element it owns for the canvas. |

Operators and panels receive that object, and panels may hang their own state on it (`context.settings`). `bonsai.store`, `bonsai.tool` and `bonsai.ops` sit beside it on `Bonsai`.

`Signals` is the session bus. Tools and operators dispatch on it. Panels subscribe with `context.signals.objectPicked.add(...)`.

| Group | Signals |
|-------|---------|
| Session | `appReady`, `viewerReady`, `viewportResized` |
| Model | `modelLoadStarted`, `modelLoaded`, `modelCleared`, `modelLoadedToGPU`, `modelUnloaded`, `modelNameChanged`, `liveIfcReady` |
| Scene | `objectPicked`, `selectionChanged`, `selectionCleared`, `visibilityChanged`, `viewerToolsChanged`, `colorsChanged`, `backgroundChanged` |
| Camera and controls | `cameraChanged`, `standardViewSet`, `navPresetChanged` |
| History | `historyChanged` |

`bonsai.addSignal(name)` adds a `Signal` if that name is missing. Boot also attaches a logger to every signal so boot and load phases print timings.

## Tools

`bonsai.tool` is a namespace of classes whose public API is static methods, the same shape as `bonsai.tool` in Python. Selection, visibility, colour, camera, and navigation call the raw viewer through `tool.Viewer.get()`.

| Tool | Role |
|------|------|
| `Viewer` | `get()` returns the one IfcViewer, or null before it is created. There is no setter. |
| `Scene` | Background, federation unit, false origin, and model transforms: applied to the viewer and recorded for the store and the project file. |
| `Federation` | The in-memory `.ifcfed` project. |
| `Loader` | Add, convert, pair, and clear sources. Drag-and-drop. |
| `Ifc` | The model list, view versus edit, the live file, the entity for a pick. |
| `Element` | Scalar attributes and display names. |
| `Pset` | Property sets and quantity sets, with type inheritance, formatted for a table cell. |
| `Terminal` | In-memory JavaScript REPL sessions. |

`Element` and `Pset` need an edit-mode entity. In view mode the properties panel uses the strings on the viewer pick instead.

## Operators

An operator is a class extending `Operator`:

- `operatorName` is `Category.Name` in PascalCase, for example `Viewer.ViewAll`.
- `poll()` returns false to cancel. The default is true.
- `execute()` does the work.
- `undo()` reverses it. Only classes with `static undoable = true` are recorded.

`ops` is a module singleton (`src/ops.js`). UI panels and operators import it; it is not stored on `context`.

Registering an operator also adds `ops.Category.Name(...args)`, like `bpy.ops`: `ops.Viewer.ViewAll()`. It runs `ops.execute(name, bonsai.context, ...args)`, which looks up the class, constructs it with the context and those args, runs `poll()`, then `execute()`. It returns `{ status: 'CANCELLED' }` when `poll()` fails; otherwise it returns whatever `execute()` returns, unchanged. Code calls the namespaced form; `ops.execute` is for names held as strings, such as ribbon config.

Operators are not recorded by default. Camera, navigation, selection and query operators leave the flag off. Undoable commands, such as `Viewer.HideSelected`, capture the affected ids on their first `execute`, restore them in `undo`, and reuse them when `execute` runs again for redo. An undoable command is recorded after `execute` returns, unless it returned `{ status: 'CANCELLED' }` or threw. An async `execute` is recorded when it starts. History lives on `ops.undos` and `ops.redos`, holds at most 50 commands (`ops.limit`), dispatches `historyChanged` on every change, and is not serialized.

Loading a model is not undoable. The viewer has no way to drop one model: `clearScene` removes them all, and `unloadModel` only frees GPU buffers. `Project.Clear` drops every model and calls `ops.clear()`, because every recorded command refers to objects that no longer exist. Ctrl+Z and Ctrl+Y call `ops.undo` and `ops.redo`, and they do nothing while focus is in a text field.

Modules register their operator classes at boot. A ribbon button stores the operator name and optional `args`; a click calls `ops.execute(name, context, ...args)`.

## Modules

Each module has two entry points, and neither imports the other:

| Entry | File | Exports |
|-------|------|---------|
| Operators | `src/modules/<id>/operators.js` | an array of operator classes |
| UI | `src/modules/<id>/ui.js` | an array of panel classes |

`src/modules/operators.js` lists every module id and its operator array, including modules whose array is empty. Its `registerOperators(configs)` walks the config list in order, skips entries with `active: false`, and registers that module's operator classes into the ops singleton. Called with no config, it registers every built-in module. `src/index.js` reaches that file and not `src/modules/ui.js`. `src/gui.js` imports `src/index.js`, then `src/modules/ui.js`, which lists the panel classes.

A panel class has a static `id` (the module id) and a static `spec` (group, position, label, icon). The GUI host constructs it with `{ context }`. The class builds its gui2 tree, exposes it as `root`, and subscribes to `context.signals`. `createWorkspacePanel` docks that root into the region named by `position` (`left`, `right`, or `bottom`). A module with no panel, such as `viewer`, has no `ui.js`.

| Id | Operators | Panel |
|----|-----------|-------|
| `project` | Open file, clear, load IFC, load sample | Left: loaded models, visibility, add, clear. Buttons run operators. |
| `spatial-hierarchy` | None. The panel calls tools directly. | Left: Project → Site → Building → Storey, from the live file |
| `properties` | None. The panel follows the selection. | Right: attributes, relationships, psets, qtos |
| `viewer` | Camera, navigation, visibility, colour, federation | None. The ribbon and other modules call these. |
| `code.terminal` | Show, new session, clear, close session | Bottom: a JavaScript REPL |

The spatial tree calls `getSpatialDecomposition` only when the model record has a live file. Until `liveIfcReady`, that panel has the model root and no storeys. The properties panel fills GlobalId in both modes, and fills attributes and property sets once an entity exists.

The terminal evaluates JavaScript against the live session. Its completions and result formatting know about IfcOpenShell files and entities, which otherwise stringify as `{}`.

## UI shell

`@aeco-dev/gui` owns the widgets. `@aeco-dev/layout` owns the regions. Region ids are fixed because `Layout` looks them up by id: `RibbonMenu`, `HeaderBar`, `RibbonBar`, `WorkspaceLeft`, `WorkspaceRight`, `WorkspaceBottom`, `Viewport`, `Footer`, `LayoutToggleBar`.

`app/css/main.css` is host chrome on top of gui2: header alignment, work-mode tabs, and the rule that hides ribbon buttons belonging to another mode (`.is-work-mode-hidden`).

The Panels button is not an operator. `bindPanelDialog` builds a checkbox dialog from the panels `mountUi` returned. Each checkbox shows or hides that panel without closing the workspace region.

## Bundles

`npm run build` writes ESM files with esbuild into `dist/`. Bare imports (`ifcopenshell`, `@aeco-dev/gui`, `@aeco-dev/layout`) stay external. A bundler resolves them from `node_modules`. A page without a bundler maps the same names in an import map. See [distribution.md](distribution.md).

Conversion is its own entry, `dist/convert-worker.js` and `dist/convert-main.js`, so the host bundle does not contain the tessellator. The host loads those files with `new URL` relative to itself. The build copies the sample IFC to `dist/window_wall.ifc`. The viewer scripts, zstd, and es-module-shims are fixed CDN URLs in `src/assets.js`, not configuration.

| Output | Entry | Initial graph |
|--------|--------|----------------|
| `dist/bonsai.js` | `src/index.js` | `Bonsai`: viewer, tools, operators. No gui2, layout, or CodeMirror. |
| `dist/gui.js` | `src/gui.js` | `Shell` and every module UI. |
| `dist/chunk-*.js` | | The runtime both entries share. |
| `dist/convert-worker.js` | `src/pipeline/worker.js` | `.ifc` → `.ifcview` in a worker. `ifcopenshell` stays external. |
| `dist/convert-main.js` | `src/pipeline/main-thread.js` | The same conversion on the main thread. |

`dist/module/` holds the same five outputs with every package inlined, for a page with no import map (`app/standalone.html`). The build defines `BONSAI_IFCOPENSHELL_WASM` there as the jsDelivr directory of the installed `@ifcopenshell/wasm` version. `src/runtime.js` passes those wasm files to `ifcopenshell.init()`, because the inlined glue can no longer find them next to itself, and `worker-host.js` skips copying the page import map. The optional `@aeco-dev/gui` widgets (chart.js, ag-grid, jsgantt) stay external.

`bonsai.js` and `gui.js` are built together with code splitting, so a page that imports both gets one copy of the context, store, and ops singletons. What stays independent is the source entry: `modules/operators.js` never imports `ui.js`. A panel `ui.js` imports the ops singleton and calls `ops.Category.Name(...)`. `operators.js` does not import `ui.js`. `bonsai.js` imports only the operator registry.

## Where to change things

| Goal | Start here |
|------|------------|
| Add a ribbon button or work mode | `app/configuration/config.ribbon.js` |
| Turn a module on or off | `app/configuration/config.modules.js` |
| Move or resize a region | `app/configuration/config.ui.js` |
| Add a docked panel | A class in that module's `ui.js` with `id` and `spec`, exported in the default array, then imported from `src/modules/ui.js` |
| Add a module's operators | Export the classes from that module's `operators.js`. A new module id also goes in `src/modules/operators.js` |
| Add a command | An `Operator` subclass, registered by the module that owns it |
| Read or change the open model | `tool.Ifc`, `tool.Element`, `tool.Pset` |
| Change load, conversion, or drag-and-drop | `src/tool/Loader.js` |
| Change what the viewer draws | Viewer operators in `src/modules/viewer/operators.js`, calling `tool.Viewer.get()` |
