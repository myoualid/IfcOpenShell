<!-- This file was generated with the assistance of an AI coding tool. -->

# Mesh sources: host-supplied geometry in the IfcViewer

Status: draft spec, nothing implemented.

## 1. Summary

The viewer can take meshes from a host page or app, not only from IFC. A
**mesh source** is a model in the federation whose geometry comes from the
host. It gets a source id like any other model.

The design has one rule: **the renderer never sees a new kind of model.** A
mesh source is converted to an ordinary `.ifcview` in memory as it arrives,
then loaded through the same `addFile` / `appendPart` path a dropped file
uses. Selection, sections, streaming, eviction, unload and reload, picking,
x-ray, measuring and the GPU budget then run the code they run today. None of
it changes, so none of it can break.

The same bytes are what gets saved. A mesh source in a project is a `.ifcview`
file referenced from the `.ifcfed` with `kind: "mesh"`. The current format
(v19) already holds everything needed, so there is no format bump.

Federation is defined once. bonsaiweb and bonsaiviewer read and write the same
`ifcfed/1` document with the same rules. bonsaiweb is a web implementation of
bonsaiviewer's federation, not a different design. Section 8 lists what
bonsaiweb is missing today.

The viewer is not a scene graph like three.js or Babylon.js. It draws large,
static, instanced triangle sets and keeps georeferenced models lined up. Mesh
sources follow that model: you hand over a batch of geometry, it becomes a
model, and from then on you move, hide, colour and pick it.

## 2. Why the direct-load path is not used

`ViewportCore` has a second way in: `uploadStreamedMesh`,
`uploadStreamedInstance`, `finalizeModel`. Desktop `SceneLoader` uses it to
show an IFC file while it is being processed. It is the obvious candidate, and
it is the wrong one for mesh sources. A model loaded this way differs from a
`.ifcview` model in ways that touch exactly the features that must not break:

| | `.ifcview` model | direct-load model |
|---|---|---|
| Chunk refill | `driveStreamingLoads` refetches evicted chunks | skipped: `streaming_file_path` is empty (`ViewportCore.cpp` candidate loop and idle check) |
| Eviction | evicted chunks come back | `evict_one_lru`, `evict_lowest_priority_than` and `evictChunksInSubBuffer` still pick its chunks, which **never come back** |
| `unloadModel` then `loadModel` | chunks stream back | model comes back with no geometry |
| Element table (pick → name, key) | lazy element block | none |
| Georef | from the file | identity |
| Chunk plan | baked TOC | re-derived at load |

The eviction row is a bug in the direct-load path today, separate from this
spec. On the desktop, a live-loaded IFC can lose off-screen chunks when
another model streams under memory pressure. They stay missing until the file
is reopened from its `.ifcview`. It should be fixed on its own: either pin
direct-load chunks in all three evictors, or give direct-load models a refill
source.

Routing mesh sources through `.ifcview` avoids every row of that table.

## 3. Impact on existing features

Everything below holds because a mesh source is a `.ifcview` model by the time
the renderer sees it. Each row names the code that makes it true.

| Feature | Effect | Why |
|---|---|---|
| Selection, active object, outline | unchanged | `object_id` is model-local from 1 and rebased by `modelObjectIdBase` at install, like any model. The selection flags and x-ray hit bits are sized from the total id count, so they grow by the mesh source's key count. |
| Pick → element | unchanged | `elementForObject` reads the element block, which the in-memory bake writes. Picks report `source_id` like a file. |
| Visibility, isolate, colour override | unchanged | Same per-object paths. |
| Sections | unchanged | Section planes are world-space and clipped in the fragment shader (`is_section_clipped`) for every instance. Mesh sources are clipped like IFC. |
| X-ray, marquee | unchanged | Same pick and box-pick passes. |
| Measuring | unchanged | Uses `findInstance` and the placement, like IFC. |
| Streaming | unchanged | A `Blob` source is byte-range read like a dropped `File` (`streaming_from_web`). Contribution culling, priorities and the in-flight cap apply. |
| Eviction, GPU budget | unchanged | Mesh-source chunks compete in the same pool by the same priority. A context layer can never take more than an IFC model of the same size would. |
| Unload / load model | unchanged | Chunks stream back from the `Blob`. |
| Federation transforms, false origin | unchanged | `ModelGeoref` from the file; `composeInstanceFromPlacement` as for IFC. |
| OPFS cache | not used | The bytes are already local. A host that wants a mesh source to survive a reload saves it (section 7). |

