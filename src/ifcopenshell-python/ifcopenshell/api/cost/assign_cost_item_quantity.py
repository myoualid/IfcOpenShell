# IfcOpenShell - IFC toolkit and geometry engine
# Copyright (C) 2021 Dion Moult <dion@thinkmoult.com>
#
# This file is part of IfcOpenShell.
#
# IfcOpenShell is free software: you can redistribute it and/or modify
# it under the terms of the GNU Lesser General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# IfcOpenShell is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Lesser General Public License for more details.
#
# You should have received a copy of the GNU Lesser General Public License
# along with IfcOpenShell.  If not, see <http://www.gnu.org/licenses/>.

import lark

import ifcopenshell.api.control
import ifcopenshell.api.cost
import ifcopenshell.util.element


def assign_cost_item_quantity(
    file: ifcopenshell.file,
    cost_item: ifcopenshell.entity_instance,
    products: list[ifcopenshell.entity_instance],
    prop_name: str = "",
    formula: str = "",
    ifc_class: str = "IfcQuantityLength",
) -> None:
    """Adds a cost item quantity that is parametrically connected to a product

    A cost item may have its subtotal calculated by multiplying a unit value
    by a quantity associated with the cost item. That quantity may be either
    manually specified or parametrically connected to a quantity on a
    product. This API function lets you create that parametric connection.

    For example, you may wish to have a cost item linked to the "NetVolume"
    quantity on all IfcSlabs. Each quantity has a name which you can
    specify. If the quantity is updated in-place (which should occur for
    Native IFC applications) then the quantity for the cost item will
    automatically update as well. If the quantity is deleted and then
    re-added, then the parametric relationship is also lost.

    This API also automatically assigns a control relationship between the
    cost item and the product, so it is not necessary to use
    ifcopenshell.api.control.assign_control.

    If cost item has just 1 quantity and it's IfcQuantityCount, API will
    assume that quantity is used for counting controlled objects
    and it will recalculate the quantity value at the end of the API call
    as long as the RelatedObjects are not IfcConstructionResource which do not
    count towards the cost item (they only provide value).

    :param cost_item: The IfcCostItem to assign parametric quantities to
    :param products: The IfcObjects to assign parametric quantities to
    :param prop_name: The name of the quantity. If this is not specified,
        then it is assumed that there is no calculated quantity, and the
        number of objects are counted instead.
    :param formula: The string that contains the formula
    :param ifc_class: The quantity class of the calculated value if the formula is
        specified. Can be ['IfcQuantityCount', 'IfcQuantityNumber',
        'IfcQuantityLength', 'IfcQuantityArea', 'IfcQuantityVolume',
        'IfcQuantityWeight', 'IfcQuantityTime']. Check
        ifcopenshell.util.unit.QUANTITY_CLASS for more info.
    :return: None

    Example:

    .. code:: python

        schedule = ifcopenshell.api.cost.add_cost_schedule(model)
        item = ifcopenshell.api.cost.add_cost_item(model, cost_schedule=schedule)

        # Let's imagine a unit cost of 5.0 per unit volume
        value = ifcopenshell.api.cost.add_cost_value(model, parent=item)
        ifcopenshell.api.cost.edit_cost_value(model, cost_value=value,
            attributes={"AppliedValue": 5.0})

        slab = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSlab")
        # Usually the quantity would be automatically calculated via a
        # graphical authoring application but let's assign a manual quantity
        # for now.
        qto = ifcopenshell.api.pset.add_qto(model, product=slab, name="Qto_SlabBaseQuantities")
        ifcopenshell.api.pset.edit_qto(model, qto=qto, properties={"NetVolume": 42.0})

        # Now let's parametrically link the slab's quantity to the cost
        # item. If the slab is edited in the future and 42.0 changes, then
        # the updated value will also automatically be applied to the cost
        # item.
        ifcopenshell.api.cost.assign_cost_item_quantity(model,
            cost_item=item, products=[slab], prop_name="NetVolume")

        # Now let's use the formula in order to calculate the quantity value.
        # For example, let's say that a IfcWall has the reinfocement volume ratio
        # stored in the Pset_ConcreteElementGeneral.ReinforcementVolumeRatio
        # and of course it has also the gross volume stored in the
        # Qto_WallBaseQuantities.GrossVolume. So we can add an IfcQuantity that stores the
        # reinforcement volume calculated with reinfocement volume ratio * gross volume.
        ifcopenshell.api.cost.assign_cost_item_quantity(model,
            cost_item=item, products=[wall],
            formula="Pset_ConcreteElementGeneral.ReinforcementVolumeRatio * NetVolume"
            ifc_class="IfcQuantityVolume")

    """
    usecase = Usecase()
    usecase.file = file
    return usecase.execute(
        cost_item=cost_item,
        products=products or [],
        prop_name=prop_name,
        formula=formula,
        ifc_class=ifc_class,
    )


