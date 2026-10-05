# Examples — `ifcopenshell`

Canonical Sphinx docs: [`../docs/`](../docs/) (`pip install -r ../docs/requirements.txt && make -C ../docs html`).

Browser tutorials for the TypeScript/WASM bindings under `src/ts/`.

## Quick start

```bash
# Stage WASM + build JS (from repo root), then:
cd src/ts/examples
node serve.mjs
```

Open http://127.0.0.1:4173/examples/

## Layout

| Path | Role |
|------|------|
| `index.html` | Chapter hub |
| `TUTORIAL.md` | Copy-paste chapter guide |
| `00-installation/` … `viewer-babylon/` | Runnable chapters (self-contained) |
| `smoke/` | Minimal create/open demo |
| `serve.mjs` | Static server rooted at `src/ts/` |

## Docs

- [../docs/](../docs/) — Sphinx + Furo handbook (`make html` in that folder)
- [WEB-STACK-GUIDE.md](../WEB-STACK-GUIDE.md) — architecture + tutorials
- [PACKAGES-GUIDE.md](../PACKAGES-GUIDE.md) — build / stage / npm layout
- [ifcopenshell-js/README.md](../ifcopenshell-js/README.md) — package quick start

## API shape

Examples use the camelCase session API:

`init` → `open` / `file` → `byType` / `createEntity` / `meshes`

High-level `ifcopenshell.api.*` is not available in this branch yet.
