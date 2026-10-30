# This file was generated with the assistance of an AI coding tool.
# SPDX-License-Identifier: LGPL-3.0-or-later
"""Transpile ifcopenshell.util and ifcopenshell.api into the ifcopenshell npm package.

Writes src/python/util and src/python/api of src/ts/ifcopenshell-js, which are build output
and not committed, from this checkout's Python source, the rules and precomputed.json.
src/python/transpile.json lists each module's untranslated functions; `--report` also writes
TRACKING.md (not committed), with the results of the last `npm run test:report`. Needs only
PyYAML and Jinja2 (requirements.txt). `--precompute` refreshes precomputed.json, which needs
an installed ifcopenshell close to this checkout.
"""

import argparse
import ast
import collections
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

import yaml

from transpile import PACKAGE, Transpiler, build_index, camel, module_name

HERE = Path(__file__).parent
OUTPUT = HERE.parent / "ts" / "ifcopenshell-js" / "src" / "python"
PRECOMPUTED = HERE / "precomputed.json"
RESULTS = HERE / "parity" / "results.json"
TRACKING = HERE / "TRACKING.md"
# Documentation and developer scripts, not ported; other modules import them, so their functions throw.
SKIP = {"doc", "ifc4x3dev_scrape_data_for_docs", "generate_pset_templates", "profiler"}
HEADER = "// This file was generated with the assistance of an AI coding tool.\n// SPDX-License-Identifier: LGPL-3.0-or-later\n"


def sources():
    for path in sorted(PACKAGE.glob("util/*.py")):
        if path.stem != "__init__":
            yield path, Path("util") / f"{path.stem}.ts"
    for path in sorted(PACKAGE.glob("api/*/*.py")):
        if path.stem != "__init__":
            yield path, Path("api") / path.parent.name / f"{path.stem}.ts"


def stub_module(source, reason):
    """Every top-level function throws, so other modules still import and type-check against it."""
    names = list(dict.fromkeys(n.name for n in ast.parse(source).body if isinstance(n, ast.FunctionDef)))
    message = json.dumps(f"Not transpiled: {reason}")
    return HEADER + "".join(
        f"\nexport function {camel(name)}(..._args: any[]): any {{\n  throw new Error({message});\n}}\n" for name in names
    )


def precompute(rules):
    """Run the functions listed under `precomputed` in the rules, from this checkout's source."""
    import importlib.util

    import ifcopenshell  # The installed build provides the wrapper the source needs.

    results = {}
    for qualified, arguments in rules.get("precomputed", {}).items():
        module_path, name = qualified.rsplit(".", 1)
        spec = importlib.util.spec_from_file_location(f"_precompute.{module_path}", PACKAGE.joinpath(*module_path.split(".")).with_suffix(".py"))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        results[qualified] = {argument: getattr(module, name)(argument) for argument in arguments}
    return results


def parity_results():
    """Replayed calls per module, from the last `npm run test:report`."""
    modules = collections.defaultdict(
        lambda: {"passed": 0, "skipped": collections.Counter(), "failed": collections.defaultdict(collections.Counter)}
    )
    if not RESULTS.exists():
        return modules
    for test in (t for f in json.loads(RESULTS.read_text(encoding="utf-8"))["testResults"] for t in f["assertionResults"]):
        if test["ancestorTitles"][:1] != ["parity with Python"] or len(test["ancestorTitles"]) < 2:
            continue
        module = modules[test["ancestorTitles"][1].replace(".", "/")]
        if test["status"] == "passed":
            module["passed"] += 1
        elif test["status"] == "failed":
            message = re.sub(r"(?<![A-Za-z])\d+", "N", test["failureMessages"][0].splitlines()[0])
            module["failed"][message][test["title"].rsplit(" ", 1)[-1]] += 1
        else:
            reason = re.search(r"\] \w+ \((.*)\)$", test["title"])
            module["skipped"][re.sub(r"(?<![A-Za-z])\d+", "N", reason[1]) if reason else test["title"]] += 1
    return modules