class Usecase:
    file: ifcopenshell.file

    def execute(
        self,
        cost_item: ifcopenshell.entity_instance,
        products: list[ifcopenshell.entity_instance],
        prop_name: str,
        formula: str,
        ifc_class: str,
    ):
        self.cost_item = cost_item
        self.prop_name = prop_name
        if self.prop_name or formula:
            self.quantities = set(cost_item.CostQuantities or [])
        for product in products:
            if product.is_a("IfcSpatialElement") and not product.is_a("IfcSpace"):
                continue
            ifcopenshell.api.control.assign_control(
                self.file,
                related_objects=[product],
                relating_control=cost_item,
            )
            if formula:
                tree = formula_grammar.parse(formula)
                variables = get_formula_variables(tree)

                values: dict[str, float | None] = {}
                for variable in variables:
                    getter = self.get_value_from_pset if "." in variable else self.get_value_from_qset
                    value = getter(product, variable)
                    values[variable] = value

                    if value is None:
                        print(
                            f"WARNING: Variable '{variable}' in product '{product.Name}' "
                            f"is missing (None). Check Pset/Qset or property name."
                        )
                    elif value == 0:
                        print(
                            f"WARNING: Variable '{variable}' in product '{product.Name}' "
                            f"has value 0. Verify if this is correct."
                        )

                result = evaluate_formula(tree, values)

                new_quantity = None
                for quantity in self.quantities:
                    if quantity.Formula == formula and len(products) == 1:  # Todo improve it
                        new_quantity = quantity
                        ifc_class = quantity.is_a()
                        continue
                if new_quantity is None:
                    new_quantity = self.file.create_entity(ifc_class, Name="Unnamed")
                    new_quantity.Formula = formula
                    self.quantities.add(new_quantity)

                new_quantity[3] = result
                continue

            if self.prop_name:
                if cost_item.CostQuantities and cost_item.CostQuantities[0].Name.lower() != self.prop_name.lower():
                    continue
                self.add_quantity_from_related_object(product)
        if self.prop_name or formula:
            cost_item.CostQuantities = list(self.quantities)
        else:
            self.update_cost_item_count()

    def get_value_from_pset(
        self,
        product: ifcopenshell.entity_instance,
        v: str,
    ) -> float | None:
        pset_name = v.split(".")[0]
        pset = ifcopenshell.util.element.get_pset(product, pset_name)
        pset_property_name = v.split(".")[1]
        return (pset or {}).get(pset_property_name, None)

    def get_value_from_qset(
        self,
        product: ifcopenshell.entity_instance,
        v: str,
    ) -> float | None:
        qtos = ifcopenshell.util.element.get_psets(product, qtos_only=True)
        quantities = next(iter(qtos.values()), {})
        return (quantities or {}).get(v, None)

    def add_quantity_from_related_object(self, element: ifcopenshell.entity_instance) -> None:
        for relationship in element.IsDefinedBy:
            if relationship.is_a("IfcRelDefinesByProperties"):
                self.add_quantity_from_qto(relationship.RelatingPropertyDefinition)

    def add_quantity_from_qto(self, qto: ifcopenshell.entity_instance) -> None:
        if not qto.is_a("IfcElementQuantity"):
            return
        for prop in qto.Quantities:
            if prop.is_a("IfcPhysicalSimpleQuantity") and prop.Name.lower() == self.prop_name.lower():
                self.quantities.add(prop)

    def update_cost_item_count(self):
        cost_item = self.cost_item
        # This is a bold assumption
        # https://forums.buildingsmart.org/t/how-does-a-cost-item-know-that-it-is-counting-a-controlled-product/3564
        if not cost_item.CostQuantities:
            ifcopenshell.api.cost.add_cost_item_quantity(
                self.file,
                cost_item=cost_item,
                ifc_class="IfcQuantityCount",
            )
        if len(cost_item.CostQuantities) == 1:
            quantity = cost_item.CostQuantities[0]
            if quantity.is_a("IfcQuantityCount"):
                count = 0
                for rel in cost_item.Controls:
                    for obj in rel.RelatedObjects:
                        # Only increment if not a resource
                        if not obj.is_a("IfcConstructionResource"):
                            count += 1
                quantity[3] = count


# Arithmetic of numbers and of (dotted) property names, as in "Qto_WallBaseQuantities.NetVolume * 2".
formula_grammar = lark.Lark(
    """start: sum
    ?sum: product
        | sum "+" product -> add
        | sum "-" product -> sub
    ?product: power
        | product "*" power -> mul
        | product "/" power -> truediv
    ?power: atom
        | atom "**" power -> pow
    ?atom: NUMBER -> number
        | variable
        | "(" sum ")"
    variable: CNAME ("." CNAME)*

    // Embed common.lark for packaging
    DIGIT: "0".."9"
    INT: DIGIT+
    SIGNED_INT: ["+"|"-"] INT
    DECIMAL: INT "." INT? | "." INT
    _EXP: ("e"|"E") SIGNED_INT
    FLOAT: INT _EXP | DECIMAL _EXP?
    NUMBER: FLOAT | INT
    LCASE_LETTER: "a".."z"
    UCASE_LETTER: "A".."Z"
    LETTER: UCASE_LETTER | LCASE_LETTER
    CNAME: ("_"|LETTER) ("_"|LETTER|DIGIT)*
    WS: /[ \\t\\f\\r\\n]/+

    %ignore WS
    """,
    parser="lalr",
)


def get_formula_variables(node: lark.Tree) -> set[str]:
    """The names of the variables of a parsed formula, as "Pset.Property" for dotted names."""
    if node.data == "variable":
        return {".".join(token.value for token in node.children)}
    variables: set[str] = set()
    if node.data != "number":
        for child in node.children:
            variables |= get_formula_variables(child)
    return variables


def evaluate_formula(node: lark.Tree, values: dict[str, float | None]) -> float | None:
    """The value of a parsed formula, with the values of its variables."""
    if node.data == "start":
        return evaluate_formula(node.children[0], values)
    if node.data == "number":
        return float(node.children[0].value)
    if node.data == "variable":
        return values[".".join(token.value for token in node.children)]
    left = evaluate_formula(node.children[0], values)
    right = evaluate_formula(node.children[1], values)
    if node.data == "add":
        return left + right
    if node.data == "sub":
        return left - right
    if node.data == "mul":
        return left * right
    if node.data == "truediv":
        return left / right
    return left**right
