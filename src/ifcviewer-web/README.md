<!-- This file was generated with the assistance of an AI coding tool. -->

# ifcviewer-web

WebAssembly build of the IfcViewer core. Emscripten compiles `IfcViewerCore` into `IfcViewerWeb.js` and `IfcViewerWeb.wasm`. `web/ifcviewer.js` is plain JavaScript: the build copies it next to those files. It is not compiled.

The result is a static site. Serve the build directory over `http://localhost` (WebGPU needs a secure context) and open it in Chrome or Edge.

This build is separate from `@ifcopenshell/wasm`. It does not use `nix/build-all.py`.

## How geometry works

The web viewer does not tessellate IFC. OpenCASCADE and IfcGeom stay in the desktop build. What wasm loads is a baked sidecar, a `.ifcview` (format version 19, `src/ifcviewer/IfcViewFormat.h`). The page checks the first 12 bytes (`magic`, version, endian) and refuses a file from another version. `web/ifcviewer.js` passes that version as `sidecarFormatVersion`.

Baking happens once, on the desktop. The geometry iterator emits one mesh per unique shape and one instance per placed product. Vertices are stored in the mesh's local coordinates and quantized to 12 bytes:

| Bytes | Field |
|---|---|
| 0–5 | Position, three `uint16` values in `[0, 1]` across that mesh's local AABB |
| 6–7 | Normal, two `int8` values, octahedral encoding |
| 8–11 | Color, four `uint8` values |

The vertex shader expands the position with the mesh AABB and decodes the normal. A mesh used many times is stored once; each placement is an instance. On disk an instance is a mesh id, an object id, a `double` translation, and a `float` 3×3 linear part. The full float matrix is built at load, after the federation false origin, the model transform, and the model's `IfcMapConversion` have been applied, so large survey coordinates stay exact until they are cancelled down to viewport size.

Meshes above 500 triangles also get a second index list, LOD1, from meshoptimizer (about a quarter of the triangles, stopped if the error passes 5%). LOD1 reuses the same vertices. A mesh with no LOD1 is drawn at full resolution at every distance.

Before the file is written, meshes are sorted by a 3D Morton code of their centroids and packed into chunks of at most 4 MB of vertex bytes (`ChunkPlanner`). That order is stored in a chunk table of contents. The loader must not recompute it: the float Morton codes are not bit-identical between the x86 baker and the wasm loader, and a recomputed plan would split a chunk across the file. Each chunk is then two independent zstd frames, vertices and indices, so one HTTP Range (or one `Blob.slice`) fetches one chunk.

The file, after the 12-byte header and a `uint64` geometry-section length, is:

1. Geometry section. One pair of zstd frames per chunk.
2. Geometry metadata, one zstd frame: mesh dictionary, instances, coordinate operation, chunk table. The loader finishes this before it can request any chunk, and it is what first paint waits on.
3. Element metadata, one zstd frame: element table and string table (id, GlobalId, name, type). Used for picking and the object list, never for drawing. The web loader fetches it lazily, per model, the first time something asks for objects.

At runtime `load_ifcview_from_source_c` never copies the file into the wasm heap. `web/ifcviewer.js` reads ranges from a picked `File` or from a remote URL. Metadata sets up instances, AABBs, and culling immediately. Each frame the camera asks for the chunks it can see; at most six are in flight, so the first ones finish and paint instead of the connection being split across the whole model. A finished chunk is decompressed and uploaded into a GPU buffer pool. Chunks that fall out of view can be evicted and fetched again. `addUrl(url, { cache: true })` writes those same ranges into the origin private file system, so a later visit that already has the bytes issues no geometry requests.

The link step embeds `sample.ifcview` so the example pages draw something before a file is picked. Regenerate that fixture with `python make_sample.py` from this directory. The script writes a small IFC (a slab, a wall, and a beam) and a georeferenced pair, then runs the desktop `sidecar_bake` tool. Point `SIDECAR_BAKE` at that binary when it is not at `build-viewer/ifcviewer/sidecar_bake`. Changing `sample.ifcview` relinks the wasm.

## What you get

After a successful build, `build-web/` contains:

| File | Role |
|---|---|
| `IfcViewerWeb.js` | Emscripten module. Defines `createIfcViewer`. |
| `IfcViewerWeb.wasm` | The viewer. |
| `ifcviewer.js` | Copy of `web/ifcviewer.js`. Load this after `IfcViewerWeb.js`. |
| `index.html`, `embedded.html`, `scripting.html`, `IfcViewerWeb.html` | Example pages. |

