Full stack
==========

Open a sample, edit the first wall ``Name``, and tessellate a few meshes.

Runnable folder: ``src/ts/examples/full/``.

.. code-block:: bash

   cd src/ts/examples
   node serve.mjs
   # http://127.0.0.1:4173/examples/full/

.. code-block:: javascript

   import ifcopenshell from 'ifcopenshell';

   await ifcopenshell.init({ wasmBase });
   const model = await ifcopenshell.open(bytes, 'sample.ifc');

   const walls = model.byType('IfcWall');
   walls[0].Name = 'Edited in full example';

   const settings = new ifcopenshell.geom.settings();
   settings.set('weld-vertices', true);
   const iter = ifcopenshell.geom.iterate(settings, model, {
     numThreads: 1,
     geometryLibrary: 'opencascade',
   });
   await iter.initialize();

   let count = 0;
   for await (const mesh of iter) {
     if (mesh.faces.length === 0) continue;
     count++;
     if (count >= 5) break;
   }

   console.log(walls[0].Name, count);

   walls.forEach((w) => w.dispose());
   iter.dispose();
   settings.dispose();
   model.dispose();
