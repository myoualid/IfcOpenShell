<!-- This file was generated with the assistance of an AI coding tool. -->

# Python to TypeScript transpiler

Transpiles `ifcopenshell.util` and `ifcopenshell.api` into the `ifcopenshell` npm
package (`src/ts/ifcopenshell-js`), as `ifcopenshell/util/<module>` and
`ifcopenshell/api/<package>`. From the repository root (Python dependencies: `requirements.txt`):

```shell
python src/transpiler/generate.py            # write src/ts/ifcopenshell-js/src/{util,api}
python src/transpiler/generate.py --report   # also write TRACKING.md: per module, what remains, what is tested, what is done
python src/transpiler/generate.py --tests    # also transpile the Python tests into src/ts/ifcopenshell-js/tests/generated
python src/transpiler/transpile.py src/ifcopenshell-python/ifcopenshell/util/unit.py   # one module to stdout
```

The generated code is build output and not committed. Unsupported functions become
throwing stubs, listed with the first unsupported construct in
`src/transpiler/transpile.json`. Unsupported module-level code makes
the whole file a module of throwing functions rather than disappearing.
`precomputed.json` holds the results of the functions listed under `precomputed` in
`ts.yaml`; refresh it with `generate.py --precompute`, which needs an installed
ifcopenshell close to this checkout.

The generated TypeScript targets the `ifcopenshell` npm package's
[Core API](https://docs.ifcopenshell.org/output/typescript-api/Core.html).
The caller initializes IfcOpenShell and supplies the file.

## How it works

`transpile.py` parses Python, discovers bindings, matches patterns and renders
Jinja templates. All translation rules, including types, syntax, API names,
imports and data-shape inference, live in `ts.yaml`. There is no preamble or
runtime compatibility library: rules emit native TypeScript operations directly. Where a function needs a Python library without a TS
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

The unit cache remains a property on the normal `ifcopenshell.File` object.
No utility-specific file type or module augmentation is generated. Properties
missing from the target API may produce TypeScript typing errors; those need
resolution in the source/API rather than synthetic types in the transpiler.
Loops, defaults, keyword calls to local functions, unpacking, comprehensions and
unit conversions are supported. Unknown calls are rejected. Types (see below), inference
and API mappings cover the patterns in the source, rather than general Python semantics.
Where the type of a value is not known, the Python gets the type annotation it lacks.
No Python or WASM code is executed during translation.

## Types

`mypy_types.py` proves the types of expressions with mypy, and `ts.yaml` asks for them through the
`kind` and `nullable` filters. A plugin gives IFC attributes their types from `attributes.json`,
which `generate.py --precompute` refreshes. Results are cached in `types.json` (not committed) and
recomputed when the Python source changes; that takes a minute or two. `requirements.txt` installs
the pure Python build of mypy, since `mypy_types.py` subclasses its visitors.

## Unsupported modules

The generated code does not emulate Python libraries. Functions that use `datetime` arithmetic,
`isodate`, `dateutil`, `lark`, `shapely`, Blender modules or native functions that the WASM build
does not expose become stubs that throw with the reason; `transpile.json` lists them.

numpy vectors and matrices are plain arrays of numbers (a matrix is an array of rows). For a value
that mypy types as a numpy array, the rules map `np.cross(a, b)`, `a @ b`, `a + b` and stores such as
`m[:3, 3] = v` to `src/helpers/linalg.ts`, a small module of vector and matrix functions
(`runtime_modules` lists its names). It is not numpy: an operation takes two operands of the same
shape, or one of them and a number. numpy functions of numbers (`np.cos(x)`) become `Math` functions.
A function that uses another numpy name or form (`axis` arguments, arrays of indices, reshapes)
stays a stub.

The rules write native TS for the kinds they know (`mypy_types.py` proves them): a truth
test of a list is `.length > 0`, a set is a `Set`, a dict with entity or number keys is a `Map`,
a pattern is a `RegExp`. An expression whose kind is not known makes its function a stub, with
the expression in the reason; typing the Python is the way to translate it. A `File` keeps one
wrapper per entity, so `===`, `Set` and `Map` compare entities by identity, as Python's `==` does.

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

## Tests

The tests of the generated code are the Python tests of `util` and `api`
(`src/ifcopenshell-python/test`), transpiled with the same rules by `generate.py --tests`
(`tests.py`). Each test class becomes a plain class: its base classes are inlined (the setup
fixture of `test/bootstrap.py` and the test classes of the same file that it extends), and each
test method becomes a vitest test. A test method that the rules cannot translate becomes a
skipped test with the reason. The `test_modules` and `test_suite` entries and the pytest rules
of `ts.yaml` cover pytest (`pytest.raises`, `pytest.approx`, `pytest.mark.parametrize`).

```shell
cd src/ts/ifcopenshell-js
npm run generate -- --tests
npm run build
IFCOPENSHELL_WASM_DIR=<the WASM build> npm run test:report   # also writes src/transpiler/test-results.json
python ../../transpiler/generate.py --report                 # TRACKING.md with the test results per module
```

The generated tests import the built package (`dist`), and are not committed.
