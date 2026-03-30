"""File purpose: Python command-line bridge used by the desktop app to run analysis and report export."""
from __future__ import annotations

import json
import sys
from typing import Any

from analyzer import build_analysis_result, parse_log
from export_report import _create_report_folder, generate_excel_report, generate_pdf_report


def _emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload), flush=True)


def analyze_command(log_file: str) -> int:
    try:
        parsed = parse_log(log_file)
        result = build_analysis_result(parsed)
        _emit({"ok": True, "data": result})
        return 0
    except Exception as exc:  # noqa: BLE001
        _emit({"ok": False, "error": str(exc)})
        return 1


def export_command(log_file: str, output_dir: str | None = None) -> int:
    try:
        parsed = parse_log(log_file)
        result = build_analysis_result(parsed)
        report_folder = _create_report_folder(output_dir)
        excel_path = generate_excel_report(result, output_dir, report_folder=report_folder)
        pdf_path = generate_pdf_report(result, output_dir, report_folder=report_folder)
        _emit({"ok": True, "excelPath": excel_path, "pdfPath": pdf_path})
        return 0
    except Exception as exc:  # noqa: BLE001
        _emit({"ok": False, "error": str(exc)})
        return 1


def main() -> int:
    if len(sys.argv) < 3:
        _emit({"ok": False, "error": "Usage: python cli.py <analyze|export> <log_file> [output_dir]"})
        return 1

    command = sys.argv[1]
    log_file = sys.argv[2]

    if command == "analyze":
        return analyze_command(log_file)
    if command == "export":
        output_dir = sys.argv[3] if len(sys.argv) > 3 else None
        return export_command(log_file, output_dir)

    _emit({"ok": False, "error": f"Unknown command: {command}"})
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
