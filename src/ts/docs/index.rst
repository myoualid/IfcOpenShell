ifcopenshell (JavaScript / WASM)
================================

TypeScript and JavaScript bindings for IfcOpenShell, compiled to WebAssembly.
Use them in the browser or Node without recompiling C++.

The packages live under ``src/ts/``:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Package
     - Role
   * - ``ifcopenshell``
     - TypeScript SDK — ``init()``, ``open()``, ``file()``, ``IfcFile``, ``Entity``, geometry
   * - ``@ifcopenshell-js/wasm``
     - Staged WASM binaries, Emscripten glue, ``resolveUrls`` / ``resolveWasmAssets``

Typical flow:

.. code-block:: text

   init({ wasmAssets })  →  open(bytes) or file({ schema })
                         →  byType / createEntity / meshes()
                         →  dispose()

Same operations as SWIG Python with JS camelCase (``byType``, ``byId``,
``createEntity``, ``isA``, ``guid.new()``, attribute properties such as
``wall.Name``). Always call ``init()`` before opening a file, and
``dispose()`` native handles when finished.

.. warning::

   High-level ``ifcopenshell.api.*`` authoring helpers are **not** in this
   branch yet. Use the core session API (``createEntity`` and friends).

Runnable chapters live in ``src/ts/examples/``. Serve them with
``node serve.mjs`` from that folder after staging WASM and building ``dist/``.
See :doc:`installation`.

Full public API: :doc:`api_reference`.

.. toctree::
   :hidden:
   :maxdepth: 1
   :caption: Guide

   architecture
   packages
   installation
   troubleshooting

.. toctree::
   :hidden:
   :maxdepth: 1
   :caption: Tutorials

   tutorials/parse
   tutorials/geometry
   tutorials/create
   tutorials/full

.. toctree::
   :hidden:
   :maxdepth: 1
   :caption: Viewers

   viewers/threejs
   viewers/babylon

.. toctree::
   :hidden:
   :maxdepth: 1
   :caption: API

   api_reference
