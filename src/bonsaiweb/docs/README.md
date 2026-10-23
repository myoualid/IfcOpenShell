# Bonsai Web docs

Bonsai Web is a browser BIM host. `src/` is the runtime. `app/` is the example application that configures it.

| Doc | What it covers |
|-----|----------------|
| [distribution.md](distribution.md) | `npm install @aeco-dev/bonsaiweb`, the import map, and bundler use |
| [architecture.md](architecture.md) | Boot, signals, tools, operators, modules, and the geometry / data split |
| [api-structure.md](api-structure.md) | `bonsai.store`, `bonsai.context`, `bonsai.tool` and `bonsai.ops`, mapped to Blender's `bpy` |
| [example-app.md](example-app.md) | The shell, ribbon, panels, and how a file becomes a loaded model |
| [ifcfed.md](ifcfed.md) | How an `.ifcfed` project works, and how Bonsai Web opens and saves one as a zip of relative paths |
| [../src/modules/dropbox/README.md](../src/modules/dropbox/README.md) | Dropbox sign-in, what the static page stores, and the limit of that storage |
