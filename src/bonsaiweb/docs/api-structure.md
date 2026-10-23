<!-- This file was generated with the assistance of an AI coding tool. -->

# API structure

Bonsai web exposes four things, modelled on Blender's Python API:

| Blender | Role | Bonsai web |
|---|---|---|
| `bpy.data` | All loaded data, owned in one place | `bonsai.store` |
| `bpy.context` | Pointers to what is current: scene, active object, selection, view | `bonsai.context` |
| `bpy.ops.cat.name()` | Named, pollable, undoable user actions | `bonsai.ops` |
| `bpy.types.Operator` + `register_class` | Extension points | `Operator`, `ops.register()` |
| `bpy.app.handlers` | Event hooks | `context.signals` |
| Bonsai Python `tool.*` | Stateless static classes, the only code that touches the backend | `bonsai.tool` |

```js
const { store, context, tool, ops } = bonsai;

tool.Viewer.get();                  // the raw IfcViewer
context.scene.falseOrigin;          // read
ops.Scene.SetBackground( '#eee' );  // change
const view = context.camera;        // plain object
tool.Viewer.get().setCamera( view );
```

## Layering rules

1. UI and panels read `context` and `store`, and call `ops`.
2. Operators call `tool`. `tool` never calls `ops`.
3. Only `tool` touches the wasm `IfcViewer` api or ifcopenshell. Only `tool` writes `store`.
4. `context` and `store` hold data, not behaviour. They never wrap a tool.
5. There is one viewer. `Bonsai.start()` creates it once. It is reached only through `tool.Viewer.get()`. There is no setter.

## How Blender splits it

- `bpy.data` owns every datablock. Nothing else owns data.
- `bpy.context` owns nothing. It points into `bpy.data`: `context.scene` is the Scene datablock, `context.active_object` is an Object. The 3D view state (`context.region_data`) is a plain struct you can read, copy and write back.
- `bpy.ops` changes data through operators that receive the context.

Bonsai web follows that: `store` owns data, `context` points into it or returns plain snapshots, `tool` does the work, `ops` is what users and UI call.

## `bonsai.tool`

| Tool | File | Role |
|---|---|---|
| `Viewer` | `tool/Viewer.js` | `get()` returns the raw IfcViewer, or null until `Bonsai.start()` has created it. Creation and teardown are internal (`createViewer`, `destroyViewer`) and not on the namespace. The file also publishes `viewerToolsChanged` from the frame callback. |
| `Scene` | `tool/Scene.js` | `setBackground`, `setUnit`, `setFalseOrigin`, `setModelTransform` (null clears). Each applies to the viewer and records the value for `store.scene` and the project file. |
| `Ifc`, `Loader`, `Federation`, `Element`, `Pset`, `Terminal` | unchanged | Data and loading. They call `tool.Viewer.get()` when they need the viewer. |

There are no `Camera`, `Controls`, `Selection` or `Visibility` tools. They would be one-line wrappers around viewer methods (`hide`, `setCamera`, `toggleFly`). Operators call those methods on `tool.Viewer.get()` directly. A tool exists only where it owns state or logic, as `Scene` does.

## `bonsai.store`

≈ `bpy.data`. `src/context/store.js`.

```js
store.models   // [ { id, name, file } ], one per model, in load order
store.scene    // read-only: { background, unit, falseOrigin, fog, grids }
```

## `bonsai.context`

≈ `bpy.context`. `src/context/context.js`. Owns nothing. Each property is a reference into `store` or a fresh plain object, so any value can be kept, compared, sent to a worker or passed to a tool. Operators and panels receive this object.

```js
context.scene          // store.scene
context.camera         // { target, distance, yaw, pitch, eye, ortho }   ≈ region_data
context.controls       // { preset, section, fly, ortho, grid, axes, fog, xray, outline }
context.activeObject   // the last pick { objectId, guid, sourceId, ... }, or null
context.selectedIds    // objectIds, ascending
context.activeModel    // the store.models entry of activeObject, or null
context.signals        // ≈ bpy.app.handlers
context.dom            // { container, viewport }
```

`camera`, `controls` and `selectedIds` read the viewer when accessed, never every frame, and are null or empty before it exists. `activeObject` and the nav `preset` follow `objectPicked`, `modelCleared` and `navPresetChanged`.

`selectedIds` is ids, not objects. Rows (name, IFC class) come from `tool.Viewer.get().getSelectedObjects()` when a caller needs them.

## Reading and changing scene state

In three.js, `scene.background = new Color( 0xeeeeee )` works because the renderer reads the scene object every frame. Here the state lives in the wasm, so assigning a JS property would change nothing on screen.

