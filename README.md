# KapYah LogMiner

KapYah LogMiner is a desktop drone-log analysis application developed for **KapYah Industries Pvt. Ltd.** It is designed for local mission review, telemetry inspection, synchronized playback, route reconstruction, diagnostics, and structured report generation in a single desktop workflow.

This software is part of the KapYah product and engineering ecosystem and is intended to support operational review, technical analysis, and export-ready reporting for supported flight logs.

## Company

- Company: **KapYah Industries Pvt. Ltd.**
- Website: `https://www.kapyah.com/`
- Product: **KapYah LogMiner**
- Email: `contact@kapyah.com`

## Developed By

- **Durgesh Tiwari**
- Embedded Software Engineer
- KapYah Industries Pvt. Ltd.
- GitHub: `https://github.com/bldxspark`
- LinkedIn: `https://www.linkedin.com/in/durgesh-tiwari-9bab82238`
- Email: `durgeshtiwari000x@gmail.com`

## Product Overview

KapYah LogMiner provides:
- local drone log parsing and analysis
- route playback and synchronized mission review
- map-based route reconstruction with offline-safe fallback
- Timeline, Power, Vibration, RC Info, Messages, Reports, and Help workflows
- Excel and PDF report generation
- recent-report management for previously exported analysis folders

## Supported Log Formats

KapYah LogMiner currently supports:
- `.bin`
- `.tlog`
- `.log`
- `.ulg`
- `.ulog`

## Core Features

- KapYah-branded desktop experience
- stable mission playback with Follow Drone and Reset View
- synthetic mission start/end markers in timeline and message review
- RC support for up to 16 channels
- route line, start/end markers, drone marker, and event markers on the map
- hybrid map behavior:
  - online imagery when available
  - offline-safe fallback when imagery is unavailable
- report export into one named folder containing:
  - `flight_data.xlsx`
  - `mission_report.pdf`
- Recent Reports actions for:
  - open folder
  - open Excel
  - open PDF
  - delete report folder

## Technology Stack

- **Desktop shell:** Tauri 2
- **Frontend:** React 19 + TypeScript + Vite
- **Backend analysis pipeline:** Python
- **Map engine:** Cesium
- **Report generation:** Excel + PDF export pipeline

## Project Layout

```text
src/                 React UI, tabs, layout, styling, playback, and map wiring
src/assets/          KapYah logos, fonts, splash video, and marker assets
src-tauri/           Tauri host app, Rust commands, packaging config, installer assets
python_engine/       Python analyzers, parsers, backend CLI, and report export logic
public/Cesium/       Cesium static runtime assets
```

Important files:
- [src/pages/HomePage.tsx](src/pages/HomePage.tsx)
- [src/components/CesiumGlobePanel.tsx](src/components/CesiumGlobePanel.tsx)
- [src/components/tabs/ReportsTab.tsx](src/components/tabs/ReportsTab.tsx)
- [python_engine/analyzer.py](python_engine/analyzer.py)
- [python_engine/export_report.py](python_engine/export_report.py)
- [python_engine/build_backend.py](python_engine/build_backend.py)
- [src-tauri/src/lib.rs](src-tauri/src/lib.rs)
- [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json)

## Development Prerequisites

Install the following before running locally:
- Node.js 18+ recommended
- npm
- Python 3.10+ recommended
- Rust toolchain
- Tauri prerequisites for your platform

Python packages used by the development workflow:
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

## Build And Packaging

Frontend production build:

```bash
npm run build
```

Desktop installer build:

```bash
npm run tauri:build
```

The packaged Windows build now includes the bundled backend runtime, so end users can install and run the desktop app without separately installing Python.

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

If Python logic changes, quick compile checks can be used as needed.

## Report Export Behavior

Generating a report creates one named folder per export.

That folder contains:
- `flight_data.xlsx`
- `mission_report.pdf`

The save dialog suggests a timestamp-based folder name such as:

```text
report_2026_03_30_14_25_18
```

Recent Reports stores folder references locally in desktop app storage for quick reopening and cleanup.

## Map Notes

Map behavior is intentionally conservative:
- online mode keeps remote imagery when available
- offline or imagery failure falls back to an offline-safe mode
- route line, start/end markers, drone marker, event markers, playback, follow, and reset remain available
- the map uses the SVG drone marker and does not use GLB playback logic

## Branding And Distribution Notes

Current KapYah-specific product behavior includes:
- KapYah homepage branding
- KapYah sidebar branding
- ivory day mode
- startup intro video
- KapYah external website links opened through the Tauri desktop layer
- branded installer output for Windows packaging

For distribution, the recommended Windows installer is the NSIS setup executable generated by Tauri packaging.

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
- Rust/Tauri target output
- Python cache
- generated reports and logs
- backend packaging artifacts
- local verification artifacts

Generated output, local logs, temporary reports, and packaging intermediates should not be committed unless intentionally required.

## Ownership

- Product owner: **KapYah Industries Pvt. Ltd.**
- Product identity and branding: **KapYah Industries Pvt. Ltd.**
- Primary repository maintainer: **Durgesh Tiwari**

A [CODEOWNERS](CODEOWNERS) file is included for repository-level ownership.

## Contact

- Company website: `https://www.kapyah.com/`
- Company contact: `contact@kapyah.com`
- Developer contact: `durgeshtiwari000x@gmail.com`

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
