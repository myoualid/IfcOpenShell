# This file was generated with the assistance of an AI coding tool.
#
# Writes cost_5d.ifc and cost_5d.json next to this file. The IFC is built with
# ifcopenshell.api; the JSON holds each cost item as Bonsai's cost panel sees
# it (bonsai/bim/module/cost/data.py on top of ifcopenshell.util.cost), so
# tests/cost.test.mjs checks tool.Cost against Python.
#
#   python tests/make_cost_fixture.py

import json
from pathlib import Path

import ifcopenshell
import ifcopenshell.api.context
import ifcopenshell.api.control
import ifcopenshell.api.cost
import ifcopenshell.api.root
import ifcopenshell.api.unit
import ifcopenshell.util.cost
import ifcopenshell.util.unit

HERE = Path(__file__).parent


def item_data(file, item):
    """One cost item as CostData.cost_items() in Bonsai computes it."""
    quantity = ifcopenshell.util.cost.get_total_quantity(item)
    symbol = "-"
    quantities = item.CostQuantities
    if quantities:
        unit = ifcopenshell.util.unit.get_property_unit(quantities[0], file)
        if unit:
            symbol = ifcopenshell.util.unit.get_unit_symbol(unit)
        if quantities[0].is_a("IfcPhysicalSimpleQuantity"):
            measure = quantities[0].declaration.as_entity().attribute_by_index(3)
            if "Count" in measure.type_of_attribute().declared_type().name():
                symbol = "U"

    rate_item = ifcopenshell.util.cost.get_assigned_rate_cost_item(item)
    root = rate_item or item
    applied_total = 0.0
    unit_basis = None
    has_unit_basis = False
    values = []
    for value in item.CostValues or []:
        applied = ifcopenshell.util.cost.calculate_applied_value(root, value)
        applied_total += applied
        if value.UnitBasis:
            unit_basis = value.UnitBasis.ValueComponent.wrappedValue
            has_unit_basis = True
        else:
            unit_basis = 1
        values.append(
            {
                "category": value.Category,
                "applied": applied,
                "formula": ifcopenshell.util.cost.serialise_cost_value(value),
            }
        )
    cost_quantity = 1 if quantity is None else quantity
    total = applied_total * cost_quantity / unit_basis if has_unit_basis else applied_total * cost_quantity

    return {
        "id": item.id(),
        "identification": item.Identification,
        "name": item.Name,
        "nested": [n.id() for n in ifcopenshell.util.cost.get_nested_cost_items(item)],
        "quantity": quantity,
        "unitSymbol": symbol,
        "values": values,
        "appliedValue": applied_total,
        "unitBasis": unit_basis if has_unit_basis else None,
        "totalCost": total,
        "rateItem": rate_item.id() if rate_item else None,
        "products": sorted(
            p.GlobalId for p in ifcopenshell.util.cost.get_cost_item_assignments(item, filter_by_type="PRODUCT")
        ),
        "deepProducts": sorted(
            {
                p.GlobalId
                for p in ifcopenshell.util.cost.get_cost_item_assignments(item, filter_by_type="PRODUCT", is_deep=True)
            }
        ),
    }


def expected(file):
    result = {"currency": None, "schedules": [], "products": {}}
    for unit in file.by_type("IfcMonetaryUnit"):
        result["currency"] = unit.Currency
    for schedule in file.by_type("IfcCostSchedule"):
        items = []

        def walk(item):
            items.append(item_data(file, item))
            for child in ifcopenshell.util.cost.get_nested_cost_items(item):
                walk(child)

        for root in ifcopenshell.util.cost.get_root_cost_items(schedule):
            walk(root)
        result["schedules"].append(
            {
                "id": schedule.id(),
                "name": schedule.Name,
                "predefinedType": schedule.PredefinedType,
                "roots": [r.id() for r in ifcopenshell.util.cost.get_root_cost_items(schedule)],
                "items": items,
            }
        )
    for product in file.by_type("IfcElement"):
        items = ifcopenshell.util.cost.get_cost_items_for_product(product)
        if items:
            result["products"][product.GlobalId] = sorted(i.id() for i in items)
    return result


