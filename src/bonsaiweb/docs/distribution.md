# Distribution

```sh
npm install @aeco-dev/bonsaiweb
```

npm installs `@aeco-dev/bonsaiweb` and the packages its bundle imports. A bundler resolves the names below from `node_modules`. A page without a bundler maps those same names onto jsDelivr. The [readme](../README.md) has both snippets. The example keeps `@aeco-dev/bonsaiweb` on `../dist/` and loads every dependency from jsDelivr.

| Specifier | Installed file |
|-----------|----------------|
| `@aeco-dev/bonsaiweb` | `@aeco-dev/bonsaiweb/dist/bonsai.js` |
| `@aeco-dev/bonsaiweb/gui` | `@aeco-dev/bonsaiweb/dist/gui.js` |
| `@aeco-dev/gui` | `@aeco-dev/gui/gui.js` |
| `@aeco-dev/layout` | `@aeco-dev/layout/layout.js` |
| `ifcopenshell` | `ifcopenshell/dist/index.js` |
| `ifcopenshell/geom` | `ifcopenshell/dist/geom/index.js` |
| `ifcopenshell/util` | `ifcopenshell/dist/util/index.js` |
| `@ifcopenshell/wasm` | `@ifcopenshell/wasm/browser.js` |
| `@ifcopenshell/wasm/api` | `@ifcopenshell/wasm/wasm/ifcopenshell_api.mjs` |

Styles are `@aeco-dev/gui/gui.css` and `@aeco-dev/layout/layout.css`.

A page without an import map imports `dist/module/bonsai.js` and `dist/module/gui.js` instead. Those have every package above inlined.

`signals` is bundled into `dist/`. Viewer scripts, zstd, and es-module-shims are fixed URLs in `src/assets.js`, not rows in the import map.

`npm run build` writes one file per entry, plus the chunk `bonsai.js` and `gui.js` share, into `dist/`, next to `app/`. `app/` is only the example. Serve `dist/` with the page. The dependencies come from jsDelivr, so the example does not read `node_modules`.
