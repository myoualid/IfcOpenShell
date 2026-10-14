# Architecture

Bonsai Web loads an IFC model, draws it in a WebGPU viewer, and lets panels and ribbon buttons query and change that model. The shape follows Bonsai in Blender: tools hold state, operators perform actions, and modules contribute both.

`start()` in `src/index.js` is the GUI host. The page passes `BonsaiWebConfiguration` from `app/configuration/config.js`; that folder is not part of the bundle, so edits apply on refresh. `start()` in `src/headless.js` is the viewer host: same session and operators, no shell. `window.bonsai` is assigned by the page after `start()` returns.

```text
app/index.html          full GUI  → build/bonsai.js
app/headless.html       viewer    → build/bonsai-headless.js
        │
        ▼
src/headless.js       re-exports boot/headless.js
src/index.js          re-exports boot/gui.js
boot/                 shared runtime, GUI start, headless start
session/              Bonsai, signals, per-session store, viewer attach
  modules/registry.js    registerOperators. Does not import panels.
  modules/ops.js         module id → operator classes. Does not import panels.
  modules/*/operators.js operator classes for one module
  modules/ui.js          panel classes for the GUI host. Not imported by headless.
  modules/*/ui.js        panel classes. Not imported by headless.
  ops/                Operator, registry, undo history, keyboard
  tool/               Ifc, Loader, Scene, Camera, Controls, Element, Pset, Terminal
  ui/                 shell, ribbon, panel dialog, progress
  pipeline/           convert workers, ifc-lite converter, zip
  viewer/host.js      IfcViewer wrapper
  util/log.js         timestamped logger
  root.js             package-root URLs (stays here; see Bundles)
vendor/               gui2 layout, IfcViewer, ifc-lite, zstd, CodeMirror
```

## Boot

`start(container, configuration)` on the GUI entry (`src/index.js`) runs in this order:

1. **Shell.** `mountShell` builds the gui2 `World` from `config.ui` and wraps it in a `Layout`. The viewport and footer elements exist before anything else loads, so progress has somewhere to land.
2. **Dependencies.** `loadDependencies({ gui: true })` reads `src/dependencies.json` and appends styles and classic scripts, including `signals.min.js` and CodeMirror. Operators and the signal bus both need `globalThis.signals` and `globalThis.Signal`.
3. **IfcOpenShell.** `ifcopenshell.init()` on the main thread. This instance is for opening live IFC files. Geometry conversion uses a separate instance inside a worker.
4. **Host object.** `new Bonsai(container)` creates `ops`, `store`, and the signal map. The shell's viewport, world, and layout are stored on `bonsai.app`. Panels receive this object as `context`.
5. **Input and chrome.** Keyboard shortcuts, the ribbon, and the footer progress bar bind to that object.
6. **Viewer.** `create()` appends `#viewer-canvas` to the viewport and starts IfcViewer. A `ResizeObserver` reports the viewport's CSS box on `viewportResized`. The viewer samples the canvas itself; the host does not write `canvas.width` or `canvas.height`. See [viewer-redraw.md](viewer-redraw.md). `attachViewer` does not import feature operators.
7. **Operators.** `registerOperators` walks `config.app.CoreModules`, registers each module's operator classes, and lets `project` and `viewer` subscribe to loader and scene callbacks. Drag-and-drop on the viewport runs `LoadIfc`. This import graph does not include panel widgets.
8. **Panels.** `mountModuleUi` mounts the UI entry for each active module that has one. The Panels ribbon button lists those panels.
9. **Ready.** `appReady` fires. From here the page can load a file.

`start(container)` on the headless entry (`src/headless.js`) skips the shell, ribbon, progress bar, CodeMirror, and `mountModuleUi`. It still loads signals, initializes IfcOpenShell, creates the viewer in the container you pass, and calls `registerOperators` with no config so every built-in operator is registered. Terminal commands stay registered; their `poll()` returns false until a terminal panel exists.