def build():
    f = ifcopenshell.file(schema="IFC4")
    ifcopenshell.api.root.create_entity(f, ifc_class="IfcProject", name="Costing fixture")
    ifcopenshell.api.unit.assign_unit(f)
    ifcopenshell.api.context.add_context(f, context_type="Model")
    eur = ifcopenshell.api.unit.add_monetary_unit(f, currency="EUR")
    ifcopenshell.api.unit.assign_unit(f, units=[eur])

    walls = [ifcopenshell.api.root.create_entity(f, ifc_class="IfcWall", name=f"Wall {i}") for i in range(1, 4)]
    slab = ifcopenshell.api.root.create_entity(f, ifc_class="IfcSlab", name="Slab")

    def value(parent, formula=None, category=None, applied=None, unit_basis=None):
        v = ifcopenshell.api.cost.add_cost_value(f, parent=parent)
        if formula is not None:
            ifcopenshell.api.cost.edit_cost_value_formula(f, cost_value=v, formula=formula)
        if applied is not None:
            ifcopenshell.api.cost.edit_cost_value(f, cost_value=v, attributes={"AppliedValue": applied})
        if category is not None:
            v.Category = category
        if unit_basis is not None:
            length = ifcopenshell.util.unit.get_project_unit(f, "LENGTHUNIT")
            v.UnitBasis = f.create_entity("IfcMeasureWithUnit", f.create_entity("IfcLengthMeasure", unit_basis), length)
        return v

    def quantity(item, ifc_class, amount):
        q = ifcopenshell.api.cost.add_cost_item_quantity(f, cost_item=item, ifc_class=ifc_class)
        q[3] = amount
        return q

    def item(parent_schedule=None, parent=None, name="", identification=None):
        i = ifcopenshell.api.cost.add_cost_item(f, cost_schedule=parent_schedule, cost_item=parent)
        i.Name = name
        i.Identification = identification
        return i

    # Schedule of rates: one rate per metre, applied to a priced item below.
    rates = ifcopenshell.api.cost.add_cost_schedule(f, name="Rates", predefined_type="SCHEDULEOFRATES")
    rate = item(parent_schedule=rates, name="Kerb per 2 m", identification="R1")
    value(rate, applied=30.0, unit_basis=2.0)

    bill = ifcopenshell.api.cost.add_cost_schedule(f, name="Bill", predefined_type="PRICEDBILLOFQUANTITIES")
    total = item(parent_schedule=bill, name="Building", identification="B")
    value(total, category="*")
    substructure = item(parent=total, name="Substructure", identification="B.1")
    value(substructure, category="*")
    slab_item = item(parent=substructure, name="Ground slab", identification="B.1.1")
    quantity(slab_item, "IfcQuantityArea", 120.5)
    value(slab_item, applied=85.0)
    ifcopenshell.api.control.assign_control(f, relating_control=slab_item, related_objects=[slab])
    walls_item = item(parent=total, name="Walls", identification="B.2")
    quantity(walls_item, "IfcQuantityVolume", 12.0)
    quantity(walls_item, "IfcQuantityVolume", 6.0)
    value(walls_item, applied=210.0, category="Material")
    value(walls_item, applied=90.0, category="Labour")
    ifcopenshell.api.control.assign_control(f, relating_control=walls_item, related_objects=walls[:2])
    kerb = item(parent=total, name="Kerbs", identification="B.3")
    quantity(kerb, "IfcQuantityLength", 40.0)
    value(kerb, applied=30.0, unit_basis=2.0)
    ifcopenshell.api.cost.assign_cost_value(f, cost_item=kerb, cost_rate=rate)
    doors = item(parent=total, name="Doors", identification="B.4")
    quantity(doors, "IfcQuantityCount", 3)
    value(doors, applied=450.0, category="")
    ifcopenshell.api.control.assign_control(f, relating_control=doors, related_objects=[walls[2]])
    item(parent=total, name="Provisional", identification="B.5")

    # A formula over the child categories, as in 5D.ifc's "TOTAL WITH TAX".
    budget = ifcopenshell.api.cost.add_cost_schedule(f, name="Budget", predefined_type="BUDGET")
    package = item(parent_schedule=budget, name="Package with tax", identification="P")
    value(package, formula="Labour()+(Material()*1.2)")
    labour = item(parent=package, name="Labour", identification="P.1")
    quantity(labour, "IfcQuantityTime", 6.0)
    value(labour, applied=350.0, category="Labour")
    material = item(parent=package, name="Material", identification="P.2")
    quantity(material, "IfcQuantityArea", 20.0)
    value(material, applied=750.0, category="Material")

    return f


if __name__ == "__main__":
    model = build()
    model.write(str(HERE / "cost_5d.ifc"))
    model = ifcopenshell.open(str(HERE / "cost_5d.ifc"))
    (HERE / "cost_5d.json").write_text(json.dumps(expected(model), indent="\t") + "\n")
