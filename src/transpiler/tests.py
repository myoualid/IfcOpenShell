# This file was generated with the assistance of an AI coding tool.
# SPDX-License-Identifier: LGPL-3.0-or-later
"""Transpile the pytest tests of ifcopenshell.util and ifcopenshell.api into vitest tests.

Each test class becomes a plain class: its base classes are inlined (the setup fixture of
test/bootstrap.py, and the test classes of the same file that it extends), then the
transpiler translates the module as it translates util and api. The `test_suite` template
of the rules adds a vitest suite that runs each test method; a method that the transpiler
stubs becomes a skipped test with the reason.
"""

import ast
import copy
import json
from pathlib import Path

from transpile import PACKAGE, camel

TEST_ROOT = PACKAGE.parent / "test"
BOOTSTRAP = TEST_ROOT / "bootstrap.py"
# Statements of the setup fixtures that reset Python state which the TS port does not have (API listeners).
RESETS = {"ifcopenshell.api.pre_listeners", "ifcopenshell.api.post_listeners"}


def test_sources():
    """(Python test file, output path below tests/generated, the module it tests: util/x or api/p)."""
    for path in sorted(TEST_ROOT.glob("util/test_*.py")):
        yield path, Path("util") / f"{path.stem}.test.ts", f"util/{path.stem[len('test_'):]}"
    for path in sorted(TEST_ROOT.glob("api/*/test_*.py")):
        yield path, Path("api") / path.parent.name / f"{path.stem}.test.ts", f"api/{path.parent.name}"


def is_test_import(node):
    if not isinstance(node, (ast.Import, ast.ImportFrom)):
        return False
    names = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
    return any(n == "test" or n.startswith("test.") for n in names)


def parametrize(decorators, parameters):
    """The cases of stacked @pytest.mark.parametrize, as argument lists in the order of `parameters`, or a reason
    why they cannot run (cases computed at run time, or parameters that are pytest fixtures)."""
    cases = [{}]
    for decorator in decorators:
        names = ast.literal_eval(decorator.args[0])
        names = [n.strip() for n in names.split(",")] if isinstance(names, str) else list(names)
        try:
            values = ast.literal_eval(decorator.args[1])
        except ValueError:
            return None, "pytest.mark.parametrize with cases computed at run time"
        values = [list(v) if len(names) > 1 else [v] for v in values]
        cases = [case | dict(zip(names, v)) for case in cases for v in values]
    if set(cases[0]) != set(parameters):
        return None, f"pytest fixtures {', '.join(p for p in parameters if p not in cases[0])}"
    return ([[case[p] for p in parameters] for case in cases] if parameters else None), None


def test_function(item, method):
    """Remove the decorators and Python state resets of a test function or method; give its test, if it is one."""
    decorators = [d for d in item.decorator_list if ast.unparse(d).startswith("pytest.mark.parametrize")]
    skipped = any(ast.unparse(d).startswith("pytest.mark.skip") for d in item.decorator_list)
    item.decorator_list = []
    item.body = [
        s for s in item.body if not (isinstance(s, ast.Assign) and {ast.unparse(t) for t in s.targets} <= RESETS)
    ] or [ast.Pass()]
    if not item.name.startswith("test"):
        return None
    cases, skip = parametrize(decorators, [a.arg for a in item.args.args[1 if method else 0 :]])
    return {"name": item.name, "function": camel(item.name), "cases": cases, "skip": "skipped in Python" if skipped else skip}


