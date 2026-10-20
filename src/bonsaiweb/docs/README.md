# Bonsai Web docs

Bonsai Web is a browser BIM host. `src/` is the runtime. `app/` is the example application that configures it.

| Doc | What it covers |
|-----|----------------|
| [distribution.md](distribution.md) | `npm install @aeco-dev/bonsaiweb`, the import map, and bundler use |
| [architecture.md](architecture.md) | Boot, signals, tools, operators, modules, and the geometry / data split |
| [example-app.md](example-app.md) | The shell, ribbon, panels, and how a file becomes a loaded model |
| [viewer-redraw.md](viewer-redraw.md) | How the viewport redraws after a resize or window move, and the `requestRedraw()` call in `src/tool/Viewer.js` |
| [ifcfed.md](ifcfed.md) | How an `.ifcfed` project works, and how Bonsai Web opens and saves one as a zip of relative paths |
