# This file was generated with the assistance of an AI coding tool.
# SPDX-License-Identifier: LGPL-3.0-or-later
"""Types of Python expressions, proven by mypy, so rules do not have to guess them.

`entity_instance.__getattr__` is opaque to mypy, so a plugin gives IFC attributes their types from
attributes.json. `analyze()` maps each module to the kinds of its expressions, by source position:
{module: {"line:column:end_line:end_column": [kind, nullable]}}. Unproven expressions are left out.

Needs the pure Python build of mypy (requirements.txt), since its visitors are subclassed here.
"""

import hashlib
import json
from pathlib import Path

HERE = Path(__file__).parent
ATTRIBUTES = HERE / "attributes.json"
CACHE = HERE / "types.json"
PYTHON = HERE.parent / "ifcopenshell-python"
SCALARS = {"boolean", "number", "string", "entity", "file", "scalar"}
SEQUENCES = {"builtins.list", "builtins.tuple", "typing.Sequence", "typing.MutableSequence"}
SETS = {"builtins.set", "builtins.frozenset", "typing.AbstractSet", "typing.MutableSet"}
SIMPLE = {"integer": "number", "real": "number", "number": "number", "string": "string", "binary": "string", "boolean": "boolean", "logical": "boolean"}


def attribute_type(declared):
    """A type name of attributes.json: boolean, number, string, entity, or [element]."""
    import ifcopenshell.ifcopenshell_wrapper as W

    if isinstance(declared, W.aggregation_type):
        return [attribute_type(declared.type_of_element())]
    if isinstance(declared, W.named_type):
        return attribute_type(declared.declared_type())
    if isinstance(declared, W.type_declaration):
        return attribute_type(declared.declared_type())
    if isinstance(declared, W.simple_type):
        return SIMPLE[declared.declared_type()]
    if isinstance(declared, W.enumeration_type):
        return "string"
    return "entity"  # Entities, and selects, whose values are wrapped in entity instances.


def schema_attributes():
    """Every attribute name in the schemas, with its possible types; needs an installed ifcopenshell."""
    import ifcopenshell.ifcopenshell_wrapper as W

    attributes = {}

    def add(name, declared, optional):
        entry = attributes.setdefault(name, {"types": [], "optional": False})
        if declared not in entry["types"]:
            entry["types"].append(declared)
        entry["optional"] |= optional

    for schema in ("IFC2X3", "IFC4", "IFC4X3_ADD2"):
        for declaration in W.schema_by_name(schema).declarations():
            entity = declaration.as_entity()
            if entity:
                for attribute in entity.attributes():
                    add(attribute.name(), attribute_type(attribute.type_of_attribute()), attribute.optional())
                for inverse in entity.inverse_attributes():
                    add(inverse.name(), ["entity"], False)
    return {name: attributes[name] for name in sorted(attributes)}


def sources():
    package = PYTHON / "ifcopenshell"
    paths = sorted(package.glob("util/*.py")) + sorted(package.glob("api/*/*.py"))
    return [path for path in paths if path.stem != "__init__"]


def fingerprint():
    digest = hashlib.sha256()
    for path in [Path(__file__), ATTRIBUTES, *sources()]:
        digest.update(path.read_bytes())
    return digest.hexdigest()


def classify(proper, types):
    """(kind, nullable) of a mypy type, or None when it does not say what the value is."""
    nullable = False
    if isinstance(proper, types.UnionType):
        items = [types.get_proper_type(item) for item in proper.items]
        known = [item for item in items if not isinstance(item, types.NoneType)]
        nullable = len(known) != len(items)
        kinds = {classify(item, types) for item in known}
        kinds = {kind and kind[0] for kind in kinds}
        if len(kinds) == 1 and None not in kinds:
            return kinds.pop(), nullable
        return ("scalar", nullable) if kinds <= SCALARS else None
    if isinstance(proper, types.LiteralType):
        proper = proper.fallback
    if isinstance(proper, types.TupleType):
        return "array", False
    if isinstance(proper, types.TypedDictType):
        return "dict", False
    if not isinstance(proper, types.Instance):
        return None
    name = proper.type.fullname
    if name == "builtins.bool":
        return "boolean", False
    if name in ("builtins.int", "builtins.float"):
        return "number", False
    if name == "builtins.str":
        return "string", False
    if name in SEQUENCES:
        return "array", False
    if name in SETS:
        return "set", False
    if name.startswith("numpy."):
        return "ndarray", False
    if name.endswith((".entity_instance", ".entity_instance_mixin")):
        return "entity", False
    if name == "ifcopenshell.file.file":
        return "file", False
    return None


def analyze():
    """Run mypy over util and api."""
    from mypy import build, nodes, options, traverser, types
    from mypy.modulefinder import BuildSource
    from mypy.plugin import Plugin

    attributes = json.loads(ATTRIBUTES.read_text(encoding="utf-8"))

    class SchemaAttributes(Plugin):
        def get_attribute_hook(self, fullname):
            prefix, _, name = fullname.rpartition(".")
            if prefix == "ifcopenshell.entity_instance.entity_instance_mixin" and name in attributes:
                return lambda context: self.attribute(context, attributes[name])
            return None

        def attribute(self, context, entry):
            def to_type(declared):
                if isinstance(declared, list):
                    return context.api.named_generic_type("builtins.list", [to_type(declared[0])])
                if declared == "entity":
                    return context.type
                python = {"boolean": "bool", "number": "float", "string": "str"}[declared]
                return context.api.named_generic_type(f"builtins.{python}", [])

            items = [to_type(declared) for declared in entry["types"]]
            if entry["optional"]:
                items.append(types.NoneType())
            return types.UnionType.make_union(items)

    package = PYTHON / "ifcopenshell"
    modules = [
        BuildSource(str(path), ".".join(path.relative_to(PYTHON).with_suffix("").parts)) for path in sources()
    ]
    settings = options.Options()
    settings.export_types = True
    settings.preserve_asts = True
    settings.check_untyped_defs = True
    settings.ignore_missing_imports = True
    settings.follow_imports = "silent"
    settings.incremental = False
    settings.namespace_packages = True
    settings.explicit_package_bases = True
    settings.mypy_path = [str(PYTHON)]
    result = build.build(modules, settings, extra_plugins=[SchemaAttributes(settings)])

    class Expressions(traverser.ExtendedTraverserVisitor):
        def __init__(self):
            self.kinds = {}

        def visit(self, node):
            if isinstance(node, nodes.Expression) and node in result.types:
                kind = classify(types.get_proper_type(result.types[node]), types)
                if kind:
                    self.kinds[f"{node.line}:{node.column}:{node.end_line}:{node.end_column}"] = kind
            return True

    found = {}
    for module in modules:
        if module.module in result.files:
            expressions = Expressions()
            result.files[module.module].accept(expressions)
            found[module.module.removeprefix("ifcopenshell.")] = expressions.kinds
    return found


def load():
    """Types of this checkout, from the cache when nothing they depend on changed."""
    key = fingerprint()
    if CACHE.exists():
        cached = json.loads(CACHE.read_text(encoding="utf-8"))
        if cached["fingerprint"] == key:
            return cached["modules"]
    modules = analyze()
    CACHE.write_text(json.dumps({"fingerprint": key, "modules": modules}), encoding="utf-8")
    return modules