`store.scene` is created once and never replaced, so `context.scene` stays a valid reference for the session. It is frozen and its fields are getters, so assigning one throws a `TypeError` (ES modules are strict mode) instead of silently drifting from the viewer.

Each field reads its source of truth when it is read, so nothing needs syncing:

| Field | Read from |
|---|---|
| `background` | The value `tool.Scene.setBackground` recorded. The viewer has no getter. |
| `unit` | `Federation.get().unit`, which `tool.Scene.setUnit` writes. |
| `falseOrigin` | `viewer.getFalseOrigin()`, including the origin the viewer guesses for the first model. |
| `fog` | `viewer.fog()` |
| `grids` | `viewer.listGrids()` |

Changes go through ops (undo, signals) or, from operator code, through `tool.Scene`:

```js
bonsai.ops.Scene.SetBackground( '#eeeeee' );   // fires backgroundChanged
tool.Scene.setBackground( '#eeeeee' );         // from an operator
```

`context.camera` and `context.controls` are fresh copies on every read. Editing one changes only that copy until it is passed back:

```js
const cam = context.camera;
cam.yaw = 90;
tool.Viewer.get().setCamera( cam );
bonsai.ops.Viewer.SetCamera( { yaw: 90 } );   // the same through an operator
```

Setters that quietly call the viewer (`scene.background = '#eee'`) were rejected: they hide wasm calls behind a property write, skip undo and signals, and turn data into behaviour.

## `bonsai.ops`

Registering `Category.Name` also adds `ops.Category.Name( ...args )`, run with `bonsai.context`:

```js
bonsai.ops.Viewer.HideSelected()
bonsai.ops.Viewer.HideSelected( ids )
bonsai.ops.Project.LoadIfc( file )            // -> { status: 'FINISHED' | 'CANCELLED' } or a Promise
bonsai.ops.undo()
bonsai.ops.redo()
bonsai.ops.register( MyOperator )             // static operatorName = 'MyAddon.DoThing'
```

- Names are PascalCase `Category.VerbNoun`. `register` throws on any other shape.
- `undo`, `redo`, `register`, `execute` stay lowercase. They are methods of `ops`, so they never clash with a category.
- `ops.execute( name, context, ...args )` is for names held as strings, such as the ribbon config.

| Category | Operators |
|---|---|
| `Viewer` | `HideSelected`, `ShowSelected`, `ShowAll`, `HideAll`, `IsolateSelected`, `Hide`, `Show`, `SetVisible`, `SetColor`, `ClearColors`, `SetSelection`, `AddToSelection`, `RemoveFromSelection`, `ClearSelection`, `SelectGlobalId`, `ViewAll`, `FrameSelection`, `SetStandardView`, `SetCamera`, `SetNavPreset`, `ToggleProjection`, `ToggleFly`, `ToggleSection`, `ClearSection`, `ToggleGrid`, `ToggleAxes`, `ToggleXray`, `ToggleSelectionOutline`, `Measure`, `AddMeasurePoint`, `UndoMeasurePoint`, `ClearMeasure` |
| `Scene` | `SetBackground`, `SetFog`, `ToggleFog`, `SetFederationUnit`, `SetFalseOrigin`, `SetModelTransform`, `ClearModelTransform` |
| `Project` | `New`, `OpenFile`, `OpenBag`, `LoadIfc`, `LoadSample`, `Download`, `DownloadView`, `Clear`, `ListModels`, `Benchmark` |
| `Spatial` | `Select`, `Isolate`, `Objects`, `Hidden` |
| `Properties`, `Settings`, `Georeferencing`, `Profiler`, `Terminal`, `Dropbox` | Panel toggles and module actions |

Viewer picks, selection changes and model loads are reactions, not user actions. `src/modules/viewer/events.js` turns them into `objectPicked`, `selectionChanged` and `modelLoaded`; they are no longer operators.

## Scale

Federations can hold millions of objects. The structure adds no per-object cost.

- Objects live in the wasm. JS addresses them by `objectId` and keeps no JS record per object in `store` or `context`.
- `store` grows per model, not per object.
- `context` getters cost O(1), except `selectedIds`, which is O(selection). Nothing in `context` or `store` calls `getObjects()`.
- A pick or box selection calls `getObjects()` (the element table for every model) only while the picked row is missing from it.
- Only the tool flags are read every frame, and `viewerToolsChanged` fires only when one changes.
- Signals carry ids or source ids, never object rows.

## Open questions

- `context.selectedIds` as a plain array (what `getSelection()` returns today) or a `Uint32Array`? A typed array is cheaper for select-all on millions of objects.
- Should operators accept a context override, like Blender's `context.temp_override()`?
