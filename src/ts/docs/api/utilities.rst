Utilities
=========

GUID helpers are part of the Python parity surface. Color / inspect helpers
are **viewer utilities** — they are not in SWIG Python ``ifcopenshell``.

GUID
----

Python-shaped ``ifcopenshell.guid`` helpers, exported as ``guid``.

.. js:data:: guid

   Object with methods:

   * ``guid.new()`` — random IFC GlobalId
   * ``guid.compress(uuid)`` — hex UUID → 22-character IFC GUID
   * ``guid.expand(guid)`` — IFC GUID → hex UUID
   * ``guid.split(uuid)`` — insert hyphens into a hex UUID

Viewer helpers (non-parity)
---------------------------

Also available from ``ifcopenshell/util`` and as ``util`` on the root
import. These exist for sample viewers; do not treat them as part of the
binding parity contract.

.. js:function:: inspectEntity(file, id)
.. js:function:: formatAttributeValue(attr)
.. js:function:: hashColor(input)
.. js:function:: meshColor(type, materialIds, colors)
