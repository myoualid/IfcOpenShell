# Building IfcOpenShell

Run these in Windows PowerShell, from top to bottom of the section you need. `cd /d` and `set` are Command Prompt commands. They fail in PowerShell.

Do not set `BUILD_DIR` or `WASM_NATIVE_TOOLCHAIN`. Do not run `npm publish`.

## 0. Start of every PowerShell window

Paste this once in the window. Every later step assumes this same window. A new window does not keep `PATH`.

```powershell
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell
$env:PATH = "C:\msys64\usr\bin;C:\msys64\mingw64\bin;C:\Program Files\LLVM\bin;" + $env:PATH
$env:UV_SYSTEM_CERTS = "true"
```

`PATH` is required. Without it, `nix/build-all.py` stops with `Required tools not installed or not added to PATH` because `cc`, `make`, `bison`, `xz`, and `bunzip2` come from MSYS2, and `clang++` comes from LLVM. The wasm compile generates the C API with `C:\Program Files\LLVM\bin\libclang.dll`. Emscripten is put first on `PATH` inside the script and also ships a `libclang.dll`; the script skips that copy.

`UV_SYSTEM_CERTS` is required on this machine. `uv` does not trust the PyPI certificate by itself (`invalid peer certificate: UnknownIssuer`). The build script asks `uv` for `typing-extensions` and `clang==21.1.7` before it compiles anything. Without system certificates that fetch fails and the script never starts. The flag on each `uv run` below is `--system-certs`. The environment variable covers the same thing if a later command omits the flag.

Check the tools. This must print `Tools OK` before you compile:

```powershell
$missing = @()
foreach ($name in "git","cmake","cc","c++","make","patch","bison","tar","xz","bunzip2","clang++","node","npm") {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { $missing += $name }
}
if ($missing.Count -gt 0) { throw "Missing: $($missing -join ', '). Section 0 was not applied in this window." }
if (-not (Test-Path "C:\Program Files\LLVM\bin\libclang.dll")) { throw "Missing C:\Program Files\LLVM\bin\libclang.dll. The wasm build generates the C API with the host LLVM, not Emscripten's clang." }
"Tools OK"
```

## Where the builds go

| Product | Dependencies | IfcOpenShell objects |
|---|---|---|
| JavaScript / WASM | `build\Windows\wasm\install` and `build\Windows\wasm\emsdk` | `build\Windows\wasm\build\ifcopenshell\build` |
| Python / SWIG | `build\Windows\AMD64\install` | `build\Windows\AMD64\build\ifcopenshell\build` |

The WASM libraries are Emscripten binaries. The Python SWIG build cannot use them. It has its own host libraries.

The JavaScript stack is two packages:

| Package | Folder | Rebuild when |
|---|---|---|
| `@ifcopenshell/wasm` | `src\ts\ifcopenshell-wasm` | The C++ wasm compile changed |
| `ifcopenshell` | `src\ts\ifcopenshell-js` | A file under `src\ts\ifcopenshell-js\src` changed |

## 1. WASM dependencies are already built

This is the current tree. These paths already exist:

```text
build\Windows\wasm\emsdk\emsdk_env.sh
build\Windows\wasm\install\boost-1.86.0
build\Windows\wasm\install\cgal-v5.6.3
build\Windows\wasm\install\eigen-install-3.4.0
build\Windows\wasm\install\gmp-6.3.0
build\Windows\wasm\install\json-3.11.3
build\Windows\wasm\install\libxml2-2.13.8
build\Windows\wasm\install\manifold-3.2.1
build\Windows\wasm\install\mpfr-3.1.6
build\Windows\wasm\install\occt-7.8.1
```

Confirm them:

