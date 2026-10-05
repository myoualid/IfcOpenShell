Parse
=====

Open a co-located IFC file and inspect schema, project, and walls
(``id``, ``isA``, ``Name``, ``GlobalId``).

Runnable folder: ``src/ts/examples/parse/``.

.. code-block:: bash

   cd src/ts/examples
   node serve.mjs
   # http://127.0.0.1:4173/examples/parse/

Same operations as SWIG Python with JS camelCase. Dispose files and entities when finished.

.. code-block:: javascript

   import ifcopenshell from 'ifcopenshell';

   await ifcopenshell.init({ wasmBase });
   const model = await ifcopenshell.open(bytes, 'sample.ifc');

   const project = model.byType('IfcProject')[0];
   console.log(project.Name, model.schema);

   const walls = model.byType('IfcWall');
   console.log(walls[0]?.id(), walls[0]?.isA(), walls[0]?.Name, walls[0]?.GlobalId);

   walls.forEach((w) => w.dispose());
   project?.dispose();
   model.dispose();
