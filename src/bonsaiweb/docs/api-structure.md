<!-- This file was generated with the assistance of an AI coding tool. -->

# API structure

`new Bonsai()` has four parts:

| Part | What it is | Where |
|---|---|---|
| `bonsai.store` | The session's data: loaded models and scene settings. | `src/context/store.js` |
| `bonsai.context` | What is current right now: the active object, the selection, the camera. | `src/context/context.js` |
| `bonsai.tool` | Classes with static methods that do the work, including `tool.Viewer.get()`. | `src/tool/` |
| `bonsai.ops` | Named user actions, with undo. What buttons, panels and scripts call. | `src/ops.js`, `src/modules/*/operators.js` |

A typical script:

```js
const { store, context, tool, ops } = bonsai;

store.models;                       // every loaded model
context.activeObject;               // what was last clicked
ops.Viewer.IsolateSelected();       // do something, undoable
tool.Viewer.get().getSelection();   // talk to the viewer directly
```

## Who does what

- **Reading** goes through `store` and `context`. Both hold data only: no methods, nothing that changes the scene.
- **Changing** goes through `ops`. An operator checks it can run, does the work, fires the signals panels listen to, and records itself for undo when that makes sense.
- **Doing the work** is `tool`. Operators call tools. Only tools talk to the viewer or to ifcopenshell, and only tools write to `store`. Tools never call operators.
- **Listening** goes through `context.signals`. Panels subscribe there instead of polling.

## `bonsai.tool`

| Tool | Role |
|---|---|
| `Viewer` | `Viewer.get()` returns the IfcViewer, or null until `Bonsai.start()` has created it. The viewer is created once per session, and nothing can replace it. |
| `Scene` | Scene-wide changes: `setBackground`, `setUnit`, `setFalseOrigin`, `setModelTransform` (pass null to clear). Each one updates the viewer and records the value, so `store.scene` and the saved project agree with what is on screen. |
| `Ifc` | The live ifcopenshell file per model, and the entity behind a pick. |
| `Loader` | Opening, converting and clearing models. Drag and drop. |
| `Federation` | The project file (`.ifcfed`): models, groups, transforms, home view. |
| `Element`, `Pset` | Attributes, property sets and quantities of an entity. |
| `Terminal` | The in-browser JavaScript sessions. |

Camera, selection, visibility, colour and navigation have no tool of their own. A tool would only forward one call, so operators call the viewer directly: `tool.Viewer.get().hide( ids )`, `tool.Viewer.get().setCamera( view )`.

## `bonsai.store`

```js
store.models   // [ { id, name, file } ], one per model, in load order
store.scene    // { background, unit, falseOrigin, fog, grids }, read-only
```

Each model entry is:

- `id`: the viewer source id, counting up from 0.
- `name`: the file name, `.ifc` or `.ifcview`.
- `file`: the open ifcopenshell file, or null while only the geometry (`.ifcview`) is loaded.

### `store.scene` is read-only

The scene state lives inside the viewer, not in JavaScript. Writing `store.scene.background = '#000'` could not change what is drawn, so it is not allowed: the object is frozen and every field is a getter, and the assignment throws a `TypeError`.

Each field asks the right place every time it is read, so it can never be out of date:

| Field | Comes from |
|---|---|
| `background` | The last value set with `tool.Scene.setBackground`. The viewer cannot report its background, so the tool remembers it. |
| `unit` | The project file, which `tool.Scene.setUnit` writes. |
| `falseOrigin` | The viewer. This includes the origin the viewer picks on its own when the first model loads. |
| `fog` | The viewer. |
| `grids` | The viewer. |

To change one, call the operator. It updates the viewer, the value, and the panels:

```js
ops.Scene.SetBackground( '#eeeeee' );
ops.Scene.SetFederationUnit( { name: 'METRE', prefix: 'MILLI' } );
```

Inside an operator, call the tool instead: `tool.Scene.setBackground( color )`.

## `bonsai.context`

`context` answers "what is current?". It is also the object every operator and panel receives.

```js
context.scene          // the same object as store.scene
context.camera         // { target, distance, yaw, pitch, eye, ortho }
context.controls       // { preset, section, fly, ortho, grid, axes, fog, xray, outline }
context.activeObject   // the last pick { objectId, guid, sourceId, ... }, or null
context.selectedIds    // selected objectIds, ascending
context.activeModel    // the store.models entry of activeObject, or null
context.signals        // the event bus
context.dom            // the page element Bonsai was given
context.viewport       // the element Bonsai owns for the canvas and its overlays
```

Every value is plain data. You can keep it, compare it, log it or hand it to another function. Nothing on `context` changes the scene.

`camera`, `controls` and `selectedIds` ask the viewer when you read them, and return a new object each time. Before the viewer exists they are null, null and `[]`.

