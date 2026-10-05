Babylon.js viewer
=================

Runnable folder: ``src/ts/examples/viewer-babylon/``.

Uses ``ifcopenshell.geom.iterate`` to build Babylon meshes.
``util.meshColor`` is a viewer helper (not Python parity).

.. code-block:: bash

   cd src/ts/examples
   node serve.mjs
   # http://127.0.0.1:4173/examples/viewer-babylon/

.. code-block:: javascript

   import ifcopenshell from 'ifcopenshell';

   await ifcopenshell.init({ wasmBase });
   const model = await ifcopenshell.open(bytes, 'sample.ifc');

   const settings = new ifcopenshell.geom.settings();
   settings.set('weld-vertices', true);
   settings.set('mesher-linear-deflection', 0.02);

   const iter = ifcopenshell.geom.iterate(settings, model, {
     numThreads: 1,
     geometryLibrary: 'opencascade',
   });
   await iter.initialize();

   for await (const mesh of iter) {
     // mesh.vertices / mesh.faces / mesh.transform → Babylon VertexData
   }

   iter.dispose();
   settings.dispose();
   model.dispose();
