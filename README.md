# KapYah LogMiner

KapYah LogMiner is a desktop application for local drone log analysis, mission review, playback, map inspection, diagnostics, and report generation.

It is built with:
- Tauri 2
- React 19 + TypeScript + Vite
- Python analysis/report pipeline
- Cesium for route and playback visualization

## Current Scope

KapYah LogMiner currently supports:
- `.bin`
- `.tlog`
- `.log`
- `.ulg`
- `.ulog`

Key capabilities:
- branded KapYah desktop experience
- local log parsing and analysis
- Overview, Timeline, Power, Vibration, RC Info, Map, Messages, Reports, and Help tabs
- playback with follow drone and reset view
- event markers and synthetic mission start/end markers
- RC support for up to 16 channels
- report export to a single named folder containing:
  - `flight_data.xlsx`
  - `mission_report.pdf`
- Recent Reports actions for open folder, open Excel, open PDF, and delete
- offline-safe map fallback for route and playback when online imagery is unavailable

## Project Layout

```text
src/                 React UI, tabs, layout, styling, playback, map wiring
src/assets/          Logos, fonts, splash video, marker assets
src-tauri/           Tauri host app and Rust commands
python_engine/       Python analyzers, parsers, and report export logic
public/Cesium/       Cesium static runtime assets
```

Important files:
- [src/pages/HomePage.tsx](src/pages/HomePage.tsx)
- [src/components/CesiumGlobePanel.tsx](src/components/CesiumGlobePanel.tsx)
- [src/components/tabs/ReportsTab.tsx](src/components/tabs/ReportsTab.tsx)
- [python_engine/analyzer.py](python_engine/analyzer.py)
- [python_engine/export_report.py](python_engine/export_report.py)
- [src-tauri/src/lib.rs](src-tauri/src/lib.rs)

## Prerequisites

Install the following before running locally:
- Node.js 18+ recommended
- npm
- Python 3.10+ recommended
- Rust toolchain
- Tauri prerequisites for your platform

Python packages used by the project:
- `pymavlink`
- `pandas`
- `openpyxl`
- `pyulog`
- `reportlab`

## Local Setup

Install frontend dependencies:

```bash
npm install
```

Install Python dependencies:

```bash
python -m pip install -r python_engine/requirements.txt
```

## Run In Development

Frontend only:

```bash
npm run dev
```

Desktop app:

```bash
npm run tauri:dev
```

## Build

Frontend production build:

```bash
npm run build
```

Desktop bundle:

```bash
npm run tauri:build
```

## Verification

TypeScript:

```bash
npx.cmd tsc --noEmit
```

If Rust-side commands change, also run:

```bash
cargo check
```

from `src-tauri/`.

If Python report logic changes, a quick compile check can be used:

```powershell
@'
import py_compile
py_compile.compile(
    r'd:\work\drone-log-analyzer-desktop\python_engine\export_report.py',
    cfile=r'd:\work\drone-log-analyzer-desktop\.codex_py_compile\export_report_verify.pyc',
    doraise=True,
)
print("py_compile ok")
'@ | python -
```

## Report Export Behavior

Generating a report creates one named folder per export.

That folder contains:
- `flight_data.xlsx`
- `mission_report.pdf`

The save dialog suggests a timestamp-based folder name such as:

```text
report_2026_03_30_14_25_18
```

Recent Reports stores folder references locally in browser storage within the desktop app.

## Map Notes

Map behavior is intentionally conservative:
- online mode keeps remote imagery when available
- offline or imagery failure falls back to an offline-safe mode
- route line, start/end markers, drone marker, event markers, playback, follow, and reset remain available
- the map uses the SVG drone marker and does not use GLB playback logic

## Branding Notes

The app is branded for KapYah Industries Pvt. Ltd.

Current branded behavior includes:
- homepage branding
- sidebar branding
- ivory day mode
- startup splash video
- KapYah external site links opened through Tauri

## Maintenance Guidance

Before wrapping a change:
- keep playback behavior stable unless intentionally changing it
- avoid casual changes to reports, charts, map playback, and branding
- prefer minimal targeted edits
- verify TypeScript after UI changes
- verify Rust when Tauri command behavior changes
- verify Python when parser or report code changes

## Repository Hygiene

The repo uses `.gitignore` for:
- `node_modules`
- build output
- Python cache
- generated reports/logs
- local verification artifacts

Generated output, local logs, and temporary reports should not be committed.

## Ownership

Product branding:
- KapYah Industries Pvt. Ltd.

## Author And Maintainer

Primary developer:
- Durgesh Tiwari
- Embedded Software Engineer
- KapYah Industries Pvt. Ltd.

Public contact and profile:
- Email: `durgeshtiwari000x@gmail.com`
- GitHub: `https://github.com/bldxspark`
- LinkedIn: `https://www.linkedin.com/in/durgesh-tiwari-9bab82238`

## Code Ownership

This project is currently maintained by:
- Durgesh Tiwari

A `CODEOWNERS` file is included for repository-level ownership.

## License

This repository is dual-licensed under:
- Apache License 2.0
- GNU General Public License v3.0 only

You may use this project under either license, at your option.

Repository license metadata:
- SPDX: `Apache-2.0 OR GPL-3.0-only`

See:
- [LICENSE](LICENSE)
- [NOTICE](NOTICE)