`destroy()` disconnects the resize observer, unbinds Scene and Loader, removes the canvas, and drops the viewer reference. IfcViewer has no teardown method of its own.

## Two copies of a model

A loaded model is geometry plus, when possible, a live IFC file.

```text
.ifc bytes
   ├─ worker: tessellate → .ifcview sidecar → IfcViewer (WebGPU)
   └─ main thread: ifcopenshell.open → tool.Ifc edit mode
```

`tool.Loader` owns that lifecycle.

| Input | What happens |
|-------|----------------|
| `.ifcview` | Streamed straight into the viewer. Already-loaded sources are left as they are. |
| `.ifc` | If a matching source is already in the scene, only the live file is opened. Otherwise the bytes are converted in a worker, the sidecar is offered as a download, and both the sidecar and the live file are attached to one `sourceId`. |
| `.zip` | A pair of `.ifc` and `.ifcview` inside the archive streams the sidecar and opens the IFC. An archive with only `.ifc` goes through conversion. |
| URL | `loadIfcUrl` fetches, converts, and pairs, with no save prompt. The sample button uses this. |

Conversion settings come from `configuration.geometry` (`app/configuration/config.geometry.js`), applied at boot with `Loader.configure()`. `engine: 'ifc-lite'` uses `src/pipeline/worker-lite.js`; `engine: 'ifcopenshell'` uses `src/pipeline/ifcopenshell/convert.js`, which tessellates with the import-mapped CDN `ifcopenshell` package the same way `threejs.html` does, with `kernel` as the geometry library. That package resolves its `@ifcopenshell/wasm` imports through the page import map, so it only runs with `thread: 'main'`; asking for a worker fails with an error. `thread: 'main'` runs the pipelines through `src/pipeline/main-thread.js` instead of a worker. Load operators and the `Loader` load methods accept `{ engine, kernel, thread }` to override the defaults per call. Both paths zstd-compress the sidecar and report progress that the host re-dispatches on `modelLoadStarted`.

`openIfcFile` reads `FILE_SCHEMA` from the first 4KB, loads that schema plugin if it is missing, then calls `ifcopenshell.open`. On success it promotes the source to edit mode and fires `liveIfcReady`.

Models are additive. Passing `{ replace: true }` to `addFile`, or calling `Loader.clear()`, drops the scene and disposes live files first.

## The model record

`context.js` exports a module-level `store`:

```js
{ models: [], selection: null }
```

Each entry in `store.models` is `{ sourceId, name, viewName, mode, file }`.

- **View.** Only the `.ifcview` is loaded. `file` is null. `name` and `viewName` are the sidecar filename. Picks still carry a GlobalId, a type string, and a name from the sidecar element table.
- **Edit.** A `.ifc` is open in IfcOpenShell beside that sidecar. `file` is the IfcOpenShell file. `name` is the `.ifc` filename. Attribute, property, quantity, and spatial queries read this file.

`tool.Ifc` is the API over that store. `get()` resolves the current selection, the most recently opened model, a filename, a `sourceId`, or a viewer pick. `file()` and `entity()` return null in view mode. `globalId()` works in both modes because the viewer pick's `guid` is the IFC GlobalId.

`bindStore()` listens to that same bus and keeps `store.selection` in step: `objectPicked` with an `objectId` stores the pick, `liveIfcReady` dispatches that pick again so a selection made during conversion fills in once the file opens, and `modelCleared` clears it. A click that clears the viewer selection does not reset the properties panel. `modelCleared` does.

## Signals

`addSignals()` builds one bus on `bonsai.signals`. Tools dispatch these. Panels subscribe here, the same way a bonsai-web panel uses `context.signals`. The UI constructor receives the session as `context`, so that subscription is `context.signals.objectPicked.add(...)`.