```powershell
$required = @(
    "build\Windows\wasm\emsdk\emsdk_env.sh",
    "build\Windows\wasm\install\boost-1.86.0",
    "build\Windows\wasm\install\cgal-v5.6.3",
    "build\Windows\wasm\install\eigen-install-3.4.0",
    "build\Windows\wasm\install\gmp-6.3.0",
    "build\Windows\wasm\install\json-3.11.3",
    "build\Windows\wasm\install\libxml2-2.13.8",
    "build\Windows\wasm\install\manifold-3.2.1",
    "build\Windows\wasm\install\mpfr-3.1.6",
    "build\Windows\wasm\install\occt-7.8.1"
)
$missing = $required | Where-Object { -not (Test-Path $_) }
if ($missing) { throw "Missing dependency folders:`n$($missing -join "`n")" }
"Dependency folders OK"
```

If that throws, stop. Section 4 builds the missing dependencies. Do not point the script at another tree.

### 1.1 Compile the wasm

Section 0 must already have been pasted in this window.

```powershell
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell
uv run --system-certs --with clang==21.1.7 ./nix/build-all.py -v --native-wasm --build-cfg Release
```

What this does when the folders above exist:

- `uv` downloads `typing-extensions` and `clang==21.1.7` from PyPI. `--system-certs` is what makes that succeed here.
- The script finds `build\Windows\wasm\emsdk` and prints `emsdk already installed`.
- For each library it prints `Found existing <name>, skipping`. It does not recompile Boost, OCCT, CGAL, Eigen, GMP, MPFR, JSON, libxml2, or Manifold.
- It then configures and compiles IfcOpenShell. The first run compiles every C++ file into `build\Windows\wasm\build\ifcopenshell`. Later runs keep that directory and compile only C++ files that changed. Installed dependencies stay skipped either way.

Wasm files land in:

```text
build\Windows\wasm\build\ifcopenshell\build\ifcwrap\wasm
```

To compile every C++ file again, set `$env:IFCOS_CLEAN = "1"` in this window before the same command. That deletes `build\Windows\wasm\build\ifcopenshell` first. Close the window, or run `Remove-Item Env:IFCOS_CLEAN`, before the next incremental build.

### 1.2 Stage the wasm package

This copies the wasm into `@ifcopenshell/wasm`. It does not compile the TypeScript library and it does not publish.

```powershell
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell
$env:IFCOPENSHELL_WASM_DIR = Join-Path (Get-Location) "build\Windows\wasm\build\ifcopenshell\build\ifcwrap\wasm"
if (-not (Test-Path (Join-Path $env:IFCOPENSHELL_WASM_DIR "ifcopenshell_wasm.wasm"))) {
    throw "Wasm output missing: $env:IFCOPENSHELL_WASM_DIR. Section 1.1 did not finish."
}
Set-Location src\ts\ifcopenshell-wasm
npm ci
npm run stage
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell
```

`npm ci` is only required the first time, or after `src\ts\ifcopenshell-wasm\package.json` changes. The next time, stop after `npm run stage` is still correct if `node_modules` is already there. Running `npm ci` again is safe.

### 1.3 Build the TypeScript library

```powershell
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell\src\ts\ifcopenshell-js
npm ci
npm run build
npm test
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell
```

`npm run build` is `tsc`. It writes `src\ts\ifcopenshell-js\dist`. The lockfile links `@ifcopenshell/wasm` to `../ifcopenshell-wasm`, so this uses the folder from section 1.2, not the npm registry. `npm test` runs the Node tests against that local package.

### 1.4 Open the local example

`src\ts\ifcopenshell-js\examples\threejs.html` loads the published packages from jsDelivr. Leave that file as it is. To view the build from section 1.3, serve `src\ts` and use the import map below in a local copy of the page, or temporarily in the browser.

```powershell
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell\src\ts
py -3 -m http.server 4173
```

```json
{
  "imports": {
    "ifcopenshell": "/ifcopenshell-js/dist/index.js",
    "ifcopenshell/geom": "/ifcopenshell-js/dist/geom/index.js",
    "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
    "@ifcopenshell/wasm": "/ifcopenshell-wasm/browser.js",
    "@ifcopenshell/wasm/api": "/ifcopenshell-wasm/wasm/ifcopenshell_api.mjs"
  }
}
```

Open `http://127.0.0.1:4173/ifcopenshell-js/examples/threejs.html`.

## 2. TypeScript-only change

Use this when the edit is under `src\ts\ifcopenshell-js\src` and the wasm from section 1.1 is still the one you want. Do not run `build-all.py`. Do not run `npm run stage`.

```powershell
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell\src\ts\ifcopenshell-js
npm run build
npm test
```

Reload the example page from section 1.4.

## 3. C++ changed, dependencies still present

Section 0 must be in effect. On Windows the script keeps `build\Windows\wasm\build\ifcopenshell`, so this is the same command as section 1.1 and only changed C++ files compile. Dependencies stay skipped. Set `$env:IFCOS_CLEAN = "1"` first when you want every C++ file compiled again.

```powershell
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell
uv run --system-certs --with clang==21.1.7 ./nix/build-all.py -v --native-wasm --build-cfg Release
```

Then stage the new wasm:

```powershell
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell
$env:IFCOPENSHELL_WASM_DIR = Join-Path (Get-Location) "build\Windows\wasm\build\ifcopenshell\build\ifcwrap\wasm"
Set-Location src\ts\ifcopenshell-wasm
npm run stage
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell
```

Run section 2 as well when the staged `.d.ts` files changed. A wasm binary change with the same API does not need `tsc`. Reload the example after `npm run stage`.

## 4. WASM dependencies are not built yet

Only use this when section 1's folder check throws. It is the same command as section 1.1. The script compiles Boost, OCCT, CGAL, and the rest into `build\Windows\wasm\install`, then compiles IfcOpenShell. That is much longer than section 1.1.

Section 0 first, then:

```powershell
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell
uv run --system-certs --with clang==21.1.7 ./nix/build-all.py -v --native-wasm --build-cfg Release
```

When it finishes, continue at section 1.2.

## 5. Python SWIG

This does not use `build\Windows\wasm`. The first run compiles host libraries into `build\Windows\AMD64\install`. Later runs skip a dependency whose install folder is already there.

Section 0 first.

First build:

```powershell
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell
uv run --system-certs ./nix/build-all.py -v --build-cfg Release --use-current-python-version IfcOpenShell-Python
```

C++ change after that install folder exists. The same command recompiles only changed C++ files. Set `$env:IFCOS_CLEAN = "1"` first for a full C++ rebuild.

```powershell
Set-Location C:\Users\myoua\Documents\002_Projects\AECGeeks\IfcOpenShell
uv run --system-certs ./nix/build-all.py -v --build-cfg Release --use-current-python-version IfcOpenShell-Python
```

`--use-current-python-version` builds the SWIG wrapper for the Python that runs the script and installs it into that interpreter's `site-packages`.

## Publishing the npm packages

Do not publish from this checkout.

GitHub Actions on `IfcOpenShell/IfcOpenShell` does it:

1. **Build IfcOpenShell Native WASM** (`.github/workflows/build-ifcopenshell-native-wasm.yml`), started with `workflow_dispatch`. It builds the wasm on Ubuntu and uploads the `ifcopenshell-native-wasm` artifact.
2. **Publish IfcOpenShell TypeScript npm** (`.github/workflows/publish-ifcopenshell-ts-npm.yml`), started with `workflow_dispatch`. It downloads that artifact, stages it, and runs `npm publish` for `@ifcopenshell/wasm`, then `ifcopenshell`.

The publish job runs only when `github.repository` is `IfcOpenShell/IfcOpenShell`.
