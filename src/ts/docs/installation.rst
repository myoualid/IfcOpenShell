Installation
============

Stage WASM, build the JavaScript ``dist/``, then serve the examples.

Build pipeline
--------------

From the IfcOpenShell repository root (this worktree):

.. code-block:: bash

   python nix/wasm_native.py build
   python nix/wasm_native.py package
   cd src/ts/ifcopenshell-wasm
   npm install
   # Optional: set IFCOPENSHELL_WASM_DIR to your build output
   npm run stage
   cd ../ifcopenshell-js
   npm install
   npm run build

Expect under ``src/ts/ifcopenshell-wasm/wasm/``:

.. code-block:: text

   ifcopenshell_wasm.wasm
   ifcopenshell_wasm.mjs
   ifcopenshell_api.mjs
   ifcopenshell_plugins.json
   plugins/...

Serve examples
--------------

.. code-block:: bash

   cd src/ts/examples
   node serve.mjs
   # open http://127.0.0.1:4173/examples/

The server is rooted at ``src/ts/`` so import maps can reach sibling packages.
Do not open the HTML as ``file://``.

Chapter 0 (``examples/00-installation/``) HEAD-checks ``dist/`` and staged WASM,
then runs ``init({ wasmBase })``.

.. code-block:: javascript

   import ifcopenshell from 'ifcopenshell';

   await ifcopenshell.init({
     wasmBase: new URL('../../ifcopenshell-wasm/wasm/', import.meta.url).href,
   });

WASM profiles and plugins
-------------------------

Built with ``python nix/wasm_native.py`` (profiles such as ``minimal``,
``full``). Inspect staged plugins in
``src/ts/ifcopenshell-wasm/wasm/ifcopenshell_plugins.json``.

.. list-table::
   :header-rows: 1
   :widths: 20 40 40

   * - Profile
     - Typical kernels
     - Use
   * - ``minimal``
     - ``passthrough``
     - Smoke tests, small downloads
   * - ``full``
     - ``passthrough``, ``opencascade``, …
     - Production tessellation

Tutorials default to kernel ``opencascade`` (required for typical BREP IFC such
as Revit extrusions). Use ``passthrough`` only on a minimal profile or already
triangulated files. Each geometry example sets its own ``DEFAULT_KERNEL``
constant (see ``examples/geom/app.js``, ``examples/full/app.js``, and the
viewer chapters).

.. list-table::
   :header-rows: 1
   :widths: 28 72

   * - Plugin kind
     - Role
   * - ``schema``
     - Schema-specific STEP parsing (``ifc2x3``, ``ifc4``, …)
   * - ``kernel``
     - Tessellation backend
   * - ``mapping``
     - Schema-specific geometry mapping
   * - ``geometry_serializer``
     - Mesh export (OBJ, …)
   * - ``document`` / ``tree``
     - serializers / spatial backends (profile-dependent)

Building these Sphinx pages
---------------------------

From ``src/ts/docs/``:

.. code-block:: bash

   pip install -r requirements.txt
   make html          # GNU make
   make server

On Windows PowerShell, GNU ``make`` is usually not on ``PATH``. Use the
batch file in this folder instead:

.. code-block:: powershell

   .\make.bat html
   .\make.bat server
