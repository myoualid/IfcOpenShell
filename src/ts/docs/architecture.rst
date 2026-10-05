Architecture
============

How the TypeScript / WASM stack under ``src/ts/`` fits together.

Layers
------

.. code-block:: text

   Your app (index.html + app.js)
           │
           ▼
   ifcopenshell     init / open / file / IfcFile / Entity / geom
           │
           ▼
   @ifcopenshell-js/wasm    resolveUrls() · browser.js · staged wasm/
           │
           ▼
   ifcopenshell_wasm.wasm  +  ifcopenshell_api.mjs  +  plugins/*.wasm

You do **not** recompile C++ to use the libraries — only to produce new WASM
artifacts.

The main ``ifcopenshell_wasm.wasm`` is the Emscripten host (memory, filesystem,
plugin registry, generated C API trampolines, shared IfcParse / IfcGeom).
Schema, kernel, mapping, and serializer plugins load on demand via
``shell.loadPlugin(kind, id)``.

- Opening a file sniffs ``FILE_SCHEMA`` and loads the matching schema plugin.
- Geometry iteration loads kernel and mapping plugins.

Build path (from C++ to npm):

.. code-block:: text

   C++ (IfcParse, IfcGeom, ifcapi)
     src/ifcwrap/binding_generator/  +  generated C API
           │
           ▼  codegen + Emscripten (nix/wasm_native.py)
     build output …/ifcwrap/wasm/
           │
           ▼  npm run stage  (src/ts/ifcopenshell-wasm)
     src/ts/ifcopenshell-wasm/wasm/
           │
           └─► ifcopenshell  →  npm run build  →  dist/

See :doc:`packages` for entry points and :doc:`installation` for staging steps.
