# `.ifcfed` for Bonsai Web

An `.ifcfed` file is a project. It does not contain geometry. It records which models belong together, how they sit in one scene, and the camera to restore. BonsaiViewer reads and writes that file in `src/ifcviewer/Federation.cpp` (schema `ifcfed/1`). The WebGPU viewer already applies the same placement; it does not parse the file. Bonsai Web has to own the document and drive the viewer API that already exists.

`app/index.html` only boots the GUI. The work belongs in the project module and a small document object, the same split BonsaiViewer uses between `Federation` and the viewport.

## What the viewer already does

IfcViewer keeps one world. Each loaded model is placed by composing four stages, all as metres matrices:

```text
FederatedFalseOrigin · ModelTransformation · CoordinateOperation · Placement
```

| Stage | Scope | Where it comes from | Who changes it |
|-------|--------|---------------------|----------------|
| Placement | each element | `IfcObjectPlacement`, baked into the `.ifcview` | nobody |
| CoordinateOperation | each model | `IfcMapConversion`, baked into the `.ifcview` and applied on load | the file |
| ModelTransformation | each model | the `.ifcfed` | the user |
| FederatedFalseOrigin | the whole scene | the `.ifcfed`, or a guess | the user, or the first model |

The false origin exists so survey coordinates stay exact in float32. The models, axes, and grid do not move when it changes. The scene is drawn relative to that point. Changing the federation unit does not convert numbers already stored. It changes what those numbers mean. The default unit is metres.

The first model loaded into an empty scene guesses the false origin from the centre of its first mesh, lifted through the map conversion when there is one, plus grid north from that conversion. Calling `setFalseOrigin` turns the guess off. A saved project always calls it, even when the stored point is `0, 0, 0`, so opening a file never replaces the saved origin with a guess.

`ModelTransformation` means: rotate about `pivot` (degrees, X then Y then Z), then slide so point `a` lands on point `b`. `b` and `pivot` are in the federation unit. `a` is either **global** (after the map conversion, in the model's map unit) or **local** (before it, in the project's length unit). The call is safe before the model has finished streaming.

These viewer methods are already wrapped as operators in `src/modules/viewer/operators.js`:

| Operator | Viewer call | `.ifcfed` field |
|----------|-------------|-----------------|
| `Scene.SetFederationUnit` | `setFederationUnit({ name, prefix })` | `config.unit` |
| `Scene.SetFalseOrigin` | `setFalseOrigin({ xyz, rzDeg })` | `federated_false_origin` |
| `Scene.SetModelTransform` | `setModelTransform(sourceId, { a, b, rotationDeg, pivot, aFrame })` | `model_transformation` |
| `Scene.ClearModelTransform` | `clearModelTransform(sourceId)` | omit the object (identity) |
| `Viewer.SetCamera` | `setCamera` | `home_view` |

`aFrame` in the file is `"ModelGlobal"` or `"ModelLocal"`. The viewer wants `'global'` or `'local'`. Rotation in the file is `rxyz_deg`; the viewer wants `rotationDeg`. Grid north in the file is `rz_deg`; the viewer wants `rzDeg`.

The survey panel (`src/modules/georeferencing/ui.js`) already edits the unit and the false origin live. It does not write them back into a project file.

## The file

UTF-8 JSON, schema string `ifcfed/1`. Unknown schemas warn and still load. Paths of local models are relative to the `.ifcfed` directory when the file lives under that tree, absolute otherwise. A nested `.ifcfed` is not a valid model source.

```json
{
  "schema": "ifcfed/1",
  "name": "Site",
  "created": "2026-10-20T10:00:00Z",
  "modified": "2026-10-20T10:00:00Z",
  "config": { "unit": { "name": "METRE", "prefix": "" } },
  "federated_false_origin": { "xyz": [394221, 5812004, 12], "rz_deg": 0 },
  "groups": [
    {
      "id": "g1",
      "display_name": "Architecture",
      "groups": []
    }
  ],
  "models": [
    {
      "id": "m1",
      "display_name": "ARC.ifc",
      "source": { "connector": "local", "path": "ARC.ifc" },
      "model_transformation": {
        "a_frame": "ModelGlobal",
        "a": [0, 0, 0],
        "b": [10, 0, 0],
        "rxyz_deg": [0, 0, 90],
        "pivot": [0, 0, 0]
      },
      "group_id": "g1"
    }
  ],
  "home_view": { "target": [0, 0, 0], "distance": 50, "yaw": 45, "pitch": 30 }
}
```

