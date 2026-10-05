API reference
=============

Public surface of ``ifcopenshell``. Same operations as SWIG Python with JS
camelCase (``byType``, ``byId``, ``createEntity``, ``isA``, ``guid.new()``,
``ifcopenshell.geom.iterate``).

Always call :js:func:`init` before :js:func:`open` / :js:func:`file`, and
:js:meth:`dispose` native handles (or use explicit resource management).

High-level ``ifcopenshell.api.*`` authoring helpers are **not** in this branch
yet.

Import::

   import ifcopenshell from 'ifcopenshell';

   await ifcopenshell.init({ wasmBase });
   const model = await ifcopenshell.open(bytes, 'model.ifc');
   const settings = new ifcopenshell.geom.settings();

Optional subpaths (``/geom``, ``/serializers``, ``/util``) remain for
tree-shaking. ``util`` is a viewer helper — not part of the Python parity
contract. Use ``@ifcopenshell-js/wasm`` only for advanced asset hosting.

.. toctree::
   :maxdepth: 2

   api/session
   api/file
   api/entity
   api/geometry
   api/serializers
   api/utilities
   api/types
