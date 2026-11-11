# Example application

`app/` is a BIM viewer built on the Bonsai Web host. Build the local `ifcopenshell` package first (`npm run generate` and `npm run build` in `src/ts/ifcopenshell-js`), because the planning and costing modules call its transpiled `ifcopenshell/util` modules. Then run `npm run build` in this package and open `app/index.html` from a server rooted at `src/`, so the page can see both `dist/` and `../ts/ifcopenshell-js/dist/`. The page loads this build from `../dist/` and `ifcopenshell` from the local build. `@aeco-dev/gui`, `@aeco-dev/layout`, and `@ifcopenshell/wasm` come from jsDelivr, at the versions in `package.json`. `npm run dev` rebuilds `dist/` while you edit `src/`. Files under `app/configuration/` load in the browser, so those edits do not need a rebuild.

```html
<script type="importmap">
{
  "imports": {
    "@aeco-dev/bonsaiweb": "../dist/bonsai.js",
    "@aeco-dev/bonsaiweb/gui": "../dist/gui.js",
    "@aeco-dev/gui": "https://cdn.jsdelivr.net/npm/@aeco-dev/gui@0.2.4/gui.js",
    "@aeco-dev/layout": "https://cdn.jsdelivr.net/npm/@aeco-dev/layout@0.2.4/layout.js",
    "ifcopenshell": "../../ts/ifcopenshell-js/dist/index.js",
    "ifcopenshell/geom": "../../ts/ifcopenshell-js/dist/geom/index.js",
    "ifcopenshell/util": "../../ts/ifcopenshell-js/dist/util/index.js",
    "ifcopenshell/util/cost": "../../ts/ifcopenshell-js/dist/python/util/cost.js",
    "ifcopenshell/util/date": "../../ts/ifcopenshell-js/dist/python/util/date.js",
    "ifcopenshell/util/sequence": "../../ts/ifcopenshell-js/dist/python/util/sequence.js",
    "ifcopenshell/util/unit": "../../ts/ifcopenshell-js/dist/python/util/unit.js",
    "@ifcopenshell/wasm": "https://cdn.jsdelivr.net/npm/@ifcopenshell/wasm@0.9.0/browser.js",
    "@ifcopenshell/wasm/api": "https://cdn.jsdelivr.net/npm/@ifcopenshell/wasm@0.9.0/wasm/ifcopenshell_api.mjs"
  }
}
</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@aeco-dev/gui@0.2.4/gui.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@aeco-dev/layout@0.2.4/layout.css">
<script type="module">
  import { Bonsai } from "@aeco-dev/bonsaiweb";
  import { Shell } from "@aeco-dev/bonsaiweb/gui";
  import { BonsaiWebConfiguration } from "./configuration/config.js";
  window.bonsai = new Bonsai(document.body, BonsaiWebConfiguration);
  new Shell(window.bonsai, BonsaiWebConfiguration);
  window.bonsai.start();
</script>
```

`app/headless.html` creates the `Bonsai` without a `Shell`. That page is the viewer and the operators, with no ribbon or panels. `window.bonsai.ops.Viewer.ViewAll()` is how a host runs a command.

A bundler imports the same names and does not need that map. Styles for the shell come from `gui.css`, `layout.css`, and `app/css/main.css`. See [distribution.md](distribution.md).

`window.bonsai` is the live host: `context`, `store`, `tool`, and `ops`. `bonsai.tool.Viewer.get()` is the viewer. The boot logger prints phase timings on those signals. `appReady` fires once modules are mounted.

## Configuration

`app/index.html` imports `app/configuration/config.js` and passes it to `Bonsai` and `Shell`. That module assembles the four pieces the host reads.

| File | Export | Effect |
|------|--------|--------|
| `config.ui.js` | `WorldComponent`, `layoutConfig` | The widget tree and the sizes of the four workspaces |
| `config.modules.js` | `CoreModules` | Which modules activate, in order |
| `config.geometry.js` | `GeometryConfig` | IfcOpenShell kernel, and worker or main thread |
| `config.ribbon.js` | `workModes`, `ribbonButtons`, `defaultWorkMode` | Header tabs and the buttons on the ribbon |

`GeometryConfig` sets the startup defaults for converting `.ifc` to `.ifcview`:

```js
{ kernel: "manifold", thread: "auto" }
```

`kernel` is the IfcOpenShell geometry plugin (`opencascade`, `manifold`, `passthrough`, …). `thread` is `auto`, `worker`, or `main`. `auto` and `worker` convert in a worker at every file size; `main` is an explicit opt-in. `Project.OpenFile`, `Project.LoadIfc`, and `Project.LoadSample` take the same keys as an options argument to override them for one load, so a ribbon button can pin a kernel:

