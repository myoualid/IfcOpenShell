# @aeco-dev/bonsaiweb

Browser BIM host. It loads an IFC model, draws it in a WebGPU viewer, and exposes operators for a shell or a headless page.

```sh
npm install @aeco-dev/bonsaiweb
```

That installs this package and the libraries it imports: `@aeco-dev/gui`, `@aeco-dev/layout`, `ifcopenshell`, and `@ifcopenshell/wasm`. A bundler and a browser import map use those same names.

## Bundler

```js
import { start } from "@aeco-dev/bonsaiweb";
import { defaultPaths } from "@aeco-dev/bonsaiweb/paths";
import "@aeco-dev/gui/gui.css";
import "@aeco-dev/layout/layout.css";
```

Headless, without the shell: `import { start } from "@aeco-dev/bonsaiweb/headless"`.

## Import map

A page without a bundler maps the same names onto jsDelivr. The versions match the package dependencies. The map has to be inline, because the convert worker copies it.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@aeco-dev/gui@0.2.4/gui.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@aeco-dev/layout@0.2.4/layout.css">
<script type="importmap">
{
  "imports": {
    "@aeco-dev/bonsaiweb": "https://cdn.jsdelivr.net/npm/@aeco-dev/bonsaiweb@0.1.0/dist/bonsai.js",
    "@aeco-dev/bonsaiweb/headless": "https://cdn.jsdelivr.net/npm/@aeco-dev/bonsaiweb@0.1.0/dist/bonsai-headless.js",
    "@aeco-dev/bonsaiweb/paths": "https://cdn.jsdelivr.net/npm/@aeco-dev/bonsaiweb@0.1.0/dist/paths.js",
    "@aeco-dev/gui": "https://cdn.jsdelivr.net/npm/@aeco-dev/gui@0.2.4/gui.js",
    "@aeco-dev/layout": "https://cdn.jsdelivr.net/npm/@aeco-dev/layout@0.2.4/layout.js",
    "ifcopenshell": "https://cdn.jsdelivr.net/npm/ifcopenshell@0.9.0/dist/index.js",
    "ifcopenshell/geom": "https://cdn.jsdelivr.net/npm/ifcopenshell@0.9.0/dist/geom/index.js",
    "ifcopenshell/util": "https://cdn.jsdelivr.net/npm/ifcopenshell@0.9.0/dist/util/index.js",
    "@ifcopenshell/wasm": "https://cdn.jsdelivr.net/npm/@ifcopenshell/wasm@0.9.0/browser.js",
    "@ifcopenshell/wasm/api": "https://cdn.jsdelivr.net/npm/@ifcopenshell/wasm@0.9.0/wasm/ifcopenshell_api.mjs"
  }
}
</script>
<script type="module">
  import { start } from "@aeco-dev/bonsaiweb";
  import { defaultPaths } from "@aeco-dev/bonsaiweb/paths";
</script>
```

The example in `app/` uses that map, except `@aeco-dev/bonsaiweb` points at `../dist/` so a local rebuild shows up before the next publish.

`defaultPaths` is only the viewer scripts, zstd, and the worker shim. Those are not import specifiers.

The shell also needs `configuration.ui`, `configuration.app`, and `configuration.ribbon`. The example is `app/configuration/config.js`.
