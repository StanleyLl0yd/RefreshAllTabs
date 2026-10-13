#!/usr/bin/env python3
"""Create a deterministic Chromium unpacked-extension release ZIP."""
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
version = manifest["version"]
if not re.fullmatch(r"\d+(?:\.\d+){1,3}", version):
    raise SystemExit(f"Expected numeric manifest version, got: {version!r}")

paths = [ROOT / name for name in ("manifest.json", "background.js", "exclusions.js", "options.html", "options.js")]
paths += sorted((ROOT / "_locales").glob("*/messages.json"))
if len(paths) != 24 or any(not p.is_file() for p in paths):
    raise SystemExit("Missing extension files or language catalogs (expected 19 locales)")
for p in paths[5:]:
    catalog = json.loads(p.read_text(encoding="utf-8"))
    if not catalog:
        raise SystemExit(f"Empty locale catalog: {p}")

DIST.mkdir(exist_ok=True)
output = DIST / f"RefreshAllTabs.{version}.zip"
with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for path in paths:
        rel = path.relative_to(ROOT).as_posix()
        info = ZipInfo(rel, date_time=(2020, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
print(output)
