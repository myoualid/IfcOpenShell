<!-- This file was generated with the assistance of an AI coding tool. -->

# Python to TypeScript transpiler

Transpiles `ifcopenshell.util` and `ifcopenshell.api` into the `ifcopenshell` npm
package (`src/ts/ifcopenshell-js`), as `ifcopenshell/util/<module>` and
`ifcopenshell/api/<package>`. From the repository root (Python dependencies: `requirements.txt`):

```shell
python src/transpiler/generate.py            # write src/ts/ifcopenshell-js/src/{util,api}
python src/transpiler/generate.py --report   # also write TRACKING.md: per module, what remains, what is tested, what is done
python src/transpiler/transpile.py src/ifcopenshell-python/ifcopenshell/util/unit.py   # one module to stdout
```

The generated code is build output and not committed. Unsupported functions become
throwing stubs, listed with the first unsupported construct in
`src/transpiler/transpile.json`. That file is committed as the coverage baseline: after a
change to the rules or the Python source, its diff shows which functions changed status. Unsupported module-level code makes
the whole file a module of throwing functions rather than disappearing.
`precomputed.json` holds the results of the functions listed under `precomputed` in
`ts.yaml`; refresh it with `generate.py --precompute`, which needs an installed
ifcopenshell close to this checkout.

## How it works

`transpile.py` parses Python, discovers bindings, matches patterns and renders
Jinja templates. All translation rules, including types, syntax, API names,
imports and data-shape inference, live in `ts.yaml`. Rules emit plain TypeScript. Where a function needs a Python library without a TS
counterpart, or a type that cannot be proven, it becomes a stub.
Pass `--rules another.yaml` to use a different rule set. Treat rule files as trusted code.

Patterns use Python AST field names, with `node` specifying the AST class.
`$name` captures a field; lists match exactly; omitted fields are unconstrained.
Rules run in order, first match wins. `where` optionally restricts a captured
receiver to a Python parameter annotation. `when` is a Jinja expression that
can further restrict a match. Templates use `emit` for recursive translation,
`type` for annotations, and `literal` for JSON literals. `kind` queries the
YAML inference rules. The engine propagates those results through bindings;
it does not choose target-language operations. YAML tables such as `methods`
and `operators` are also available to templates and conditions.

For example, the comprehension rule translates this restricted expression:

```python
[u for u in ifc_file.by_type("IfcNamedUnit") if u.UnitType == unit_type]
```

```typescript
ifc_file.byType("IfcNamedUnit").filter((u: any) => (u.UnitType === unit_type))
```

Specific comparison rules select `.includes()` for strings/arrays and
`Object.hasOwn()` for dictionaries. Tuple equality uses `.every()`. Dictionary
iteration uses `Object.keys()`/`Object.entries()`, and `range` loops use a native
counter. `condition` and `iterable` template filters select rules with the
matching `context`; these handle empty arrays/dictionaries at their use sites.
Scalar short-circuit expressions use `&&`/`||`; optional collections use `??`.

Select the exploratory C++ target explicitly:

```powershell
python src/transpiler/transpile.py src/ifcopenshell-python/ifcopenshell/util/unit.py --rules src/transpiler/cpp.yaml -o src/transpiler/unit.cpp
```

`ts.yaml` remains the default. `cpp.yaml` uses the same engine, with its own
indented rules and copies of the source data-shape inference rules. No inheritance
from the TypeScript target is required.

The C++20 sketch uses `std::map`, `std::vector`, `std::array`, `std::optional`,
range loops, structured bindings, and immediately invoked lambdas to materialize
comprehensions. Boost string algorithms keep string rewrites concise. IFC mappings
reference this checkout's `ifcopenshell::file`, `instances_by_type`, value-like
`express::entity`, and `get_value<T>` interfaces.

`unit.cpp` is a design artifact, not a compilable implementation. It renders bodies
for 21 of the 33 functions and emits throwing stubs for the rest. TODOs expose
unresolved local declaration scopes, optional unwrapping, container conversions,
recursive variants and operand-valued short-circuiting. Forward declarations,
string/enum decoding, attribute writes, caches and schema-specific casts also
need decisions. Dynamic attribute types currently come from a small explicit
YAML table. No C++ compilation or runtime validation was attempted.

## Types

`mypy_types.py` proves the types of expressions with mypy, and `ts.yaml` asks for them through the
`kind` and `nullable` filters. A plugin gives IFC attributes their types from `attributes.json`,
which `generate.py --precompute` refreshes. Results are cached in `types.json` (not committed) and
recomputed when the Python source changes; that takes a minute or two. `requirements.txt` installs
the pure Python build of mypy, since `mypy_types.py` subclasses its visitors.

## Unsupported modules

The generated code does not emulate Python libraries. Functions that use `numpy`, `datetime`
arithmetic, `isodate`, `dateutil`, `lark`, `shapely`, Blender modules or native functions that
the WASM build does not expose become stubs that throw with the reason; `transpile.json` lists
them. `src/ts/ifcopenshell-js/src/helpers/lang.ts` holds the few Python semantics that plain TS
does not give, such as the truthiness of empty containers.

LALR grammars (`lark.Lark(grammar, parser="lalr")`) become [Lark.js](https://github.com/lark-parser/lark.js)
parsers: `generate.py` runs lark-js on the same grammar and writes `<module>_grammar<n>.js` (an ES module), with its type
declarations, next to the generated module. Install `requirements.txt` in its own environment, as it pins
`lark` for lark-js.

`generate.py` also writes `api/index.ts` and `util/index.ts`, which export every package and
module as a namespace (`ifcopenshell/api`, `ifcopenshell/util`; the latter re-exports the
hand-written helpers of `src/helpers`).

## Building

```shell
cd src/ts/ifcopenshell-js
npm ci
npm run generate   # transpile into src/util and src/api (a few minutes: mypy)
npm run build      # type-checks and compiles the generated code into dist/util and dist/api
```

The generated code is not committed, so run `generate` and `build` after changing the rules or
the Python source.
