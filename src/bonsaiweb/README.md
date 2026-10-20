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

Point each name at the file npm installed. Paths below are from the HTML file.

```html
<link rel="stylesheet" href="./node_modules/@aeco-dev/gui/gui.css">
<link rel="stylesheet" href="./node_modules/@aeco-dev/layout/layout.css">
<script type="importmap">
{
  "imports": {
    "@aeco-dev/bonsaiweb": "./node_modules/@aeco-dev/bonsaiweb/dist/bonsai.js",
    "@aeco-dev/bonsaiweb/headless": "./node_modules/@aeco-dev/bonsaiweb/dist/bonsai-headless.js",
    "@aeco-dev/bonsaiweb/paths": "./node_modules/@aeco-dev/bonsaiweb/dist/paths.js",
    "@aeco-dev/gui": "./node_modules/@aeco-dev/gui/gui.js",
    "@aeco-dev/layout": "./node_modules/@aeco-dev/layout/layout.js",
    "ifcopenshell": "./node_modules/ifcopenshell/dist/index.js",
    "ifcopenshell/geom": "./node_modules/ifcopenshell/dist/geom/index.js",
    "ifcopenshell/util": "./node_modules/ifcopenshell/dist/util/index.js",
    "@ifcopenshell/wasm": "./node_modules/@ifcopenshell/wasm/browser.js",
    "@ifcopenshell/wasm/api": "./node_modules/@ifcopenshell/wasm/wasm/ifcopenshell_api.mjs"
  }
}
</script>
<script type="module">
  import { start } from "@aeco-dev/bonsaiweb";
  import { defaultPaths } from "@aeco-dev/bonsaiweb/paths";
</script>
```

The convert worker copies that map, so the map has to be inline in the page. The example in `app/index.html` is that map, with paths relative to `app/`.

`defaultPaths` is only the viewer scripts, zstd, and the worker shim. Those are not import specifiers.

The shell also needs `configuration.ui`, `configuration.app`, and `configuration.ribbon`. The example is `app/configuration/config.js`.
