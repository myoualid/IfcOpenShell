Entity and attributes
=====================

.. js:class:: Entity

   High-level wrapper for one IFC entity instance. Attribute names are also
   available as properties (``wall.Name``, ``wall.GlobalId``,
   ``wall.IsDefinedBy``) via a proxy — matching Python SWIG
   ``__getattr__`` / ``__setattr__``.

   Owns a native instance handle. Call :js:meth:`dispose` when finished.

   .. js:method:: id()

      STEP express id, matching Python ``entity.id()``.

   .. js:method:: isA([arg])

      With no argument (or a boolean), return the class name. With a string
      class name, return whether the entity is that type (including subtypes
      when the native API supports it).

   .. js:method:: getInfo([options])

      Return a plain object of properties. Python: ``entity.get_info()``.
      Options: ``includeIdentifier``, ``recursive``, ``ignore``,
      ``scalarOnly``.

   .. js:method:: attributeName(attrIdx)

      Forward attribute name for a zero-based index.

   .. js:method:: attributeType(attr)

      Native IFC argument type string for a name or index.

   .. js:method:: get(nameOrIndex)

      Escape hatch: read an attribute by name or index. Prefer
      ``entity.Name``.

   .. js:method:: set(nameOrIndex, value)

      Escape hatch: set an attribute. Prefer ``entity.Name = value``.
      Assign ``null`` to clear (Python ``None``).

   .. js:method:: toString([valid_spf])

      Serialize the entity as STEP text.

   .. js:method:: dispose()

      Release the native entity handle. Safe to call more than once.

.. js:data:: AttributeInput

   Values accepted by property assignment / :js:meth:`Entity.set`: ``null``,
   boolean, ``'UNKNOWN'``, number, string, :js:class:`Entity`, arrays of
   those, and nested aggregates as required by the IFC type.

.. js:data:: IfcValue

   Decoded attribute value: scalars, :js:class:`Entity` references, or
   aggregates.