### 3.1 Performance

The renderer does no extra work per frame. The costs are all at ingest, and in
how the host shapes its data:

- **Bake cost.** Quantizing, building the chunk layout and writing frames is
  linear in vertex and index count and runs once. v1 runs it in the viewer's
  wasm on the main thread, so a very large payload stalls the page while it
  bakes. `appendMeshes` bakes each part as it arrives, so tiled data never
  bakes in one block. Moving the bake into a worker is a later step (10).
- **Memory.** The baked bytes live in a `Blob`, outside the wasm heap. The
  heap is capped at 4 GB and already holds every model's metadata. Keeping a
  CPU copy of the geometry in the heap, which the direct-load path would need,
  would compete with that.
- **Mesh size.** Culling, contribution and eviction work per chunk, and a
  chunk is a group of meshes. One 2 km terrain mesh is never culled and is
  always one large upload. Ingest splits meshes by quantization step
  (section 5), which keeps chunks small enough to cull and evict.
- **Object count.** Every distinct key is one object id: 4 B of selection
  flag and 1 bit of hit flag, and one entry in `getObjects()`. 100 000 trees
  as 100 000 keys works, but a host that never picks a single tree should give
  them one key.
- **Transparency.** Alpha below 1 sends instances to the transparent pass.
  Large translucent context (a see-through terrain) costs fill rate like
  translucent IFC glazing does.
- **No LOD1 on the web.** The web build has no meshoptimizer, so a mesh source
  baked in the browser has LOD0 only, the same as a live-loaded IFC on the
  desktop. Bakes on the desktop or a server get LOD1.

### 3.2 What must be verified

These are checks for the implementation, not open design points. They go in
the Playwright suite (`src/ifcviewer-web/tests`) next to the existing
federation, memory and model-order specs:

- a mesh source next to `georef-a.ifcview` lines up and picks return its key
- section, x-ray marquee and isolate behave the same with and without a mesh
  source loaded
- under a reduced memory budget, chunks of both models are evicted and come
  back as the camera moves
- `unloadModel` / `loadModel` on a mesh source restores its geometry
- `clearScene` frees the `Blob` and the source slot

## 4. Data contract

One shape for the JS API, the C++ front end and the offline baker. JS spelling:

```ts
interface MeshSourceData {
  name?: string;

  // Length unit of positions and placements. Default "m".
  units?: "m" | "mm" | "cm" | "ft" | "in" | { metres: number };

  // How this source's coordinates map to the shared world. Omitted: they are
  // already world coordinates (the projected CRS and datum the IFC models'
  // map conversions land in).
  georef?:
    | { eastings: number; northings: number; orthogonalHeight: number;
        xAxisAbscissa?: number; xAxisOrdinate?: number; scale?: number }   // IfcMapConversion terms
    | { matrix: Float64Array /* 16, column-major, metres in, metres out */ };

  meshes: MeshData[];
  instances: InstanceData[];

  // Per object key; optional. Keys without an entry still pick and select.
  objects?: Record<string, { name?: string; type?: string }>;
}

interface MeshData {
  positions: Float32Array | Float64Array;  // xyz per vertex, mesh-local
  indices: Uint32Array | Uint16Array;      // triangles only
  normals?: Float32Array;                  // omitted: computed
  colors?: Uint8Array;                     // RGBA per vertex
  color?: [number, number, number, number];// one RGBA (0..1) for the whole mesh
}

interface InstanceData {
  mesh: number;                 // index into meshes
  key: string;                  // stable object identity, unique in the source
  placement?: Float64Array;     // 16, column-major; default identity
  color?: [number, number, number, number]; // override, as setColor
}
```