Defaults are omitted on save: an identity `model_transformation`, `visible: true`, an empty `group_id`, and an empty group tree. `visible: false` is written only when something is hidden. `home_view` is `null` when the project has no saved camera.

`id` values are stable strings generated once and kept across saves. They are not the viewer's `sourceId`. `sourceId` is assigned when a file is streamed and dies with the session. The host keeps `{ federationId → sourceId }` the way `SessionState` keeps `{ model id → session model id }`.

A model is drawn when its own `visible` is true and every ancestor group's `visible` is true. Groups nest. Removing a group reparents its children one level up. A `group_id` that does not exist is dropped to the root, with a warning.

`home_view` is the drawing-frame camera (`target`, `distance`, `yaw`, `pitch` in degrees). Apply it once after the models are queued. It is not a world-space bookmark.

A sibling file named `<project>.ifcfed.manifest` means the project came from a cloud connector. BonsaiViewer uses that for pull and push. Leave it unread until a web connector exists. Models whose `source.connector` is not `"local"` stay in the document and are not loaded from a path.

## How BonsaiViewer opens one

`openProjectAt` in `src/bonsaiviewer/modules/project/Commands.cpp`:

1. Refuse while a load is in progress. Ask before discarding a dirty project.
2. `Federation.load`. This replaces the in-memory document and clears the dirty flag inside load.
3. Clear the viewport and the id map.
4. For each local model whose path exists, queue that file and record `federation id → session model id`. A missing path stays in the document and produces a warning. The model is not dropped.
5. Apply `home_view` when the file has one.
6. Emit project-opened. Cloud sources are resolved after that, by a connector, into local cache paths, then loaded the same way.

Adding a file with **Add Model** is the other entry. If the session has no models yet, the viewport is armed to guess the false origin when the first mesh arrives. That guess is skipped when `filePath` is set (an opened project owns the origin) and when the origin is already not the default. After the guess, the camera frames the federated origin, capped at 100 m. The web viewer already guesses and frames on its own when `setFalseOrigin` has not been called, so an untitled session can keep doing that. An opened `.ifcfed` must call `setFalseOrigin` from the file before or as the models load.

Saving writes the JSON, updates `created` / `modified`, and marks the document clean. The viewport is not reloaded.

## The web package

The browser never sees a disk path. It sees a bag of named bytes. The `.ifcfed` is the same JSON BonsaiViewer writes. Every local model is `source.connector: "local"` and `source.path` is a relative path using `/`, with no leading slash and no `..`. That path is the name of a file in the same bag.

```text
Site.ifcfed
ARC.ifc
ARC.ifcview
structure/STR.ifc
structure/STR.ifcview
```

`source.path` names the model, usually the `.ifc`. The `.ifcview` with the same stem is the sidecar, the pair the per-model download already writes. A directory in the path (`structure/STR.ifc`) keeps two models from sharing a filename.

`src/tool/federation.js` holds the document and the path rules. `Loader.openProjectBag` is the only opener. A zip, a dropped folder, and a future connector all hand it `{ path, bytes }` entries.

| How the bytes arrive | Code | What it does |
|----------------------|------|----------------|
| Zip with an `.ifcfed` | `Loader.loadLocalFile` | Reads every entry and calls `openProjectBag`. |
| Zip with no `.ifcfed` | `Loader._openModelZip` | Today's one `.ifc` / `.ifcview` pair. Unchanged. |
| Dropped folder or several files, one of them an `.ifcfed` | `Loader.collectDrop` → `Project.OpenBag` | Walks the drop and calls the same opener. |
| One dropped file, or several files and no `.ifcfed` | `Project.LoadIfc` | Each file loads on its own and is appended to the document. |
| Connector, later | not built | Fills the same `{ path, bytes }` list, then `openProjectBag`. |

`bagFromEntries` builds the map. One shared first folder is removed, so a zip of the `Site` folder (`Site/Site.ifcfed`, `Site/ARC.ifc`) matches `source.path` of `ARC.ifc`. A flat zip is left as it is. Entries under `__MACOSX/` and `.DS_Store` are ignored. Lookup is case-sensitive, then one case-insensitive match. Two `.ifcfed` files after that strip is an error. None means it is not a project.

