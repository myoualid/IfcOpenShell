Create
======

Build an empty IFC4 file with ``file()``, create entities with kwargs
(``GlobalId``, ``Name``), and dump ``toString()``.

This is **core** authoring — not generated ``ifcopenshell.api.*``.

Runnable folder: ``src/ts/examples/create/``.

.. code-block:: bash

   cd src/ts/examples
   node serve.mjs
   # http://127.0.0.1:4173/examples/create/

.. code-block:: javascript

   import ifcopenshell from 'ifcopenshell';

   await ifcopenshell.init({ wasmBase });
   const model = await ifcopenshell.file({ schema: 'IFC4' });

   const project = model.createEntity('IfcProject', {
     GlobalId: ifcopenshell.guid.new(),
     Name: 'Tutorial project',
   });
   const wall = model.createEntity('IfcWall', {
     GlobalId: ifcopenshell.guid.new(),
     Name: 'Tutorial wall',
   });

   console.assert(wall.isA('IfcWall'));
   console.assert(model.byId(wall.id()).Name === 'Tutorial wall');
   console.log(project.id(), wall.Name, model.toString());

   project.dispose();
   wall.dispose();
   model.dispose();