def rewrite(source):
    """The module with each test class as a plain class, and the suites that the test_suite template runs: one per
    test class, and one (with no name) for the test functions of the module."""
    tree = ast.parse(source)
    bootstrap = {n.name: n for n in ast.parse(BOOTSTRAP.read_text(encoding="utf-8")).body if isinstance(n, ast.ClassDef)}
    # A later definition replaces an earlier one with the same name, as in Python.
    last = {n.name: i for i, n in enumerate(tree.body) if isinstance(n, (ast.ClassDef, ast.FunctionDef))}
    nodes = [
        n
        for i, n in enumerate(tree.body)
        if not (isinstance(n, (ast.ClassDef, ast.FunctionDef)) and last[n.name] != i)
        and not is_test_import(n)
        # Some test files also call their test functions when they are imported.
        and not (
            isinstance(n, ast.Expr)
            and isinstance(n.value, ast.Call)
            and isinstance(n.value.func, ast.Name)
            and n.value.func.id.startswith("test")
        )
    ]
    # A = ifcopenshell.api.alignment is the import of a module under another name.
    for i, n in enumerate(nodes):
        if (
            isinstance(n, ast.Assign)
            and len(n.targets) == 1
            and isinstance(n.targets[0], ast.Name)
            and isinstance(n.value, ast.Attribute)
            and ast.unparse(n.value).startswith("ifcopenshell.")
            and PACKAGE.joinpath(*ast.unparse(n.value).split(".")[1:]).is_dir()
        ):
            nodes[i] = ast.copy_location(ast.Import([ast.alias(ast.unparse(n.value), n.targets[0].id)]), n)
    classes = {n.name: n for n in nodes if isinstance(n, ast.ClassDef)}

    def members(node):
        """Methods and class attributes by name, in Python's method resolution order."""
        result = {}
        for base in reversed(node.bases):
            name = ast.unparse(base)
            inherited = bootstrap.get(name.removeprefix("test.bootstrap.")) if name.startswith("test.") else classes.get(name)
            if inherited is not None:
                result |= members(inherited)
        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.Assign, ast.AnnAssign)):
                key = item.name if isinstance(item, ast.FunctionDef) else ast.unparse(item.targets[0] if isinstance(item, ast.Assign) else item.target)
                result[key] = item
        return result

    functions = {"name": None, "tests": [], "setup": False}
    suites, body = [functions], []
    for node in nodes:
        if isinstance(node, ast.FunctionDef):
            if test := test_function(node, method=False):
                functions["tests"].append(test)
        if not (isinstance(node, ast.ClassDef) and node.name.startswith("Test")):
            body.append(node)
            continue
        items, tests = [], []
        for item in members(node).values():
            item = copy.deepcopy(item)
            if isinstance(item, ast.FunctionDef) and (test := test_function(item, method=True)):
                tests.append(test)
            items.append(item)
        # The file that the setup fixture creates; the transpiler types self.file from it.
        annotation = ast.AnnAssign(ast.Name("file", ast.Store()), ast.parse("ifcopenshell.file", mode="eval").body, None, 1)
        body.append(ast.ClassDef(node.name, [], [], [annotation] + items, []))
        suites.append({"name": node.name, "tests": tests, "setup": "setup" in {i.name for i in items if isinstance(i, ast.FunctionDef)}})
    tree.body = body
    return ast.unparse(ast.fix_missing_locations(tree)), [s for s in suites if s["tests"]]


def translate(compiler, path, output, tested_module):
    """The vitest file for one Python test file, and the reasons of its stubbed tests."""
    code, suites = rewrite(path.read_text(encoding="utf-8"))
    relative = path.relative_to(TEST_ROOT.parent).as_posix()
    module = "test." + ".".join(path.relative_to(TEST_ROOT).with_suffix("").parts)
    # The generated tests import the built package, as the WASM runtime that _helper.ts starts is that one.
    root = "../" * (len(output.parts) + 1) + "dist/"
    rules = compiler.rules
    supported = rules["supported_modules"]
    rules["supported_modules"] = supported + rules.get("test_modules", [])
    try:
        result = compiler.translate(code, module, root=root, source_path=f"ifcopenshell-python/{relative}")
    finally:
        rules["supported_modules"] = supported
    stubs = {}
    for diagnostic in compiler.unsupported:
        name, _, reason = str(diagnostic).partition(": ")
        stubs[name] = reason
    for suite in suites:
        whole = stubs.get(suite["name"]) if suite["name"] else None
        for test in suite["tests"]:
            name = f"{suite['name']}.{test['name']}" if suite["name"] else test["name"]
            reason = whole or stubs.get(name) or (stubs.get(f"{suite['name']}.setup") if suite["setup"] else None)
            test["skip"] = test["skip"] or reason
    suite_code = compiler.render(
        rules["test_suite"],
        {"suites": suites, "python_path": relative, "tested_module": tested_module, "helper": "../" * len(output.parts) + "_helper.js", "json": json.dumps},
    )
    return result + "\n" + suite_code + "\n", suites
