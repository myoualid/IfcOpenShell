Geometry
========

Tessellate with ``ifcopenshell.geom.settings`` and
``ifcopenshell.geom.iterate``, matching Python
``ifcopenshell.geom.iterate(settings, file, …)``.

The tutorial sample uses ``geometryLibrary: 'opencascade'`` (Revit-style
BREP / extrusions). For a minimal WASM profile only, change
``DEFAULT_KERNEL`` in ``examples/geom/app.js`` to ``passthrough``.

Runnable folder: ``src/ts/examples/geom/``.

.. code-block:: bash

   cd src/ts/examples
   node serve.mjs
   # http://127.0.0.1:4173/examples/geom/

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
     // Detached Mesh: vertices (Float32 xyz), faces (Uint32), transform (4×4)
     console.log(mesh.type, mesh.vertices.length / 3, mesh.faces.length / 3);
   }

   iter.dispose();
   settings.dispose();
   model.dispose();