| Group | Signals |
|-------|---------|
| Session | `appReady`, `viewerReady`, `viewportResized` |
| Model | `modelLoadStarted`, `modelLoaded`, `modelCleared`, `modelLoadedToGPU`, `modelUnloaded`, `modelNameChanged`, `liveIfcReady` |
| Scene | `objectPicked`, `selectionChanged`, `selectionCleared`, `visibilityChanged`, `xrayToggled`, `colorsChanged`, `backgroundChanged` |
| Camera and controls | `cameraChanged`, `standardViewSet`, `navPresetChanged` |
| History | `historyChanged` |

`bonsai.addSignal(name)` adds a `Signal` if that name is missing. `start()` also attaches a logger to every signal so boot and load phases print timings. Panels and tools share this bus.

## Tools

`bonsai.tool` is a namespace of classes whose public API is static methods, the same shape as `bonsai.tool` in Python. The live viewer is `bonsai.viewer`. Tools reach it through the singleton in `viewer.js`.

| Tool | Role |
|------|------|
| `Loader` | Add, convert, pair, cache, and clear sources. Drag-and-drop. |
| `Ifc` | The model list, view versus edit, the live file, the entity for a pick. |
| `Scene` | Selection, visibility, colour, x-ray, outline, federation placement. Forwards viewer pick and selection callbacks onto signals. |
| `Camera` | Orbit state, the six standard views, view-all, frame-selection. |
| `Controls` | Navigation presets: `blender`, `rhino`, `revit`, `web`. |
| `Element` | Scalar attributes, display name, type, predefined type, spatial container, spatial decomposition. |
| `Pset` | Property sets and quantity sets, with type inheritance, formatted for a table cell. |
| `Terminal` | In-memory JavaScript REPL sessions. |

`Element` and `Pset` need an edit-mode entity. In view mode the properties panel uses the strings on the viewer pick instead.

## Operators

An operator is a class extending `Operator`:

- `operatorName` is the string `ops.execute` looks up, for example `viewer.view_all`.
- `poll()` returns false to cancel. The default is true.
- `execute()` does the work.
- `undo()` reverses it. Only classes with `static undoable = true` are recorded.

`ops.execute(name, ...args)` constructs the registered class with the bonsai object and those args, then calls `run()`. `new SomeOperator(bonsai, ...args).run()` does the same without the name lookup. `run()` returns `{ status: 'CANCELLED' }` when `poll()` fails; otherwise it returns whatever `execute()` returns, unchanged.

Operators are not recorded by default. Camera, navigation, selection and query operators leave the flag off. Undoable commands, such as `hide.selection`, capture the affected ids on their first `execute`, restore them in `undo`, and reuse them when `execute` runs again for redo. An undoable command is recorded after `execute` returns, unless it returned `{ status: 'CANCELLED' }` or threw. An async `execute` is recorded when it starts. History lives on `ops.undos` and `ops.redos`, holds at most 50 commands (`ops.limit`), dispatches `historyChanged` on every change, and is not serialized.

Loading a model is not undoable. The viewer has no way to drop one model: `clearScene` removes them all, and `unloadModel` only frees GPU buffers. `project.clear` drops every model and calls `ops.clear()`, because every recorded command refers to objects that no longer exist. Ctrl+Z and Ctrl+Y call `undo` and `redo`, and they do nothing while focus is in a text field.

Modules register their operator classes at activation. A ribbon button stores the operator name and optional `args`; a click calls `bonsai.ops.execute(name, ...args)`.

## Modules

Each module has two entry points, and neither imports the other:

| Entry | File | Exports |
|-------|------|---------|
| Operators | `src/modules/<id>/operators.js` | an array of operator classes |
| UI | `src/modules/<id>/ui.js` | an array of panel classes |

`src/modules/ops.js` lists every module id and its operator array, including modules whose array is empty. `registerOperators(bonsai, configs)` in `src/modules/registry.js` walks the config list in order, skips entries with `active: false`, and registers that module's operator classes. Called with no config, it registers every built-in module. `src/headless.js` reaches the registry and not `src/modules/ui.js`. `src/index.js` imports the registry, then `src/modules/ui.js`, which lists the panel classes.

