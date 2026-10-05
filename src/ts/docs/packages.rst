Packages
========

Two folders under ``src/ts/``, two npm names.

.. list-table::
   :header-rows: 1
   :widths: 28 32 40

   * - Folder
     - npm name
     - Responsibility
   * - ``src/ts/ifcopenshell-wasm/``
     - ``@ifcopenshell-js/wasm``
     - Native runtime — ``.wasm``, generated ``.mjs`` glue, plugin manifest, browser / Node loaders
   * - ``src/ts/ifcopenshell-js/``
     - ``ifcopenshell``
     - High-level TypeScript SDK — ``init``, ``open``, ``file``, ``IfcFile``, ``Entity``, geom, serializers

They are split so WASM artifacts (large, rebuilt by Emscripten) have a different
lifecycle from the TypeScript layer; so browser (``browser.js``) and Node
(``index.js``) can share the same staged ``wasm/`` directory; and so workers or
viewers can depend on WASM alone.

The JS package depends on the WASM package. Until the packages are published,
use the local folders in this worktree and run ``npm run stage`` yourself.

``@ifcopenshell-js/wasm``
-------------------------

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Entry
     - Purpose
   * - ``browser.js``
     - Browser ``resolveUrls(baseUrl)``
   * - ``index.js``
     - Node ``resolveWasmAssets()``
   * - ``./api``
     - Generated ``ifcopenshell_api.mjs`` types / glue
   * - ``wasm/``
     - Staged binaries (not always committed)

``ifcopenshell``
------------------------

Subpaths on the JS package:

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Export / subpath
     - Purpose
   * - default / ``init``, ``open``, ``file``, ``guid``, ``geom``
     - Session API (camelCase)
   * - ``IfcFile``, ``Entity``
     - Model and entity wrappers
   * - ``./geom``
     - ``settings``, ``iterate``, ``iterator``, ``serializers``, matrix helpers
   * - ``./serializers``
     - ``obj``, ``svg``, ``ttl``
   * - ``./util``
     - Viewer helpers only (``meshColor``, …) — not Python parity

Until packages are on a registry:

.. code-block:: json

   {
     "dependencies": {
       "ifcopenshell": "file:../path/to/src/ts/ifcopenshell-js",
       "@ifcopenshell-js/wasm": "file:../path/to/src/ts/ifcopenshell-wasm"
     }
   }

Bundlers that understand ``new URL(..., import.meta.url)`` (for example Vite)
can consume the wasm package’s asset manifest. Otherwise serve ``wasm/`` over
HTTP and pass ``init({ wasmAssets: await resolveUrls('/wasm/') })``.

Examples in this repo use an import map relative to each chapter folder:

.. code-block:: html

   <script type="importmap">
   {
     "imports": {
       "ifcopenshell": "../../ifcopenshell-js/dist/index.js",
       "ifcopenshell/geom": "../../ifcopenshell-js/dist/geom/index.js",
       "ifcopenshell/util": "../../ifcopenshell-js/dist/util/index.js",
       "@ifcopenshell-js/wasm": "../../ifcopenshell-wasm/browser.js",
       "@ifcopenshell-js/wasm/api": "../../ifcopenshell-wasm/wasm/ifcopenshell_api.mjs"
     }
   }
   </script>