`activeObject` is the last thing picked in the viewport or in the spatial tree. It is cleared when the models are cleared.

### Saving and restoring the camera

`context.camera` is a copy. Changing it changes nothing until you give it back:

```js
const view = context.camera;
// ... later
tool.Viewer.get().setCamera( view );

// or change one field
ops.Viewer.SetCamera( { yaw: 90 } );
```

`eye` is worked out by the viewer from the other fields; setting it has no effect.

## `bonsai.ops`

Every operator has a two-part PascalCase name, `Category.Name`, and is called as a function:

```js
ops.Viewer.HideSelected();          // hide what is selected
ops.Viewer.HideSelected( ids );     // hide these ids
ops.Viewer.SetStandardView( 'TOP' );
await ops.Project.New();
ops.undo();
ops.redo();
```

An operator returns `{ status: 'CANCELLED' }` when it cannot run, for example before the viewer exists. Otherwise it returns what its `execute()` returns, which may be a Promise.

`ops.execute( name, context, ...args )` runs an operator from its name as a string. The ribbon config uses it; code should call the function form.

### Writing an operator

Operators live in a module's `operators.js`, for example `src/modules/my-addon/operators.js`:

```js
import { Operator } from '../../ops.js';
import tool from '../../tool/index.js';

class CountWalls extends Operator {

	static operatorName = 'MyAddon.CountWalls';
	static operatorLabel = 'Count Walls';

	poll() {

		return Boolean( tool.Ifc.get() );

	}

	execute() {

		return { status: 'FINISHED', result: tool.Ifc.get().byType( 'IfcWall' ).length };

	}

}

export default [ CountWalls ];
```

List the module in `src/modules/operators.js` and it is registered at boot. After that, `bonsai.ops.MyAddon.CountWalls()` runs it.

- `poll()` returns false to cancel. The default is true.
- `static undoable = true` records the operator; `undo()` must then reverse it, and `execute()` runs again for redo.
- `register` throws if the name is not `Category.Name` in PascalCase.

### Built-in operators

| Category | Operators |
|---|---|
| `Viewer` | `HideSelected`, `ShowSelected`, `ShowAll`, `HideAll`, `IsolateSelected`, `Hide`, `Show`, `SetVisible`, `SetColor`, `ClearColors`, `SetSelection`, `AddToSelection`, `RemoveFromSelection`, `ClearSelection`, `SelectGlobalId`, `ViewAll`, `FrameSelection`, `SetStandardView`, `SetCamera`, `SetNavPreset`, `ToggleProjection`, `ToggleFly`, `ToggleSection`, `ClearSection`, `ToggleGrid`, `ToggleAxes`, `ToggleXray`, `ToggleSelectionOutline`, `Measure`, `AddMeasurePoint`, `UndoMeasurePoint`, `ClearMeasure` |
| `Scene` | `SetBackground`, `SetFog`, `ToggleFog`, `SetFederationUnit`, `SetFalseOrigin`, `SetModelTransform`, `ClearModelTransform` |
| `Project` | `New`, `OpenFile`, `OpenBag`, `LoadIfc`, `LoadSample`, `Download`, `DownloadView`, `Clear`, `ListModels`, `Benchmark` |
| `Spatial` | `Select`, `Isolate`, `Objects`, `Hidden` |
| `Properties`, `Settings`, `Georeferencing`, `Profiler`, `Terminal`, `Dropbox` | Panel toggles and module actions |

## Viewer events

Clicks, box selections and finished model loads come from the viewer, not from the user calling an operator. `src/modules/viewer/events.js` turns them into signals:

| Viewer event | Signal |
|---|---|
| Click on an object | `objectPicked` |
| Selection changed | `selectionChanged`, then `objectPicked` for the active object |
| Model finished loading | `modelLoaded` |
| A tool flag changed (section, fly, x-ray, ...) | `viewerToolsChanged` |

```js
context.signals.objectPicked.add( ( pick ) => console.log( pick?.guid ) );
```

## Large models

A federation can hold millions of objects, so nothing here keeps one JavaScript record per object.

- Objects stay in the viewer. JavaScript refers to them by `objectId`.
- `store` grows by one entry per model.
- Reading `context` is cheap. Only `selectedIds` grows with the selection.
- `getObjects()` builds the object table for every loaded model, so it runs only when a pick needs a name or class the table does not have yet, or when a panel such as the spatial tree asks for it.
- Signals carry ids, never object records.

## Open questions

- Should `context.selectedIds` be a `Uint32Array` instead of an array? It would be cheaper when selecting everything in a large model.
- Should an operator be callable with a different context than `bonsai.context`?
- `Operator` is not exported from `@aeco-dev/bonsaiweb`, so code outside this repository cannot write an operator yet. Should it be?
