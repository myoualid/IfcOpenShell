IfcFile
=======

High-level wrapper for an IFC file and its entity graph. Same operations as
Python ``ifcopenshell.file``, with JS camelCase method names.

.. js:class:: IfcFile

   Owns a native file handle. Call :js:meth:`dispose` when finished (or use
   ``using`` / ``await using``).

   Prefer module-level :js:func:`open` / :js:func:`file` over the static
   constructors.

   .. js:attribute:: schema

      Schema name string (for example ``IFC4``).

   .. js:method:: byId(id)

      Return an :js:class:`Entity` by numeric STEP id, or ``null``.

   .. js:method:: byGuid(guid)

      Return an :js:class:`Entity` by GlobalId, or ``null``.

   .. js:method:: byType(typeName[, options])

      Return entities of a type. Subtypes are included unless
      ``options.includeSubtypes`` is ``false``.

   .. js:method:: createEntity(ifcClass[, attributes])

      Create an entity with IFC attribute fields. Python: ``create_entity``.

   .. js:method:: toString()

      Serialize the whole file as STEP text.

   .. js:method:: write(path)

      Write the file to a filesystem path (Node / MEMFS as supported).

   .. js:method:: header()

      Read the STEP header (:js:class:`HeaderInfo`), or ``null``.

   .. js:method:: getInverse(inst[, options])

      Return entities that inversely reference ``inst``.
      Options: ``allowDuplicate``, ``withAttributeIndices`` (same meaning
      as Python). Default is a ``Set`` of unique entities.

   .. js:method:: getTotalInverses(inst)

      Count inverse references to ``inst``.

   .. js:method:: traverse(inst[, options])

      Traverse references from ``inst``. Options: ``maxLevels``,
      ``breadthFirst``.

   .. js:method:: dispose()

      Release the native file handle. Safe to call more than once.

Options and info types
----------------------

.. js:class:: OpenOptions

   .. js:attribute:: signal

      Abort opening before native parsing begins.

   .. js:attribute:: readonly

      Open the native file in read-only mode when supported.

.. js:class:: HeaderInfo

   STEP header fields: ``description``, ``implementationLevel``, ``name``,
   ``timeStamp``, ``author``, ``organization``, ``preprocessorVersion``,
   ``originatingSystem``, ``authorization``, ``schemas``.
