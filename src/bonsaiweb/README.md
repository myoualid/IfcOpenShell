# @aeco-dev/bonsaiweb

Browser BIM host. It loads an IFC model, draws it in a WebGPU viewer, and exposes operators for a shell or a headless page.

```sh
npm install @aeco-dev/bonsaiweb
```

That installs this package and the libraries it imports: `@aeco-dev/gui`, `@aeco-dev/layout`, `ifcopenshell`, and `@ifcopenshell/wasm`. A bundler and a browser import map use those same names.

## Bundler

The viewer alone draws into the container you give it:

```js
import { Bonsai } from "@aeco-dev/bonsaiweb";

const bonsai = new Bonsai( document.body );
await bonsai.start();
bonsai.ops.Project.LoadIfc( file );
```

The GUI shell is an addon. It builds its layout in the container and moves `bonsai.viewport`, the element that holds the canvas, into the layout:

```js
import { Bonsai } from "@aeco-dev/bonsaiweb";
import { Shell } from "@aeco-dev/bonsaiweb/gui";
import "@aeco-dev/gui/gui.css";
import "@aeco-dev/layout/layout.css";

const bonsai = new Bonsai( document.body, configuration );
new Shell( bonsai, configuration );
await bonsai.start();
```

## No import map

`dist/module/` is the same build with every package inlined, so a page imports it straight from jsDelivr. Only the stylesheets, the viewer, and the ifcopenshell wasm files load separately, and the build points at those itself.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@aeco-dev/gui@0.2.4/gui.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@aeco-dev/layout@0.2.4/layout.css">
<script type="module">
  import { Bonsai } from "https://cdn.jsdelivr.net/npm/@aeco-dev/bonsaiweb@0.1.0/dist/module/bonsai.js";
  import { Shell } from "https://cdn.jsdelivr.net/npm/@aeco-dev/bonsaiweb@0.1.0/dist/module/gui.js";
</script>
```

The example is `app/standalone.html`.

## Import map

A page without a bundler maps the same names onto jsDelivr. The versions match the package dependencies. The map has to be inline, because the convert worker copies it.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@aeco-dev/gui@0.2.4/gui.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@aeco-dev/layout@0.2.4/layout.css">
<script type="importmap">
{
  "imports": {
    "@aeco-dev/bonsaiweb": "https://cdn.jsdelivr.net/npm/@aeco-dev/bonsaiweb@0.1.0/dist/bonsai.js",
    "@aeco-dev/bonsaiweb/gui": "https://cdn.jsdelivr.net/npm/@aeco-dev/bonsaiweb@0.1.0/dist/gui.js",
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
  import { Bonsai } from "@aeco-dev/bonsaiweb";
  import { Shell } from "@aeco-dev/bonsaiweb/gui";
</script>
```

The example in `app/` uses that map, except `@aeco-dev/bonsaiweb` points at `../dist/` so a local rebuild shows up before the next publish.

`@aeco-dev/gui` and `@aeco-dev/layout` are only needed with the shell. The viewer scripts, zstd, and the worker shim load from jsDelivr on their own; they are not import specifiers.

The shell needs `configuration.ui`, `configuration.app`, and `configuration.ribbon`. The example is `app/configuration/config.js`.