A sibling `<name>.ifcfed.manifest` in the bag is parsed onto the document and not written into the downloaded zip. It is the pointer a connector will use. Models whose `source.connector` is not `"local"` stay in the JSON and are not drawn.

## Open

`Project.OpenFile` accepts `.ifc`, `.ifcview`, `.ifcfed`, and `.zip`. A lone `.ifcfed` opens the document and warns for every missing model. A project zip replaces the scene.

`Loader.openProjectBag`:

1. Parse the `.ifcfed`. Warnings cover an unknown schema, a missing `source.path`, a nested `.ifcfed`, and an unknown `group_id` (the model moves to the root).
2. `Loader.clear()`. While a project is opening this does not wipe the document. It does call `clearScene`, which resets the viewer's false origin.
3. `setFederationUnit`, then `setFalseOrigin`, from the file. That turns the automatic guess off. The same two calls run again after every model is queued, because the first `addFile` of an empty scene calls `clearScene` again.
4. For each local model, resolve `source.path`:
   - A real `.ifcview`: stream it. Bytes that start with `ISO-10303-21` are an `.ifc` even when the name says `.ifcview`, and they are converted.
   - `.ifc` plus the `.ifcview` beside it: stream the sidecar and open the `.ifc` live, the same fast path as a model zip.
   - `.ifc` alone: convert it.
   - Anything missing: warn, and leave the model in the document.
5. `setModelTransform` for a model that has a `model_transformation`. The federation id and the viewer `sourceId` are different. `Federation.bind` remembers the pair.
6. A model is hidden when its own `visible` is false or any ancestor group is hidden. `project.model_loaded` hides that source's object ids once they exist.
7. `home_view` is applied once, from `project.model_loaded`, when the last queued model has arrived. That is after the viewer's own frame. An empty project applies it immediately.

Loading a single `.ifc` outside a project appends a local model. `source.path` is the `.ifc` filename. The streamed sidecar is named beside it and is not the path. A geometry-only `.ifcview` keeps that name as its path. Clear drops the document.

## Download

**Save project** on the Project ribbon, and the download control on the project panel, run `Project.Download`.

It reads the current false origin and camera into the document (`Federation.captureViewer`), then writes one STORE zip with `writeStoredZip`:

```text
Site.ifcfed
ARC.ifc
ARC.ifcview
```

`Site` is the project name. Bytes come from `Loader.bundle`: the `.ifc` kept for the row download, or `file.toString()` when only a live file exists, and the `.ifcview` `File`. The `.ifcfed` uses those entry names as `source.path`. Two models with the same filename get a directory prefix (`m2/ARC.ifc`), and that prefix is what the JSON stores. A model with no bytes stays in the JSON, is left out of the archive, and warns. A cloud `source` is copied through unchanged. The manifest is not an entry.

The per-model download dialog is still one `.ifc`, one `.ifcview`, or a zip of that pair. It has no `.ifcfed`.

## What the document remembers

Edits go into the document and then the viewer, so the next download matches the screen.

| Edit | Operator | Stored field |
|------|----------|----------------|
| Survey unit | `Scene.SetFederationUnit` | `config.unit` |
| Survey point | `Scene.SetFalseOrigin` | `federated_false_origin` |
| Position dialog, or any `setModelTransform` | `Scene.SetModelTransform` | `model_transformation` |
| Reset placement | `Scene.ClearModelTransform` | field omitted (identity) |
| Model checkbox | `Federation.setVisible`, then show or hide the object's ids | `visible` |

The position dialog writes `b` and a Z rotation. Opening a file that has a fuller transform shows that `b` and Z in the dialog and sends the whole transform to the viewer. Group checkboxes are not in the panel. A hidden group still hides its models on open. The checkbox after that sets the model's own flag.

Save does not reload the viewport. The downloaded `.ifcfed` omits the same defaults BonsaiViewer omits, so either app opens the other's file.

## A connector later

A connector does not get a loader. It returns `{ path, bytes }` for each model it can fetch, using the same relative names, and `openProjectBag` runs. Downloading a zip from that session writes a static snapshot: fetched models are `connector: "local"` with those paths. The project on the connector stays as it is. Pushing the bag back is a later call. Until then, a non-local `source` round-trips in the JSON and is not drawn.
