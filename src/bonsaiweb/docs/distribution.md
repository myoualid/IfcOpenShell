# Distribution

```sh
npm install @aeco-dev/bonsaiweb
```

npm installs `@aeco-dev/bonsaiweb` and the packages its bundle imports. A bundler resolves the names below from `node_modules`. A page without a bundler maps those same names onto the installed files. The [readme](../README.md) has both snippets.

| Specifier | Installed file |
|-----------|----------------|
| `@aeco-dev/bonsaiweb` | `@aeco-dev/bonsaiweb/dist/bonsai.js` |
| `@aeco-dev/bonsaiweb/headless` | `@aeco-dev/bonsaiweb/dist/bonsai-headless.js` |
| `@aeco-dev/bonsaiweb/paths` | `@aeco-dev/bonsaiweb/dist/paths.js` |
| `@aeco-dev/gui` | `@aeco-dev/gui/gui.js` |
| `@aeco-dev/layout` | `@aeco-dev/layout/layout.js` |
| `ifcopenshell` | `ifcopenshell/dist/index.js` |
| `ifcopenshell/geom` | `ifcopenshell/dist/geom/index.js` |
| `ifcopenshell/util` | `ifcopenshell/dist/util/index.js` |
| `@ifcopenshell/wasm` | `@ifcopenshell/wasm/browser.js` |
| `@ifcopenshell/wasm/api` | `@ifcopenshell/wasm/wasm/ifcopenshell_api.mjs` |

Styles are `@aeco-dev/gui/gui.css` and `@aeco-dev/layout/layout.css`.

`signals` is bundled into `dist/`. Viewer scripts, zstd, and es-module-shims are URLs in `defaultPaths`, not rows in the import map.

`npm run build` writes one file per entry into `dist/`, next to `app/`. `app/` is only the example. Serve the package directory so the example's import map can see `node_modules` and `dist`.