```js
button( "RB_LoadIfcOcc", "Load (OpenCascade)", "add", "Project", "Project.OpenFile", [ { kernel: "opencascade" } ] )
```

At runtime, `bonsai.tool.Loader.configure( { thread: "main" } )` changes the defaults for later loads.

`WorldComponent` is a gui2 tree. The ids are the contract with `Layout`:

```text
World
  RibbonMenu
    HeaderBar
      Logo
      WorkModeBar          tabs are inserted here at runtime
      HeaderMenu
        LayoutToggleBar
    RibbonBar              one node per ribbon button
  WorkspaceBottom          terminal
  WorkspaceLeft            project, spatial hierarchy
  WorkspaceRight           properties
  Viewport
    Windows                window manager; the viewer canvas is added later
  Footer                   progress and status
```

`layoutConfig` opens the left, right, and bottom regions and sets their starting sizes: top bar 86px, left 320px, right 340px, bottom 260px, minimum panel 160px.

`CoreModules` turns on every built-in module:

```js
{ id: "project", active: true },
{ id: "spatial-hierarchy", active: true },
{ id: "properties", active: true },
{ id: "viewer", active: true },
{ id: "code.terminal", active: true },
```

Set `active: false` to skip a module on the GUI page. Its operators stay unregistered and its panel is not created. The headless page does not read this list; it registers every operator.

## Ribbon

The header starts on the **Project** work mode. A button with a `workMode` is shown only in that mode. The Panels button has no mode, so it stays visible on every tab.

| Mode | Buttons |
|------|---------|
| Project | Load IFC, Load sample |
| Navigate | Front, back, left, right, top, bottom, view all, frame selection, and the Blender, Rhino, Revit, and web navigation presets |
| Viewer | Hide and show selection, show all, hide all, isolate, x-ray, clear colours, selection outline, clear selection |

A button is data:

```js
button( "RB_ViewFront", "Front", "filter_center_focus", "Navigate", "Viewer.SetStandardView", [ "FRONT" ] )
```

That is id, label, Material icon, work mode, operator name, and the arguments passed to `ops.execute`. `bindRibbon` finds the element gui2 created for that id, listens for clicks, and hides it when another mode is selected.

Panels is special. It has no `operator`. After modules activate, `bindPanelDialog` attaches a checkbox list to `#RB_Panels`. Checking a row mounts that panel in its default workspace.

## What you see

**Left, Project.** One row per loaded model, with a visibility checkbox, plus add and clear. Add opens the same file picker as Load IFC. Clear calls `Loader.clear()`, which drops geometry and disposes live files. The list refreshes on `modelLoaded`, `liveIfcReady`, and `modelCleared`.

**Left, Spatial.** A tree of the live IFC: project, site, building, storey, and the products contained in them. Choosing a row selects the matching viewer object by GlobalId. Choosing in the viewport highlights the matching row. Visibility actions on a node call the scene tools. The tree is built when the live file is open, so it fills in on `liveIfcReady` rather than at the first geometry frame.

**Right, Properties.** Follows the current pick.

- In edit mode it lists the entity class, predefined type, scalar attributes, type and container, property sets, and quantity sets.
- In view mode, or while conversion is still opening the live file, it shows the type, name, and GlobalId stored on the sidecar pick.

**Bottom, Terminal.** A JavaScript prompt (`bonsai >`) with sessions, history, and completions. The header holds the session tabs and icons to create, clear, and close a session. A side column holds snippets in two scrollable tabs: `bonsai.tool` queries the model and selection, and `bonsai.ops` runs operators (`bonsai.ops.Viewer.ViewAll()`). Open or close the panel from Panels.

**Bottom, Schedule (Planning).** A Gantt of one work schedule: code, task, start, finish, duration and a bar on a shared timeline, with a dashed line for today. Summary tasks take the earliest start and latest finish of their subtasks, in italics. Critical tasks are red, milestones are diamonds, and work tasks with no element assigned are dimmed. Choosing a row selects what the task builds and uses (all subtasks for a summary row); a double click or Enter isolates it. The arrow keys move through the tree and expand or collapse it. Filtering by name or code, or to critical tasks, keeps each match's parents. Picking an element in the viewport highlights its tasks and expands the tree down to them.

**Right, Element tasks (Planning).** The tasks that build and use the picked element, with their schedule. Choosing one opens it in the Gantt.

