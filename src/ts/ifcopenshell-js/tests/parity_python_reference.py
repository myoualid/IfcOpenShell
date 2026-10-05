"""Python reference for BINDING-API-PARITY-SPEC.md §4.

Run with the installed SWIG ifcopenshell:

    python tests/parity_python_reference.py
"""

from __future__ import annotations

import ifcopenshell
import ifcopenshell.guid


def main() -> None:
    model = ifcopenshell.file(schema="IFC4")
    project = model.create_entity(
        "IfcProject", GlobalId=ifcopenshell.guid.new(), Name="Parity project"
    )
    print(project.Name, model.schema)

    wall = model.create_entity(
        "IfcWall", GlobalId=ifcopenshell.guid.new(), Name="Demo"
    )
    assert wall.is_a("IfcWall")
    assert model.by_id(wall.id()).Name == "Demo"

    related_object = model.create_entity(
        "IfcTask", GlobalId=ifcopenshell.guid.new(), Name="Task"
    )
    referenced_by = model.create_entity(
        "IfcRelAssignsToProduct",
        GlobalId=ifcopenshell.guid.new(),
        RelatedObjects=[related_object],
        RelatingProduct=wall,
    )
    assert referenced_by.is_a("IfcRelAssignsToProduct")
    assert related_object.HasAssignments[0] == referenced_by
    assert referenced_by in model.get_inverse(related_object)
    assert model.get_total_inverses(related_object) >= 1

    for e in model.traverse(wall, max_levels=1):
        print(e.is_a(), e.id())

    print("OK", wall.id(), wall.Name)


if __name__ == "__main__":
    main()
