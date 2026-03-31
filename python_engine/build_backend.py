"""File purpose: Build the standalone Python backend executable used by packaged desktop releases."""
from __future__ import annotations

import shutil
from pathlib import Path

import PyInstaller.__main__

ROOT = Path(__file__).resolve().parents[1]
ENTRYPOINT = ROOT / "python_engine" / "cli.py"
DIST_ROOT = ROOT / "src-tauri" / "bin"
DIST_DIR = DIST_ROOT / "python_backend"
WORK_DIR = ROOT / ".pyinstaller-build"
SPEC_DIR = ROOT / ".pyinstaller-spec"
ASSET_PATH = ROOT / "src" / "assets" / "kapyah-company-mark-redico.png"


def main() -> None:
    DIST_ROOT.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(DIST_DIR, ignore_errors=True)
    shutil.rmtree(WORK_DIR, ignore_errors=True)
    shutil.rmtree(SPEC_DIR, ignore_errors=True)

    PyInstaller.__main__.run(
        [
            str(ENTRYPOINT),
            "--name",
            "python_backend",
            "--clean",
            "--noconfirm",
            "--paths",
            str(ROOT / "python_engine"),
            "--distpath",
            str(DIST_ROOT),
            "--workpath",
            str(WORK_DIR),
            "--specpath",
            str(SPEC_DIR),
            "--add-data",
            f"{ASSET_PATH};assets",
            "--collect-submodules",
            "pymavlink",
            "--collect-submodules",
            "pyulog",
            "--collect-data",
            "pymavlink",
        ]
    )

    output_path = DIST_DIR / "python_backend.exe"
    if not output_path.exists():
        raise SystemExit("PyInstaller build did not produce python_backend.exe")

    print(f"Built backend executable at {output_path}")


if __name__ == "__main__":
    main()