**Bottom, Cost sheet (Costing).** One cost schedule as a tree: code, description, quantity and unit, rate, total in the project currency, and a bar for each item's share of the schedule total. Totals follow Bonsai: a SUM value adds up the children, category values add up the children of that category, and a unit basis prices per that many units. The summary line gives the schedule total and counts unpriced items and items linked to elements. Clicking a column header sorts each level of the tree by it. Choosing a row selects the elements it prices, with those of its nested items; a double click or Enter isolates them. The row tooltip shows each value's formula and the arithmetic of the total. Filtering by name or code, or to unpriced items, keeps each match's parents. The export button writes every item to CSV. Picking an element highlights the items that price it.

**Right, Element cost (Costing).** The cost items that price the picked element, with quantity, rate and total. Choosing one opens it in the cost sheet.

**Command bar.** Typing `c` then `d` over the viewport opens an empty command line there, like AutoCAD's. The menu lists matching operators (`grid` finds `Viewer.ToggleGrid`), then the values of the argument under the cursor. A line runs as JavaScript (`Viewer.SetStandardView('TOP')`; category names need no `bonsai.ops.` prefix) or as `Command arg arg` (`SetStandardView TOP`, `ToggleGrid off`, `SetColor $sel #f40`). `$sel`, `$entity`, `$model` and `$last` are built in, and `name = …` keeps a variable in the session. Enter on an empty line repeats the last command; Esc closes. It shares the terminal panel's session and history. Operators describe their arguments for the menu with `static operatorArgs`.

**Viewport.** `bonsai.viewport` fills the Viewport region, and `#viewer-canvas` fills it. Orbit uses the Blender preset until a Navigate button changes it. Dropping a file on the viewport loads it. Drops anywhere else on the window are cancelled so the browser does not navigate away.

**Footer.** A status bar. It shows dependency loading, then conversion progress, then settles to a short "ready" message.

## Loading a model

Load IFC and the Project panel's add button both call `openModelFilePicker`, which accepts `.ifc`, `.ifcview`, and `.zip`. The chosen file goes to `Loader.loadLocalFile`. Drag-and-drop uses that same function.

Load sample runs the `Project.LoadSample` operator, which fetches the sample IFC copied from `app/files/ifc/window_wall.ifc` into `dist/` and passes it to `Loader.loadIfcUrl`. That path converts and opens the file without asking where to save the sidecar.

For a `.ifc` that is not already in the scene, the sequence is:

1. `modelLoadStarted` fires with the filename. The footer and the boot log follow the convert phases.
2. The bytes are tessellated into a `.ifcview` with the kernel and thread from `GeometryConfig` (by default manifold in a worker), unless the operator was given overrides.
3. The browser asks where to save the sidecar (`showSaveFilePicker`, or a download link). Cancelling the save still streams the sidecar that was just built.
4. The viewer loads the sidecar. `modelLoaded` fires. The Project panel gains a row, in view mode.
5. The main thread opens the same bytes with IfcOpenShell, after loading the schema plugin named in the file header. `liveIfcReady` fires. The model switches to edit mode, and the spatial tree and properties panel fill in.

Loading a second file adds it. It does not replace the first. Clear, on the Project panel, is what empties the scene.

A `.ifcview` alone stays in view mode: geometry and the sidecar's basic fields, with no property sets. A zip that contains both files takes the fast path and skips conversion.

## A click, end to end

Pressing **Front**:

1. The Navigate tab has left `#RB_ViewFront` visible.
2. The click handler calls `ops.execute("Viewer.SetStandardView", context, "FRONT")`, the string form of `bonsai.ops.Viewer.SetStandardView("FRONT")`.
3. The viewer module registered that operator at boot. `poll()` requires a live viewer.
4. The operator is not `undoable`, so it runs without touching the undo stack.
5. The operator maps `"FRONT"` to the viewer's view id and calls `viewer.setStandardView`.
6. `standardViewSet` fires with that id.

Pressing **Hide** is the path that records history. `Viewer.HideSelected` stores the selected ids, hides them, and can undo with Ctrl+Z.

## Adding a button

1. Add a `button(...)` row in `config.ribbon.js`, in the work mode where it should appear.
2. Give it an operator name. If the command already exists on the viewer module (`Viewer.HideAll`, `Viewer.SetColor`, and the rest of `src/modules/viewer/operators.js`), the name is enough.
3. For a new command, add an `Operator` subclass under the module that owns the behaviour, and export it from that module's `operators.js`.
4. Rebuild (`npm run build` or `npm run dev`) and reload. `registerOperators` registers the class, and the ribbon click resolves the name.

The button id must be unique. gui2 uses it as the DOM id, and `bindRibbon` looks the element up with `getElementById`.
