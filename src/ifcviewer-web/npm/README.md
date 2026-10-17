# @aeco-dev/viewer

WebAssembly build of the IfcViewer core from [myoualid/IfcOpenShell](https://github.com/myoualid/IfcOpenShell). This package can include viewer features that are not in [IfcOpenShell/IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell) yet.

`dist/build.json` records the fork commit and `sidecarFormatVersion`. The wasm and the `.ifcview` baker are a pair: a file baked at a different format version will be refused.

Load the Emscripten glue with a script tag so it can request `IfcViewerWeb.wasm` from the same URL directory. Leave `IfcViewerWeb.js` unbundled. Load `ifcviewer.js` after it.

```html
<script src="./node_modules/@aeco-dev/viewer/dist/IfcViewerWeb.js"></script>
<script src="./node_modules/@aeco-dev/viewer/dist/ifcviewer.js"></script>
<script>
  const build = await fetch(new URL('./node_modules/@aeco-dev/viewer/dist/build.json', import.meta.url)).then(r => r.json());
  const viewer = await IfcViewer.create({
    canvas: document.querySelector('#viewer-canvas'),
    sidecarFormatVersion: build.sidecarFormatVersion,
  });
</script>
```

The canvas element must have `id="viewer-canvas"`.

jsDelivr serves the same pair when the version in the URL matches the published package:

```html
<script src="https://cdn.jsdelivr.net/npm/@aeco-dev/viewer@0.1.0/dist/IfcViewerWeb.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@aeco-dev/viewer@0.1.0/dist/ifcviewer.js"></script>
```

The viewer is licensed under the GNU LGPL version 3. `COPYING` and `COPYING.LESSER` from IfcOpenShell are included in the package.