- Instances may share a mesh, and instances may share a key (one object in
  several parts, like an IFC element with several representations). A key is
  one object id.
- `Float64Array` positions are rebased per mesh about its box centre, in
  double, and the offset is folded into each placement. This is what
  `buildStreamedMesh` does with `rebase_offset`.
- Missing normals are computed: area-weighted, split at a 30° crease so boxes
  stay sharp.
- Triangles only. Lines and points are out of scope (section 9).

## 5. Coordinates and georef

- The world is the one in `src/ifcviewer-web/web/FEDERATION.md`. An IFC model
  with an `IfcMapConversion` lands at its map coordinates in metres.
- A mesh source lands at `CoordinateOperation · placement`. Its
  `CoordinateOperation` is built from `georef` the way `computeModelGeoref`
  builds one for IFC, and stored in the same `ModelGeoref` slot of the
  `.ifcview`. A mesh source and an IFC model with the same map conversion land
  in the same place, and `ModelTransformation` means the same for both.
- **The viewer does not reproject.** There is no PROJ in the wasm. The host
  delivers coordinates in the federation's projected CRS and vertical datum
  (proj4js, or whatever produced the data).
- **Quantization.** Positions are `u16` across each mesh's local box: 1 mm
  steps at 65 m, 3 cm at 2 km. Ingest splits a mesh into spatial tiles when
  its step would exceed a tolerance (default 5 mm). Tiled data (terrain tiles,
  3D Tiles) should arrive one mesh per tile.
- **False origin.** Same rule as bonsaiviewer: the guess is armed when a model
  is added to an empty session and consumed by the first model that arrives
  (`armFederatedFalseOriginGuess` / `consumeFederatedFalseOriginGuess`). A mesh
  source is a model like any other here. There is no per-source opt-out; a
  project that wants its origin fixed saves it in the `.ifcfed`, which already
  suppresses the guess.

## 6. Identity and metadata

- Each distinct `key` becomes one model-local object id, numbered from 1 in
  first-seen order.
- The element record holds the key in `guid`, the name in `name`, the type in
  `type`, and `ifc_id = 0`. `ElementTableRecord` already allows this. The UI
  must stop assuming `ifc_id > 0` or an `Ifc*` type. In bonsaiweb that means
  `tool/Element.js`, `tool/Ifc.js` and the properties module must handle an
  element with no live IFC entity.
- `type` is free text, by convention namespaced: `Context.Terrain`,
  `Context.Building`, `Analysis.Clash`.
- Saved per-object state (selection sets, colours, hidden objects, issue
  links) refers to `(model id, key)`, never to object ids, the same way it
  should refer to `(model id, GlobalId)` for IFC.
- Properties stay with the host. The viewer is not a property store.

## 7. API

### 7.1 Web (`web/ifcviewer.js`)

```js
// One shot. Returns the source id synchronously, like addFile, so a
// transform or name can be set before the geometry lands.
const sid = viewer.addMeshes(data, { replace: false });

// In parts (tiles arriving over the network). Same lifecycle as
// beginStream / appendPart / endStream: one source, one onModelLoaded.
const sid = viewer.beginMeshes({ name, units, georef });
viewer.appendMeshes(sid, { meshes, instances, objects });
viewer.endMeshes(sid);

// The baked .ifcview bytes, for saving. One Blob per part.
const blobs = viewer.meshSourceBlobs(sid);

// Everything else already works on it:
viewer.setModelTransform(sid, xf); viewer.unloadModel(sid); viewer.setVisible(ids, false);
```

`addMeshes` is `beginMeshes` + one `appendMeshes` + `endMeshes`.
`appendMeshes` bakes its payload to `.ifcview` bytes in the wasm, wraps them
in a `File`, and calls the existing `appendPart(sid, file)`. That is the whole
integration with the renderer.

Adapters are JS helpers outside the wasm that return `MeshSourceData`:

- `IfcViewer.meshesFromThree(object3D)`: `Mesh` children, `BufferGeometry`
  attributes, `material.color`, world matrix as placement, `name` or `uuid` as
  key, one mesh per shared `geometry`.
