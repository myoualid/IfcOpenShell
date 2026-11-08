#!/usr/bin/env python3
"""Assemble the @aeco-dev/viewer npm package from a finished ifcviewer-web build.

The wasm and its Emscripten glue must sit side by side. ifcviewer.js is the
plain script that the example pages load after IfcViewerWeb.js. build.json
records the fork commit that produced the binary, because this package can
ship ahead of IfcOpenShell/IfcOpenShell.
"""

import json
import os
import re
import shutil
import sys
from pathlib import Path


def fail(message: str) -> None:
    print(f"::error::{message}", file=sys.stderr)
    sys.exit(1)


def require_file(path: Path) -> None:
    if not path.is_file() or path.stat().st_size == 0:
        fail(f"missing or empty build output: {path}")


def sidecar_version(header: Path) -> int:
    match = re.search(r"IFCVIEW_VERSION\s*=\s*(\d+)", header.read_text(encoding="utf-8"))
    if not match:
        fail(f"IFCVIEW_VERSION not found in {header}")
    return int(match.group(1))


def main() -> None:
    root = Path(os.environ.get("GITHUB_WORKSPACE", Path.cwd()))
    version = os.environ.get("RELEASE_VERSION", "").strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", version):
        fail("RELEASE_VERSION must be a semver such as 0.1.0")

    build_dir = root / os.environ.get("WEB_BUILD_DIR", "build-web")
    package_dir = root / "src" / "ifcviewer-web" / "npm"
    dist = package_dir / "dist"
    header = root / "src" / "ifcviewer" / "IfcViewFormat.h"

    require_file(build_dir / "IfcViewerWeb.js")
    require_file(build_dir / "IfcViewerWeb.wasm")
    require_file(root / "src" / "ifcviewer-web" / "web" / "ifcviewer.js")
    require_file(root / "COPYING")
    require_file(root / "COPYING.LESSER")

    if dist.exists():
        shutil.rmtree(dist)
    dist.mkdir(parents=True)

    shutil.copy2(build_dir / "IfcViewerWeb.js", dist / "IfcViewerWeb.js")
    shutil.copy2(build_dir / "IfcViewerWeb.wasm", dist / "IfcViewerWeb.wasm")
    shutil.copy2(root / "src" / "ifcviewer-web" / "web" / "ifcviewer.js", dist / "ifcviewer.js")
    shutil.copy2(root / "COPYING", package_dir / "COPYING")
    shutil.copy2(root / "COPYING.LESSER", package_dir / "COPYING.LESSER")

    manifest = {
        "package": "@aeco-dev/viewer",
        "version": version,
        "repository": os.environ.get("GITHUB_REPOSITORY", "myoualid/IfcOpenShell"),
        "ref": os.environ.get("GITHUB_REF_NAME", ""),
        "commit": os.environ.get("GITHUB_SHA", ""),
        "sidecarFormatVersion": sidecar_version(header),
    }
    (dist / "build.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    package_json = package_dir / "package.json"
    package = json.loads(package_json.read_text(encoding="utf-8"))
    package["version"] = version
    package_json.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")

    wasm_bytes = (dist / "IfcViewerWeb.wasm").stat().st_size
    print(f"packed @aeco-dev/viewer@{version}")
    print(f"sidecarFormatVersion={manifest['sidecarFormatVersion']} wasm={wasm_bytes} bytes")
    print(f"commit={manifest['commit']} ref={manifest['ref']}")


if __name__ == "__main__":
    main()