def tracking(manifest):
    """Write TRACKING.md: per module what remains to do first, what is done last."""
    groups = collections.defaultdict(lambda: {"done": 0, "total": 0, "missing": [], "ported": True})
    blockers = collections.Counter()
    for key, entry in manifest.items():
        group = groups[key if key.startswith("util/") else "/".join(key.split("/")[:2])]
        missing = {"(whole module)": entry["error"]} if "error" in entry else entry.get("stubs", {})
        group["total"] += entry["functions"]
        group["done"] += 0 if "error" in entry else entry["functions"] - len(missing)
        group["ported"] &= entry.get("error") != "not ported"
        if group["ported"]:
            group["missing"] += [(f"{Path(key).name}: {name}", reason) for name, reason in missing.items()]
            blockers.update(re.sub(r"^No \w+ rule at line \d+: ", "", reason)[:80] for reason in missing.values())

    results = parity_results()
    todo, untested, done, unported = [], [], [], []
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
        if not group["ported"]:
            unported.append(group)
        elif group["missing"] or group["failures"]:
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
        "| Modules to do | Modules to test | Modules done | Functions translated | Calls passed | Calls failed | Calls skipped |",
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
        lines += [f"Translated {group['translated']}; {group['passed']} calls passed, {group['failures']} failed, {sum(group['skipped'].values())} skipped."]
        if group["failed"]:
            lines += ["", "Failing:", ""]
        for message, functions in sorted(group["failed"].items(), key=lambda m: -sum(m[1].values())):
            lines.append(f"- {sum(functions.values())} × `{message[:160]}` ({', '.join(sorted(functions))})")
        if group["missing"]:
            lines += ["", "Not translated:", ""]
            lines += [f"- `{name}`: {reason[:160]}" for name, reason in group["missing"]]
    lines += ["", "## To test", "", "Translated, but no recorded call replays.", ""]
    lines += ["| Module | Translated | Reason |", "|---|---|---|"]
    for group in untested:
        reason = group["skipped"].most_common(1)[0][0] if group["skipped"] else "no recorded calls"
        lines.append(f"| {group['name']} | {group['translated']} | {reason[:120]} |")
    lines += ["", "## Not ported", "", ", ".join(g["name"] for g in unported)]
    lines += ["", "## Done", "", "Translated, with no failing call.", ""]
    lines += ["| Module | Translated | Calls passed | Calls skipped |", "|---|---|---|---|"]
    lines += [f"| {g['name']} | {g['translated']} | {g['passed']} | {sum(g['skipped'].values())} |" for g in done]
    TRACKING.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {TRACKING}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rules", type=Path, default=HERE / "ts.yaml")
    parser.add_argument("--precompute", action="store_true", help=f"only refresh {PRECOMPUTED.name}")
    parser.add_argument("--report", action="store_true", help=f"also write {TRACKING.name}")
    args = parser.parse_args()

    rules = yaml.safe_load(args.rules.read_text(encoding="utf-8"))
    if args.precompute:
        PRECOMPUTED.write_text(json.dumps(precompute(rules), sort_keys=True) + "\n", encoding="utf-8")
        print(f"Wrote {PRECOMPUTED}")
        return
    precomputed = json.loads(PRECOMPUTED.read_text(encoding="utf-8"))
    missing = set(rules.get("precomputed", {})) - set(precomputed)
    if missing:
        raise SystemExit(f"{PRECOMPUTED.name} lacks {', '.join(sorted(missing))}; run generate.py --precompute")
    compiler = Transpiler(args.rules, build_index(), precomputed)
    manifest = {}
    modules = set()  # API modules that are not a usecase (no function of their name), as settings.
    for scope in ("util", "api"):
        shutil.rmtree(OUTPUT / scope, ignore_errors=True)
    for source_path, relative in sources():
        name = module_name(source_path)
        output = OUTPUT / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        source = source_path.read_text(encoding="utf-8")
        if name.startswith("api.") and source_path.stem not in {n.name for n in ast.parse(source).body if isinstance(n, ast.FunctionDef)}:
            modules.add(relative.with_suffix("").as_posix())
        entry = {
            "source": f"ifcopenshell/{source_path.relative_to(PACKAGE).as_posix()}",
            "functions": sum(isinstance(n, (ast.FunctionDef, ast.ClassDef)) for n in ast.parse(source).body),
        }
        if name.startswith("util.") and source_path.stem in SKIP:
            entry["error"] = "not ported"
            code = stub_module(source, entry["error"])
        else:
            try:
                code = compiler.translate(source, name)
                entry["stubs"] = {u.split(": ", 1)[0]: u.split(": ", 1)[1] for u in compiler.unsupported}
            except Exception as error:  # Module-level constructs stop the whole file.
                entry["error"] = str(error).splitlines()[0]
                code = stub_module(source, entry["error"])
        output.write_text(code, encoding="utf-8")
        manifest[relative.with_suffix("").as_posix()] = entry

    # Data files that generated code opens next to itself, as the Python modules do.
    (OUTPUT / "util" / "schema").mkdir()
    for path in sorted((PACKAGE / "util" / "schema").glob("Pset_*.ifc")):
        shutil.copyfile(path, OUTPUT / "util" / "schema" / path.name)
    for path in sorted((PACKAGE / "util").glob("*.json")):
        shutil.copyfile(path, OUTPUT / "util" / path.name)

    # Each API package re-exports its usecases and other modules, as ifcopenshell.api.<package> does.
    for package in sorted({k.split("/")[1] for k in manifest if k.startswith("api/")}):
        usecases = sorted(k.split("/")[2] for k in manifest if k.startswith(f"api/{package}/") and not k.split("/")[2].startswith("_"))
        lines = [f'export {{ {camel(u)} }} from "./{u}.js";' for u in usecases if f"api/{package}/{u}" not in modules]
        lines += [f'export * as {u} from "./{u}.js";' for u in usecases if f"api/{package}/{u}" in modules]
        (OUTPUT / "api" / package / "index.ts").write_text(HEADER + "\n" + "\n".join(lines) + "\n", encoding="utf-8")

    (OUTPUT / "transpile.json").write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    for scope in ("util", "api"):
        entries = [e for k, e in manifest.items() if k.startswith(f"{scope}/")]
        functions = sum(e["functions"] for e in entries)
        stubs = sum(e["functions"] if "error" in e else len(e.get("stubs", {})) for e in entries)
        failed = sum("error" in e for e in entries)
        print(f"ifcopenshell.{scope}: {len(entries) - failed}/{len(entries)} files, {functions - stubs}/{functions} functions translated")
    if args.report:
        tracking(manifest)


if __name__ == "__main__":
    main()