- `IfcViewer.meshesFromGltf(json, buffers)`: nodes to instances, primitives to
  meshes, `baseColorFactor` to colour. Textures dropped with a warning.

### 7.2 Wasm

```c
// Bakes one part. Returns a malloc'd buffer holding a v19 .ifcview, and its
// size in *out_size. The caller copies it into a Blob and frees it.
uint8_t* ifcv_bake_mesh_part_c(const MeshPartHeader* header,
                               const float* positions, const float* normals /* nullable */,
                               const uint8_t* colors, const uint32_t* indices,
                               const MeshRange* meshes, uint32_t mesh_count,
                               const InstanceRecord* instances, uint32_t instance_count,
                               const char* strings, uint32_t* out_size);
```

`MeshPartHeader` carries the unit scale and coordinate operation. The
`objects` table travels as a packed string block. Tiling and `Float64Array`
rebasing happen in JS before the call, so the wasm only sees float, mesh-local
vertices and double placements.

### 7.3 C++

The bake reuses what the desktop already uses to write `.ifcview` files:

1. Mesh ingest produces `StreamedMesh`, `StreamedInstance` and `ElementInfo`
   records, the same records the IFC streamer produces. Normal computation is
   a new pure function next to `buildStreamedMesh`.
2. `IfcViewAssembler::onMeshReady` / `onInstanceReady` / `finalize(georef,
   elements)` assemble an `IfcViewData` in chunk order with a chunk TOC.
3. A new `writeIfcViewToMemory(const IfcViewData&)` returns the bytes. On the
   desktop it compresses as `writeIfcView` does. On the web it writes **zstd
   frames made of raw (stored) blocks**: a frame header and block headers
   around the payload, valid for every zstd decoder, with no compressor
   linked. The file is 3 to 5 times larger than a compressed one, and it is a
   normal v19 file.

Build changes: `IfcViewAssembler.cpp` and `IfcViewLayout.cpp` join
`IfcViewerCore`; the in-memory writer is compiled for both targets. The
desktop-only `IfcViewWriter.cpp` stays as it is.

## 8. Federation: one design, two implementations

bonsaiviewer (`src/ifcviewer/Federation.*`, `src/bonsaiviewer/modules/models`,
`modules/project`) is the reference. bonsaiweb (`src/bonsaiweb/src/tool/federation.js`
and its project module) implements the same thing for the web. Mesh sources
are added to both in the same change.

### 8.1 Where they already agree

- Both read and write `ifcfed/1` with the same keys: `config.unit`,
  `federated_false_origin` (`xyz`, `rz_deg`), `groups`, `models[]` (`id`,
  `display_name`, `source.connector`, `source.path`, `model_transformation`,
  `visible`, `group_id`), `home_view`.
- Both keep group visibility as a chain (`chainVisible` /
  `isGroupChainVisible`) and paths relative to the project.

### 8.2 What bonsaiweb is missing

Compared with the desktop commands (`modules/models/Commands.h`,
`modules/project/Commands.h`):

| bonsaiviewer | bonsaiweb today |
|---|---|
| add, rename, move, remove group | groups are read and written back, not editable |
| rename model, move models to a group | no |
| remove model | no; only clear the whole project |
| unload / load model | viewer API exists, no project command |
| view models (frame selected models) | no |
| set home view from the camera | read from the file and written back only |
| false-origin guess armed only when adding into an empty session | the wasm guesses on the first model unless an origin was set |
| save as, recent projects | download a zip |
| cloud connectors (`source.connector` ≠ `local`) | Dropbox module, no connector model in the document |

`WebFederation.h` says on purpose that it is "NOT an .ifcfed reader". That
stays true: the document model lives in bonsaiweb's `federation.js`, and
`WebFederation` stays the thin placement layer it is. What changes is that
`federation.js` follows `Federation.cpp` method for method, with the same
rules: the same no-ops on unknown ids, the same group reparenting on remove,
the same cycle check on move, the same dirty tracking.

