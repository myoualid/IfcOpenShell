Geometry
========

Matches Python ``ifcopenshell.geom``: ``settings``, ``iterate``, ``iterator``,
and ``serializers``. Also available from ``ifcopenshell/geom`` and as
``ifcopenshell.geom`` on the default export.

.. js:class:: settings

   Owned wrapper for native geometry interpretation settings.
   Call after ``init()``: ``new ifcopenshell.geom.settings()`` (uses the
   session runtime; an explicit shell argument is optional).

   .. js:method:: set(name, value)

      Set a named setting. ``value`` may be boolean, number, string, or an
      array.

   .. js:method:: get(name)

      Read a named setting.

   .. js:method:: getType(name)

      Native setting type string.

   .. js:method:: settingNames()

      Names exposed by the native settings object.

   .. js:method:: dispose()

.. js:function:: iterate(settings, file[, options])

   Return a geometry :js:class:`iterator` for ``file``.
   Matches Python ``ifcopenshell.geom.iterate(settings, file, …)``.

   Options:

   * ``numThreads`` (default ``1``)
   * ``include`` / ``exclude`` — type name strings or numeric ids
   * ``geometryLibrary`` (default ``'opencascade'``)
   * ``precision`` — ``'float32'`` (default, WebGL) or ``'float64'``

.. js:class:: iterator

   Asynchronous geometry mesh iterator. Implements ``AsyncIterable``.
   Prefer creating via :js:func:`iterate`.

   Typical libraries: ``opencascade`` for BREP IFC; ``passthrough`` only for
   already-triangulated geometry or minimal WASM profiles.

   .. js:method:: initialize()

      Initialize the native iterator. Returns whether initialization succeeded.

   .. js:method:: next()

      Advance to the next detached :js:data:`Mesh`, or ``null`` when exhausted.

   .. js:method:: dispose()

      Stop iteration and release the native iterator.

.. js:data:: Mesh

   Pure-data triangulated mesh snapshot (no WASM handle).

   Fields: ``id``, ``guid``, ``type``, ``name``, ``vertices``, ``faces``,
   ``normals``, ``edges``, ``transform`` (4×4 column-major), ``materialIds``,
   ``itemIds``, ``edgeItemIds``, ``uvs``, ``colors``.

Typical usage::

   const settings = new ifcopenshell.geom.settings();
   settings.set('weld-vertices', true);
   const iter = ifcopenshell.geom.iterate(settings, model, {
     numThreads: 1,
     geometryLibrary: 'opencascade',
   });
   await iter.initialize();
   for await (const mesh of iter) {
     console.log(mesh.type, mesh.vertices.length / 3);
   }
   iter.dispose();
   settings.dispose();

Matrix helpers
--------------

.. js:function:: rowMajorToColumnMajor4(matrix)
.. js:function:: columnMajorToRowMajor4(matrix)
.. js:function:: transformPoint4(matrix, point)
