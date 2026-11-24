# This file was generated with the assistance of an AI coding tool.
# SPDX-License-Identifier: LGPL-3.0-or-later
"""Transpile ifcopenshell.util and ifcopenshell.api into the ifcopenshell npm package.

Writes src/util and src/api of src/ts/ifcopenshell-js, which are build output
and not committed, from this checkout's Python source, the rules and precomputed.json.
transpile.json lists each module's untranslated functions; `--report` also writes
TRACKING.md (not committed), with the results of the last `npm run test:report`, and `--tests`
transpiles the Python tests into tests/generated (see tests.py). Needs only
PyYAML and Jinja2 (requirements.txt). `--precompute` refreshes precomputed.json, which needs
an installed ifcopenshell close to this checkout.
"""

import argparse
import ast
import collections
import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

import mypy_types
import tests
import yaml
from transpile import PACKAGE, Transpiler, build_index, camel, module_name

HERE = Path(__file__).parent
OUTPUT = HERE.parent / "ts" / "ifcopenshell-js" / "src"
MANIFEST = HERE / "transpile.json"
PRECOMPUTED = HERE / "precomputed.json"
RESULTS = HERE / "test-results.json"
TRACKING = HERE / "TRACKING.md"
TESTS_OUTPUT = HERE.parent / "ts" / "ifcopenshell-js" / "tests" / "generated"
# Modules that are not ported, and why: their functions throw, so other modules still import them.
NOT_PORTED = {
    "util/doc": "documentation script",
    "util/generate_pset_templates": "developer script",
    "util/ifc4x3dev_scrape_data_for_docs": "developer script",
    "util/profiler": "developer script",
    "util/boundary": "2D geometry with shapely and the geometry iterator",
    "util/space": "2D geometry with shapely, the geometry iterator and processes",
    "util/brick": "Brick schema with rdflib and local files",
    "util/file": "reads files from disk",
    "api/alignment/create_from_csv": "reads a CSV file from disk",
    "api/geometry/add_representation": "Blender objects (Bonsai)",
    "api/style/add_surface_textures": "Blender materials (Bonsai)",
}
HEADER = "// This file was generated with the assistance of an AI coding tool.\n// SPDX-License-Identifier: LGPL-3.0-or-later\n"


def sources():
    for path in sorted(PACKAGE.glob("util/*.py")):
        if path.stem != "__init__":
            yield path, Path("util") / f"{path.stem}.ts"
    for path in sorted(PACKAGE.glob("api/*/*.py")):
        if path.stem != "__init__":
            yield path, Path("api") / path.parent.name / f"{path.stem}.ts"


def polish(code):
    """Spellings a rule cannot choose: object shorthand, and filter for a copy with one item removed."""
    code = re.sub(r"\b(\w+): \1\b(?= *[,}=])", r"\1", code)
    removed = r"^( *)((?:const |let )?)(\w+)((?:: any)?) = (.+);\n *if \(\3\.includes\((.+)\)\) \3\.splice\(\3\.indexOf\(\6\), 1\);;?$"
    return re.sub(removed, r"\1\2\3\4 = \5.filter((item: any) => item !== \6);", code, flags=re.M)


def write_parsers(grammars, folder, source_path):
    """Write a Lark.js parser and its type declarations for each LALR grammar of a module."""
    for name, grammar in grammars.items():
        with tempfile.TemporaryDirectory() as temporary:
            grammar_file = Path(temporary) / f"{name}.lark"
            grammar_file.write_text(grammar, encoding="utf-8")
            # Python's Lark gives a None for each missing [optional] item; so does this parser.
            command = [sys.executable, "-m", "larkjs", str(grammar_file), "-o", str(folder / f"{name}.cjs")]
            subprocess.run(command + ["--maybe_placeholders"], check=True)
        (folder / f"{name}.d.cts").write_text(
            f"// Lark.js parser of a grammar in ifcopenshell/{source_path.relative_to(PACKAGE).as_posix()}; written by generate.py.\n"
            "export function get_parser(options?: object): { parse(text: string): any };\n",
            encoding="utf-8",
        )


def stub_module(source, reason):
    """Every top-level function throws, so other modules still import and type-check against it."""
    names = list(dict.fromkeys(n.name for n in ast.parse(source).body if isinstance(n, ast.FunctionDef)))
    message = json.dumps(f"Not transpiled: {reason}")
    return HEADER + "".join(
        f"\nexport function {camel(name)}(..._args: any[]): any {{\n  throw new Error({message});\n}}\n"
        for name in names
    )