The way to keep them aligned is **shared fixtures**: a set of `.ifcfed` files
plus expected results (round-trip output, effective visibility per model,
warnings) checked by both `src/ifcviewer/tests/test_federation.cpp` and
`src/bonsaiweb/tests/federation.test.mjs`. A rule changed in one
implementation fails the other's tests until it is ported.

### 8.3 Mesh sources in `.ifcfed`

```json
{
  "id": "6f1c…",
  "display_name": "Site context",
  "source": {
    "connector": "local",
    "kind": "mesh",
    "path": "context/site-context.ifcview",
    "origin": { "adapter": "gltf", "uri": "context/site.glb", "crs": "EPSG:2154" }
  },
  "group_id": "context"
}
```

- `kind` missing means `"ifc"`, so existing projects read unchanged in both.
- `kind: "mesh"`: `path` is the `.ifcview` itself. There is no `.ifc` to look
  for. Both sides need this special case: bonsaiweb's `ifcPathFor` maps
  `foo.ifcview` to `foo.ifc`, and the desktop's `ifcViewPathFor` maps the
  other way. For a mesh source neither applies. The desktop loader must also
  accept a bare `.ifcview` as a model source.
- `origin` is provenance: how to rebuild the file. It is optional and neither
  viewer acts on it in v1.
- A multi-part mesh source saves one file per part:
  `"paths": ["context/site.part0.ifcview", …]`, loaded with `beginStream` /
  `appendPart`, as bonsaiweb already does for a multi-part `.ifcview`.
- Saving: bonsaiweb's project zip (`archiveFiles`) writes
  `meshSourceBlobs(sid)` under the model's path; the desktop writes the
  `.ifcview` next to the `.ifcfed`. A mesh source that was never saved is
  transient: saving the project writes it, closing without saving drops it.
- Old readers ignore `kind` and `origin` and would drop them on save. The
  path still loads as a `.ifcview`, so the model survives without its
  provenance.

## 9. Out of scope for v1

- **Textures and UVs** (orthophoto on terrain). Needs UVs in the vertex format
  (format bump), a textured pipeline and texture residency in the GPU budget.
  Its own spec. Until then, bake colour into vertex colours.
- **Lines and points** (alignments, survey points). Better as an annotation
  API on `OverlayRenderer`.
- **Editing geometry in place.** Replacing a mesh source is remove + add.
  Moving one object (`setInstancePlacement(source, key, m)`, one SSBO slot
  rewrite) is cheap and can come later if there is a need.
- **Reprojection.** Host side (section 5).
- **Materials beyond RGBA.** The viewer has one shading model.

## 10. Plan

Each step is its own PR.

1. **Fix direct-load eviction** (section 2). Independent of mesh sources; it
   affects the desktop today.
2. **In-memory bake.** `IfcViewAssembler` and `IfcViewLayout` in
   `IfcViewerCore`, `writeIfcViewToMemory` with a stored-block zstd writer,
   normal computation. C++ test: bake, read with `IfcViewReader`, same meshes,
   instances, keys and georef.
3. **Web API.** `ifcv_bake_mesh_part_c`, `addMeshes` / `beginMeshes` /
   `appendMeshes` / `endMeshes` / `meshSourceBlobs` over `appendPart`.
   Playwright tests from 3.2.
4. **Federation parity in bonsaiweb** (8.2), with the shared fixtures. This
   does not depend on mesh sources and can run alongside 2 and 3.
5. **`kind: "mesh"` in both federations** (8.3), and the UI changes for
   elements without an IFC entity (section 6).
6. **Adapters and offline baker.** `meshesFromThree`, `meshesFromGltf`; a
   CLI or Python entry point that bakes glTF to `.ifcview` with LOD1.
7. **Later:** bake in a worker; a format bump for source kind, generator and
   an optional properties block, if needed.

## 11. Open questions

- Crease-angle normals by default, or flat normals (cheaper, more vertices)?
- Where does the offline baker belong: an IfcConvert input mode, a Python
  function in `ifcopenshell`, or a tool next to the web build?
- Should bonsaiweb get a connector model in the document (8.2, last row)
  before or after mesh sources? Dropbox is the first web connector.
