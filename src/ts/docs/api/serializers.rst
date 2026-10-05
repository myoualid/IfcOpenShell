Serializers
===========

Matches Python ``ifcopenshell.geom.serializers``. Browser/WASM adaptation:
export to in-memory text buffers instead of filesystem paths.

Also available as ``ifcopenshell.geom.serializers`` and from
``ifcopenshell/serializers``.

.. js:function:: obj(shell, file, settings[, options])

   Serialize geometry to OBJ. MTL content is returned in ``secondary``.

.. js:function:: svg(shell, file, settings[, options])

   Serialize geometry to SVG.

.. js:function:: ttl(shell, file, settings[, options])

   Serialize geometry to Turtle / IFC-TTL.

Each returns a Promise resolving to ``{ primary, secondary }``, or ``null``
when the native iterator cannot initialize.

Options:

* ``geometryLibrary`` (default ``'opencascade'``)
* ``numThreads``
* ``signal`` / ``onProgress`` (JS cancellation / progress)

.. js:class:: ExportResult

   .. js:attribute:: primary

      Primary serialized content.

   .. js:attribute:: secondary

      Secondary content (OBJ MTL); empty for SVG/TTL.
