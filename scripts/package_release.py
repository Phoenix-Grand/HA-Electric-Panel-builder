"""Create a deterministic installable ZIP without workstation or private data."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parents[1]
component = root / "custom_components" / "panel_builder"
version = json.loads((component / "manifest.json").read_text())["version"]
destination = root / "release" / f"panel-builder-{version}.zip"
destination.parent.mkdir(exist_ok=True)
paths = [p for p in component.rglob("*") if p.is_file() and "__pycache__" not in p.parts and p.suffix not in (".pyc", ".pyo")]
paths += [root / name for name in ("README.md", "changelog.md", "TODO.md", "LICENSE", "hacs.json")]
with ZipFile(destination, "w", compression=ZIP_DEFLATED) as archive:
    for path in sorted(paths):
        info = ZipInfo(path.relative_to(root).as_posix(), date_time=(2026, 10, 9, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, path.read_bytes())
print(destination)
