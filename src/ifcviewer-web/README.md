<!-- This file was generated with the assistance of an AI coding tool. -->

# ifcviewer-web

WebAssembly build of the IfcViewer core. Emscripten compiles `IfcViewerCore` into `IfcViewerWeb.js` and `IfcViewerWeb.wasm`. `web/ifcviewer.js` is plain JavaScript: the build copies it next to those files. It is not compiled.

The result is a static site. Serve the build directory over `http://localhost` (WebGPU needs a secure context) and open it in Chrome or Edge.

This build is separate from `@ifcopenshell/wasm`. It does not use `nix/build-all.py`.

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
