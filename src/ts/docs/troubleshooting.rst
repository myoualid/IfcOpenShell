Troubleshooting
===============

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Symptom
     - Fix
   * - Failed to resolve packaged WASM assets / ``WASM artifacts are missing``
     - Run ``npm run stage`` in ``ifcopenshell-wasm``
   * - Import map 404 for ``dist/``
     - ``cd ifcopenshell-js && npm run build``
   * - Browser 404 on ``.wasm`` / ``.mjs``
     - Wrong ``resolveUrls`` base, or not serving ``src/ts``
   * - Geometry iterator failed / ``E is not a function``
     - Use ``opencascade`` for BREP IFC (tutorial default); ``passthrough`` only works for triangulated geometry
   * - ``WebAssembly.Compile is disallowed`` (>8MB)
     - Plugin load must use ``loadAsync: true`` (fixed in generated ``ifcopenshell_api.mjs``) — hard-reload after restaging
   * - ``Call init() before open()``
     - Always ``await ifcopenshell.init(...)`` first
   * - ``file://`` CORS / WASM errors
     - Serve with ``node examples/serve.mjs`` (HTTP only)
   * - Geometry kernel missing
     - Profile lacks that plugin — confirm ``wasm/plugins/`` after ``npm run stage``