A panel class has a static `id` (the module id) and a static `spec` (group, position, label, icon). The GUI host constructs it with `{ context: bonsai }`. The class builds its gui2 tree, exposes it as `root`, and subscribes to `context.signals`. `createWorkspacePanel` docks that root into the region named by `position` (`left`, `right`, or `bottom`). A module with no panel, such as `viewer`, has no `ui.js`.

| Id | Operators | Panel |
|----|-----------|-------|
| `project` | Open file, clear, load IFC, load sample | Left: loaded models, visibility, add, clear. Buttons run operators. |
| `spatial-hierarchy` | None. The panel calls tools directly. | Left: Project → Site → Building → Storey, from the live file |
| `properties` | None. The panel follows the selection. | Right: attributes, relationships, psets, qtos |
| `viewer` | Camera, navigation, visibility, colour, federation | None. The ribbon and other modules call these. |
| `code.terminal` | Show, new session, clear | Bottom: a JavaScript REPL |

The spatial tree calls `Element.getSpatialDecomposition` only when the model record has a live file. Until `liveIfcReady`, that panel has the model root and no storeys. The properties panel fills GlobalId in both modes, and fills attributes and property sets once an entity exists.

The terminal evaluates JavaScript against the live session. Its completions and result formatting know about IfcOpenShell files and entities, which otherwise stringify as `{}`.

## UI shell

`@aeco-dev/gui` owns the widgets. `@aeco-dev/layout` owns the regions. Region ids are fixed because `Layout` looks them up by id: `RibbonMenu`, `HeaderBar`, `RibbonBar`, `WorkspaceLeft`, `WorkspaceRight`, `WorkspaceBottom`, `Viewport`, `Footer`, `LayoutToggleBar`.

`app/css/main.css` is host chrome on top of gui2: header alignment, work-mode tabs, and the rule that hides ribbon buttons belonging to another mode (`.is-work-mode-hidden`).

The Panels button is not an operator. `bindPanelDialog` builds a checkbox dialog from the panels `mountModuleUi` returned. Each checkbox shows or hides that panel without closing the workspace region.

## Bundles

`npm run build` writes two ESM files with esbuild. Bare imports (`ifcopenshell`, `@aeco-dev/gui`, `@aeco-dev/layout`) stay external and resolve through the page import map. Convert workers stay source files under `src/pipeline/`; the bundle points at them with `fromRoot`. `src/root.js` stays one directory below the package root so `../` resolves both from that file during development and from `build/*.js`.

| Output | Entry | Initial graph |
|--------|--------|----------------|
| `build/bonsai-headless.js` | `src/headless.js` | Viewer, tools, operators. No gui2, layout, or CodeMirror. |
| `build/bonsai.js` | `src/index.js` | That runtime, plus the shell and every module UI. |

The two bundles stay one file each. The GUI mounts every active panel before `appReady`, so a chunk per module would all download on that first tick. What stays independent is the source entry: `modules/ops.js` never imports `ui.js`. A panel `ui.js` may import that module's `operators.js` and run `context.ops.execute`. `operators.js` does not import `ui.js`. The headless bundle imports only the operator registry. A later lazy panel is a dynamic `import()` of that module's `ui.js` from the GUI host.

## Where to change things

| Goal | Start here |
|------|------------|
| Add a ribbon button or work mode | `app/configuration/config.ribbon.js` |
| Turn a module on or off | `app/configuration/config.modules.js` |
| Move or resize a region | `app/configuration/config.ui.js` |
| Add a docked panel | A class in that module's `ui.js` with `id` and `spec`, exported in the default array, then imported from `src/modules/ui.js` |
| Add a module's operators | Export the classes from that module's `operators.js`. A new module id also goes in `src/modules/ops.js` |
| Add a command | An `Operator` subclass, registered by the module that owns it |
| Read or change the open model | `tool.Ifc`, `tool.Element`, `tool.Pset` |
| Change load, conversion, or drag-and-drop | `src/tool/Loader.js` |
| Change what the viewer draws | `src/tool/Scene.js`, `Camera.js`, `Controls.js` |