def precompute(rules):
    """Run the functions listed under `precomputed` in the rules, from this checkout's source."""
    import importlib.util

    import ifcopenshell

    # The installed build provides the wrapper that the source needs.
    assert ifcopenshell.ifcopenshell_wrapper

    results = {}
    for qualified, arguments in rules.get("precomputed", {}).items():
        module_path, name = qualified.rsplit(".", 1)
        spec = importlib.util.spec_from_file_location(
            f"_precompute.{module_path}", PACKAGE.joinpath(*module_path.split(".")).with_suffix(".py")
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        results[qualified] = {argument: getattr(module, name)(argument) for argument in arguments}
    return results


def test_results():
    """Results of the generated tests (tests/generated) per module, from the last `npm run test:report`."""
    modules = collections.defaultdict(
        lambda: {"passed": 0, "skipped": collections.Counter(), "failed": collections.defaultdict(collections.Counter)}
    )
    if not RESULTS.exists():
        return modules
    for result in json.loads(RESULTS.read_text(encoding="utf-8"))["testResults"]:
        if "/tests/generated/" not in result["name"].replace("\\", "/"):
            continue
        for test in result["assertionResults"]:
            # The suite of a generated file is the module it tests (util/x or api/p), then the test class.
            module = modules[test["ancestorTitles"][0]]
            if test["status"] == "passed":
                module["passed"] += 1
            elif test["status"] == "failed":
                message = re.sub(r"(?<![A-Za-z])\d+", "N", (test["failureMessages"] or ["?"])[0].splitlines()[0])
                name = ".".join(test["ancestorTitles"][1:2] + [test["title"].split(" ")[0]])
                module["failed"][message][name] += 1
            else:
                reason = re.search(r" \((.*)\)$", test["title"])
                module["skipped"][re.sub(r"(?<![A-Za-z])\d+", "N", reason[1]) if reason else "skipped"] += 1
    return modules


def tracking(manifest):
    """Write TRACKING.md: per module what remains to do first, what is done last."""
    groups = collections.defaultdict(lambda: {"done": 0, "total": 0, "missing": []})
    blockers = collections.Counter()
    unported = []
    for key, entry in manifest.items():
        if entry.get("error", "").startswith("not ported"):
            unported.append(f"{key} ({entry['error'].split(': ', 1)[1]})")
            continue
        group = groups[key if key.startswith("util/") else "/".join(key.split("/")[:2])]
        missing = {"(whole module)": entry["error"]} if "error" in entry else entry.get("stubs", {})
        group["total"] += entry["functions"]
        stubbed = {k.split(".")[0] for k in missing if not k.startswith("line ")}  # "line N": a module value
        group["done"] += 0 if "error" in entry else entry["functions"] - len(stubbed)
        group["missing"] += [(f"{Path(key).name}: {name}", reason) for name, reason in missing.items()]
        blockers.update(re.sub(r"^No \w+ rule at line \d+: ", "", reason)[:80] for reason in missing.values())

    results = test_results()
    todo, untested, done = [], [], []
    for name, group in sorted(groups.items()):
        result = results[name]
        group |= {
            "name": name,
            "translated": f"{group['done']}/{group['total']}",
            "passed": result["passed"],
            "skipped": result["skipped"],
            "failed": result["failed"],
            "failures": sum(c for calls in result["failed"].values() for c in calls.values()),
        }
        if group["missing"] or group["failures"]:
            todo.append(group)
        elif not group["passed"]:
            untested.append(group)
        else:
            done.append(group)
    todo.sort(key=lambda g: len(g["missing"]) + g["failures"], reverse=True)

    total = sum(g["total"] for g in groups.values())
    translated = sum(g["done"] for g in groups.values())
    passed, failures = sum(g["passed"] for g in todo + done), sum(g["failures"] for g in todo)
    skipped = sum(sum(g["skipped"].values()) for g in todo + untested + done)
    tested = "none yet; run `npm run test:report`"
    if RESULTS.exists():
        tested = f"from {datetime.fromtimestamp(RESULTS.stat().st_mtime):%Y-%m-%d}"
    lines = [
        "<!-- Generated by `python src/transpiler/generate.py --report`. Do not edit or commit. -->",
        "",
        "# Transpilation tracking",
        "",
        f"Test results: {tested}.",
        "",
        "| Modules to do | Modules to test | Modules done | Functions translated | Tests passed | Tests failed | Tests skipped |",
        "|---|---|---|---|---|---|---|",
        f"| {len(todo)} | {len(untested)} | {len(done)} | {translated}/{total} | {passed} | {failures} | {skipped} |",
        "",
        "## To do",
        "",
        "Largest first. Unsupported constructs that block the most functions:",
        "",
        *(f"- {count} × `{reason}`" for reason, count in blockers.most_common(10)),
    ]
    for group in todo:
        lines += ["", f"### {group['name']}", ""]
        lines += [
            f"Translated {group['translated']}; {group['passed']} tests passed, {group['failures']} failed, {sum(group['skipped'].values())} skipped."
        ]
        if group["failed"]:
            lines += ["", "Failing:", ""]
        for message, functions in sorted(group["failed"].items(), key=lambda m: -sum(m[1].values())):
            lines.append(f"- {sum(functions.values())} × `{message[:160]}` ({', '.join(sorted(functions))})")
        if group["missing"]:
            lines += ["", "Not translated:", ""]
            lines += [f"- `{name}`: {reason[:160]}" for name, reason in group["missing"]]
    lines += ["", "## To test", "", "Translated, but no generated test passes.", ""]
    lines += ["| Module | Translated | Reason |", "|---|---|---|"]
    for group in untested:
        reason = group["skipped"].most_common(1)[0][0] if group["skipped"] else "no Python tests"
        lines.append(f"| {group['name']} | {group['translated']} | {reason[:120]} |")
    lines += ["", "## Not ported", "", "Not counted above.", ""] + [f"- {item}" for item in unported]
    lines += ["", "## Done", "", "Translated, with no failing test.", ""]
    lines += ["| Module | Translated | Tests passed | Tests skipped |", "|---|---|---|---|"]
    lines += [f"| {g['name']} | {g['translated']} | {g['passed']} | {sum(g['skipped'].values())} |" for g in done]
    TRACKING.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {TRACKING}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rules", type=Path, default=HERE / "ts.yaml")
    parser.add_argument("--precompute", action="store_true", help=f"only refresh {PRECOMPUTED.name}")
    parser.add_argument("--report", action="store_true", help=f"also write {TRACKING.name}")
    parser.add_argument("--tests", action="store_true", help="also transpile the Python tests into tests/generated")
    args = parser.parse_args()

    rules = yaml.safe_load(args.rules.read_text(encoding="utf-8"))
    if args.precompute:
        PRECOMPUTED.write_text(json.dumps(precompute(rules), sort_keys=True) + "\n", encoding="utf-8")
        mypy_types.ATTRIBUTES.write_text(mypy_types.dump_attributes(mypy_types.schema_attributes()), encoding="utf-8")
        print(f"Wrote {PRECOMPUTED} and {mypy_types.ATTRIBUTES}")
        return
    precomputed = json.loads(PRECOMPUTED.read_text(encoding="utf-8"))
    missing = set(rules.get("precomputed", {})) - set(precomputed)
    if missing:
        raise SystemExit(f"{PRECOMPUTED.name} lacks {', '.join(sorted(missing))}; run generate.py --precompute")
    compiler = Transpiler(args.rules, build_index(), precomputed, mypy_types.load())
    manifest = {}
    modules = set()  # API modules that are not a usecase (no function of their name), as settings.
    for scope in ("util", "api"):
        shutil.rmtree(OUTPUT / scope, ignore_errors=True)
    for source_path, relative in sources():
        name = module_name(source_path)
        output = OUTPUT / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        source = source_path.read_text(encoding="utf-8")
        if name.startswith("api.") and source_path.stem not in {
            n.name for n in ast.parse(source).body if isinstance(n, ast.FunctionDef)
        }:
            modules.add(relative.with_suffix("").as_posix())
        entry = {
            "source": f"ifcopenshell/{source_path.relative_to(PACKAGE).as_posix()}",
            "functions": sum(isinstance(n, (ast.FunctionDef, ast.ClassDef)) for n in ast.parse(source).body),
        }
        if relative.with_suffix("").as_posix() in NOT_PORTED:
            entry["error"] = f"not ported: {NOT_PORTED[relative.with_suffix('').as_posix()]}"
            code = stub_module(source, entry["error"])
        else:
            try:
                code = compiler.translate(source, name)
                entry["stubs"] = {u.split(": ", 1)[0]: u.split(": ", 1)[1] for u in compiler.unsupported}
            except Exception as error:  # Module-level constructs stop the whole file.
                entry["error"] = str(error).splitlines()[0]
                code = stub_module(source, entry["error"])
        output.write_text(polish(code), encoding="utf-8")
        write_parsers(compiler.grammars, output.parent, source_path)
        manifest[relative.with_suffix("").as_posix()] = entry

    # Data files that generated code opens next to itself, as the Python modules do.
    (OUTPUT / "util" / "schema").mkdir()
    for path in sorted((PACKAGE / "util" / "schema").glob("Pset_*.ifc")):
        shutil.copyfile(path, OUTPUT / "util" / "schema" / path.name)
    for path in sorted((PACKAGE / "util").glob("*.json")):
        shutil.copyfile(path, OUTPUT / "util" / path.name)

    # Each API package re-exports its usecases and other modules, as ifcopenshell.api.<package> does.
    for package in sorted({k.split("/")[1] for k in manifest if k.startswith("api/")}):
        usecases = sorted(
            k.split("/")[2] for k in manifest if k.startswith(f"api/{package}/") and not k.split("/")[2].startswith("_")
        )
        lines = [f'export {{ {camel(u)} }} from "./{u}.js";' for u in usecases if f"api/{package}/{u}" not in modules]
        lines += [f'export * as {u} from "./{u}.js";' for u in usecases if f"api/{package}/{u}" in modules]
        (OUTPUT / "api" / package / "index.ts").write_text(HEADER + "\n" + "\n".join(lines) + "\n", encoding="utf-8")

    # ifcopenshell/api: every package as a namespace, as `import ifcopenshell.api` gives ifcopenshell.api.root.
    packages = sorted({k.split("/")[1] for k in manifest if k.startswith("api/")})
    lines = [f'export * as {p} from "./{p}/index.js";' for p in packages]
    (OUTPUT / "api" / "index.ts").write_text(HEADER + "\n" + "\n".join(lines) + "\n", encoding="utf-8")
    # ifcopenshell/util: every ported module as a namespace, and the hand-written helpers of src/helpers.
    modules = sorted(
        k.split("/")[1]
        for k in manifest
        if k.startswith("util/")
        and not manifest[k].get("error", "").startswith("not ported")
        and "export " in (OUTPUT / f"{k}.ts").read_text(encoding="utf-8")
    )
    lines = ['export * from "../helpers/index.js";'] + [f'export * as {m} from "./{m}.js";' for m in modules]
    (OUTPUT / "util" / "index.ts").write_text(HEADER + "\n" + "\n".join(lines) + "\n", encoding="utf-8")

    MANIFEST.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    for scope in ("util", "api"):
        entries = [e for k, e in manifest.items() if k.startswith(f"{scope}/")]
        unported = sum(e.get("error", "").startswith("not ported") for e in entries)
        entries = [e for e in entries if not e.get("error", "").startswith("not ported")]
        functions = sum(e["functions"] for e in entries)
        # A class with a stubbed method (key "Class.method") counts as one stub, as a stubbed class does.
        stubs = sum(
            e["functions"]
            if "error" in e
            else len({k.split(".")[0] for k in e.get("stubs", {}) if not k.startswith("line ")})
            for e in entries
        )
        methods = sum(len([k for k in e.get("stubs", {}) if "." in k]) for e in entries)
        failed = sum("error" in e for e in entries)
        print(
            f"ifcopenshell.{scope}: {len(entries) - failed}/{len(entries)} files, {functions - stubs}/{functions} functions translated"
            f" ({methods} methods stubbed in otherwise translated classes; {unported} files not ported)"
        )
    if args.tests:
        generate_tests(compiler)
    if args.report:
        tracking(manifest)


def generate_tests(compiler):
    """Transpile the Python tests of util and api into tests/generated (see tests.py)."""
    shutil.rmtree(TESTS_OUTPUT, ignore_errors=True)
    total = skipped = 0
    for path, relative, tested_module in tests.test_sources():
        output = TESTS_OUTPUT / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        try:
            code, suites = tests.translate(compiler, path, relative, tested_module)
        except Exception as error:  # Module-level constructs stop the whole file.
            print(f"{path.relative_to(tests.TEST_ROOT).as_posix()}: {str(error).splitlines()[0]}")
            continue
        if not suites:  # A file with no tests (a comment that other files cover them, for example).
            continue
        output.write_text(polish(code), encoding="utf-8")
        cases = [t for s in suites for t in s["tests"]]
        total += len(cases)
        skipped += sum(bool(t["skip"]) for t in cases)
    print(f"tests: {total - skipped}/{total} test methods translated")


if __name__ == "__main__":
    main()