## Prerequisites

- CMake 3.21 or newer, Ninja, and Git (CMake fetches the zstd decoder on the first configure).
- An activated Emscripten SDK. A checkout that has already built the IfcOpenShell wasm toolchain has one at `build/Windows/wasm/emsdk`.
- Eigen 3.3.9 or newer, header-only. Point CMake at `Eigen3Config.cmake` with `-DEigen3_DIR=...`. The wasm dependency tree ships it at `build/Windows/wasm/install/eigen-install-3.4.0/share/eigen3/cmake`.
- `sample.ifcview` in this directory. The link step embeds it. Regenerate it with `python make_sample.py` when it is missing. That script needs the Python `ifcopenshell` package and the desktop `sidecar_bake` tool.

## Windows

From the repository root, in PowerShell. `emsdk_env.sh` is not usable here: its `PATH` is POSIX-only and will not launch `emcmake.bat`.

`EMSDK_PYTHON` has to be the SDK's `python.exe`. If MSYS2 is earlier on `PATH`, `emcmake.bat` otherwise calls that `python`, which rewrites the Windows path to `emcmake.py` and CMake never starts.

The first configure also clones the zstd decoder. CMake records the first `git` it finds, and `C:\msys64\usr\bin\git.exe` cannot clone HTTPS when CMake launches it (`remote helper 'https' aborted session`). Git for Windows and the non-MSYS CMake have to come before MSYS on `PATH`. `-DGIT_EXECUTABLE` replaces a cache entry that already points at the MSYS git.

```powershell
$root = (Get-Location).Path
$emsdk = Join-Path $root "build\Windows\wasm\emsdk"
$emscripten = Join-Path $emsdk "upstream\emscripten"
$env:PATH = "C:\Program Files\Git\cmd;C:\Program Files\CMake\bin;$emsdk;$emscripten;$(Join-Path $emsdk 'upstream\bin');" + $env:PATH
$env:EMSDK = $emsdk
$env:EMSCRIPTEN = $emscripten
$env:EMSDK_PYTHON = (Get-ChildItem (Join-Path $emsdk "python\*_64bit\python.exe") | Select-Object -First 1).FullName

$eigen = Join-Path $root "build\Windows\wasm\install\eigen-install-3.4.0\share\eigen3\cmake"
emcmake.bat cmake -S src/ifcviewer-web -B build-web -G Ninja "-DEigen3_DIR=$eigen" "-DGIT_EXECUTABLE=C:/Program Files/Git/cmd/git.exe"
ninja -C build-web
```

Later edits to C++ only need `ninja -C build-web`. An edit to `web/ifcviewer.js` or an example page is copied on the next ninja run and does not relink the wasm.

That same ninja run publishes the linked module. `IfcViewerWeb.js` and `IfcViewerWeb.wasm` are copied into `src/ifcviewer-web/web/`. When the bonsaiweb checkout sits next to this repo, the same two files plus `ifcviewer.js` are copied into `IfcOpenShell-bonsaiweb/src/bonsaiweb/vendor/@ifcopenshell/viewer`. A missing vendor directory is skipped. Reconfigure with `-DIFCVIEWERWEB_BONSAIWEB_VENDOR_DIR=` to turn that copy off, or point it somewhere else.

## Examples

The pages under `web/` load `IfcViewerWeb.js` from that same folder. After `ninja -C build-web` the module is already there:

```powershell
python -m http.server --directory src\ifcviewer-web\web 8080
```

Open `http://localhost:8080/`. `IfcViewerWeb.js` and `IfcViewerWeb.wasm` are build output and are gitignored.

## Linux and macOS

```bash
source /path/to/emsdk_env.sh
emcmake cmake -S src/ifcviewer-web -B build-web -G Ninja \
    -DEigen3_DIR=/path/to/eigen3/cmake
ninja -C build-web
```

Configure through `emcmake`. A non-Emscripten toolchain stops with an error.

## Serve the build directory

`build-web/` is the same site, with the pages copied next to the wasm. Use it when you do not want the module inside `web/`:

```powershell
python -m http.server --directory build-web 8080
```

Open `http://localhost:8080/`.

## Tests

The Playwright smoke tests serve `build-web` and need a system Chrome.

```powershell
Set-Location src\ifcviewer-web\tests
npm install
npm test
```

`WEB_BUILD_DIR` overrides the build directory. The default is `build-web` at the repository root.
