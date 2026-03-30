"""KapYah LogMiner report export pipeline.

Maintained by Durgesh Tiwari, KapYah Industries Pvt. Ltd.

File purpose: Python report generator that writes the Excel workbook and PDF mission report.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re
from typing import Any
from xml.sax.saxutils import escape

import pandas as pd
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.worksheet.worksheet import Worksheet
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

MAX_RC_CHANNELS = 16
RC_CHANNEL_COLUMNS = [f"rc{index}" for index in range(1, MAX_RC_CHANNELS + 1)]


def _apply_series_colors(chart: LineChart | BarChart, colors: list[str]) -> None:
    for index, color in enumerate(colors):
        if index >= len(chart.ser):
            break
        chart.ser[index].graphicalProperties.line.solidFill = color
        chart.ser[index].graphicalProperties.line.width = 28000
        if hasattr(chart.ser[index].graphicalProperties, "solidFill"):
            chart.ser[index].graphicalProperties.solidFill = color


def _autosize_columns(sheet: Worksheet) -> None:
    for column_cells in sheet.columns:
        column_letter = column_cells[0].column_letter
        max_length = 0
        for cell in column_cells:
            value = "" if cell.value is None else str(cell.value)
            max_length = max(max_length, len(value))
        sheet.column_dimensions[column_letter].width = min(max(max_length + 2, 12), 36)


def _add_line_chart(
    sheet: Worksheet,
    *,
    title: str,
    y_axis_title: str,
    x_axis_title: str,
    min_col: int,
    max_col: int,
    header_row: int,
    first_data_row: int,
    last_data_row: int,
    anchor: str,
    colors: list[str],
    height: float = 9,
    width: float = 18,
) -> None:
    if last_data_row - first_data_row + 1 < 2:
        return

    chart = LineChart()
    chart.title = title
    chart.style = 2
    chart.y_axis.title = y_axis_title
    chart.x_axis.title = x_axis_title
    chart.height = height
    chart.width = width
    chart.add_data(
        Reference(sheet, min_col=min_col, max_col=max_col, min_row=header_row, max_row=last_data_row),
        titles_from_data=True,
    )
    chart.set_categories(Reference(sheet, min_col=1, min_row=first_data_row, max_row=last_data_row))
    _apply_series_colors(chart, colors)
    sheet.add_chart(chart, anchor)


def _add_bar_chart(
    sheet: Worksheet,
    *,
    title: str,
    y_axis_title: str,
    min_col: int,
    max_col: int,
    header_row: int,
    first_data_row: int,
    last_data_row: int,
    anchor: str,
    colors: list[str],
) -> None:
    if last_data_row - first_data_row + 1 < 1:
        return

    chart = BarChart()
    chart.title = title
    chart.style = 10
    chart.y_axis.title = y_axis_title
    chart.height = 7
    chart.width = 12
    chart.add_data(
        Reference(sheet, min_col=min_col, max_col=max_col, min_row=header_row, max_row=last_data_row),
        titles_from_data=True,
    )
    chart.set_categories(Reference(sheet, min_col=1, min_row=first_data_row, max_row=last_data_row))
    _apply_series_colors(chart, colors)
    sheet.add_chart(chart, anchor)


def _normalize_requested_output_path(output_dir: str) -> Path:
    # Treat the dialog result as a folder name even if a suffix is typed accidentally.
    cleaned = output_dir.strip().strip('"').strip("'")
    requested_path = Path(cleaned).expanduser()
    if requested_path.suffix:
        requested_path = requested_path.with_suffix("")
    return Path(str(requested_path))


def _next_available_folder(report_root: Path, requested_name: str) -> Path:
    # Preserve older exports by choosing the next free folder name when needed.
    base_name = requested_name.strip().rstrip(". ") or "report"
    report_folder = report_root / base_name
    if not report_folder.exists():
        return report_folder

    match = re.match(r"^(.*?)(?:_(\d+))?$", base_name)
    if match:
        prefix = (match.group(1) or "report").rstrip("_") or "report"
        start_number = int(match.group(2)) + 1 if match.group(2) else 2
    else:
        prefix = base_name
        start_number = 2

    candidate_number = start_number
    while True:
        candidate = report_root / f"{prefix}_{candidate_number}"
        if not candidate.exists():
            return candidate
        candidate_number += 1



def _create_report_folder(output_dir: str | None) -> Path:
    if output_dir:
        requested_path = _normalize_requested_output_path(output_dir)
        report_root = requested_path.parent
        report_root.mkdir(parents=True, exist_ok=True)
        report_folder = _next_available_folder(report_root, requested_path.name)
        report_folder.mkdir(parents=True, exist_ok=False)
        return report_folder

    report_root = Path.home() / "Downloads"
    report_root.mkdir(parents=True, exist_ok=True)
    existing_reports = [path for path in report_root.glob("report_*") if path.is_dir()]
    report_folder = report_root / f"report_{len(existing_reports) + 1}"
    report_folder.mkdir(exist_ok=True)
    return report_folder


def _text(value: Any, fallback: str = "Unavailable") -> str:
    if value is None:
        return fallback
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or fallback
    if isinstance(value, list):
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        return ", ".join(cleaned) if cleaned else fallback
    return str(value)


def _time_window_sentence(window: str | None) -> str:
    if not window or " - " not in window:
        return "The exact mission start and end window could not be derived from the reviewed log."
    start_time, end_time = [part.strip() for part in window.split(" - ", 1)]
    return f"The detected mission window runs from {start_time} to {end_time}."


def _assessment_label(overview: dict[str, Any], messages: dict[str, Any]) -> str:
    if overview.get("errorMessages") or overview.get("failsafeEvents") or (messages.get("errorCount") or 0) > 0:
        return "Requires Investigation"
    if overview.get("keyWarnings") or overview.get("keyAnomalies") or (messages.get("warningCount") or 0) > 0:
        return "Caution"
    return "Normal"


def _format_time(value: Any) -> str:
    if value is None:
        return "Unavailable"
    if isinstance(value, (int, float)):
        total_seconds = max(int(value), 0)
        minutes, seconds = divmod(total_seconds, 60)
        hours, minutes = divmod(minutes, 60)
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return str(value)


def _join_limited(values: list[str], fallback: str = "None recorded", limit: int = 5) -> str:
    cleaned = [value.strip() for value in values if value and value.strip()]
    if not cleaned:
        return fallback
    return ", ".join(cleaned[:limit])


def _build_mission_overview_paragraphs(analysis: dict[str, Any], generated_at: datetime) -> list[str]:
    overview = analysis["overview"]
    timeline = analysis["timeline"]
    messages = analysis["messages"]
    report_time = generated_at.strftime("%d %b %Y at %I:%M %p")
    paragraph_one = (
        f"This KapYah mission analysis report was generated on {report_time} using the local KapYah LogMiner workflow. "
        f"The reviewed file {_text(overview.get('logName'))} is identified as a {_text(overview.get('vehicleType')).lower()} mission log. "
        f"The total detected flight duration is {_text(overview.get('totalFlightDuration'))}, and {_time_window_sentence(overview.get('armDisarmTime'))}"
    )
    paragraph_two = (
        f"The log indicates {overview.get('flightCount', 0)} mission instance(s) and {timeline.get('totalEvents', 0)} timeline event(s). "
        f"Detected flight modes include {_text(overview.get('flightModes'), 'Unavailable')}. The messages view contains "
        f"{messages.get('infoCount', 0)} informational record(s), {messages.get('warningCount', 0)} warning record(s), and "
        f"{messages.get('errorCount', 0)} error record(s)."
    )
    return [paragraph_one, paragraph_two]


def _build_navigation_paragraphs(analysis: dict[str, Any]) -> list[str]:
    overview = analysis["overview"]
    map_data = analysis["map"]
    route_points = map_data.get("routePoints", [])
    highlighted_route = map_data.get("highlightedRoute", [])
    paragraph_one = (
        f"Navigation review shows GPS status as {_text(overview.get('gpsStatus'))} with satellite count reported as "
        f"{_text(overview.get('satelliteCount'))}. Home location details are {_text(overview.get('homeLocation'))}, "
        f"distance traveled is {_text(overview.get('distanceTraveled'))}, maximum height reached is {_text(overview.get('maxAltitude'))}, "
        f"and maximum recorded speed is {_text(overview.get('maxSpeed'))}."
    )
    paragraph_two = (
        f"The map reconstruction contains {map_data.get('totalTrackPoints', 0)} route point(s), with {len(highlighted_route)} highlighted route marker(s) "
        f"and {len(map_data.get('eventMarkers', []))} mapped event marker(s). A total of {len(route_points)} usable route sample(s) were preserved for playback and review."
    )
    return [paragraph_one, paragraph_two]


def _build_timeline_message_paragraphs(analysis: dict[str, Any]) -> list[str]:
    timeline = analysis["timeline"]
    messages = analysis["messages"]
    highlighted = timeline.get("highlightedEvents", [])
    mode_transitions = timeline.get("modeTransitions", [])
    warning_events = timeline.get("warningEvents", [])
    highlighted_text = _join_limited([event.get("detail", "") for event in highlighted], fallback="No highlighted events were identified")
    mode_text = _join_limited([event.get("label", "") for event in mode_transitions], fallback="No distinct mode changes were extracted")
    paragraph_one = (
        f"Timeline review highlights the following notable events: {highlighted_text}. "
        f"Detected mode transitions include {mode_text}."
    )
    paragraph_two = (
        f"The message stream reports the last logged event as {_text(messages.get('lastEvent'))}. Warning-focused timeline entries count as {len(warning_events)}, "
        f"while raw message rows captured for review total {len(messages.get('rawMessages', []))}."
    )
    return [paragraph_one, paragraph_two]


def _build_system_health_paragraphs(analysis: dict[str, Any]) -> list[str]:
    overview = analysis["overview"]
    power = analysis["power"]
    vibration = analysis["vibration"]
    rc = analysis["rc"]
    rc_channels = rc.get("channelAverages", [])
    channel_text = _join_limited(
        [f"{channel.get('label', 'RC')} average {channel.get('average', 'Unavailable')}" for channel in rc_channels],
        fallback="No RC channel average values were available",
        limit=8,
    )
    paragraph_one = (
        f"Power analysis shows starting voltage {_text(power.get('startingVoltage'))}, ending voltage {_text(power.get('endingVoltage'))}, minimum voltage {_text(power.get('minimumVoltage'))}, "
        f"maximum current {_text(power.get('maximumCurrent'))}, average current {_text(power.get('averageCurrent'))}, and overall power health {_text(power.get('powerHealth'))}."
    )
    paragraph_two = (
        f"Vibration review shows average X/Y/Z values of {_text(vibration.get('averageX'))}, {_text(vibration.get('averageY'))}, and {_text(vibration.get('averageZ'))}. "
        f"Maximum X/Y/Z values are {_text(vibration.get('maxX'))}, {_text(vibration.get('maxY'))}, and {_text(vibration.get('maxZ'))}, with dominant axis {_text(vibration.get('dominantAxis'))} and severity {_text(vibration.get('severity'))}."
    )
    paragraph_three = (
        f"Control-link review shows RC health {_text(rc.get('rcHealth'))}, average link quality {_text(rc.get('averageLinkQuality'))}, average RSSI {_text(rc.get('averageRssi'))}, "
        f"peak link quality {_text(rc.get('peakLinkQuality'))}, peak RSSI {_text(rc.get('peakRssi'))}, and {rc.get('activeChannelCount', 0)} active channel(s). {channel_text}."
    )
    paragraph_four = (
        f"Orientation source is {_text(overview.get('orientationSource'))}, IMU summary is {_text(overview.get('imuCount'))}, proximity sensor count is {_text(overview.get('proximitySensorCount'))}, "
        f"communication strength is {_text(overview.get('communicationStrength'))}, and signal strength is {_text(overview.get('signalStrength'))}."
    )
    return [paragraph_one, paragraph_two, paragraph_three, paragraph_four]


def _build_findings_paragraphs(analysis: dict[str, Any]) -> list[str]:
    overview = analysis["overview"]
    messages = analysis["messages"]
    assessment = _assessment_label(overview, messages)
    warnings = _join_limited(overview.get("keyWarnings", []), fallback="No major warnings were highlighted")
    anomalies = _join_limited(overview.get("keyAnomalies", []), fallback="No anomalies were highlighted")
    errors = _join_limited(overview.get("errorMessages", []), fallback="No critical error messages were highlighted")
    failsafes = _join_limited(overview.get("failsafeEvents", []), fallback="No failsafe events were recorded")
    paragraph_one = (
        f"Key warning summary: {warnings}. Key anomaly summary: {anomalies}. Error summary: {errors}. Failsafe summary: {failsafes}."
    )
    paragraph_two = (
        f"Mission status: {assessment}. This status is derived from the warnings, anomalies, failsafe records, and message severity counts detected in the reviewed log."
    )
    return [paragraph_one, paragraph_two]


def generate_excel_report(analysis: dict[str, Any], output_dir: str | None = None, report_folder: Path | None = None) -> str:
    report_folder = report_folder or _create_report_folder(output_dir)
    excel_path = report_folder / "flight_data.xlsx"

    overview = analysis["overview"]
    timeline = analysis["timeline"]
    power = analysis["power"]
    vibration = analysis["vibration"]
    rc = analysis["rc"]
    map_data = analysis["map"]
    messages = analysis["messages"]
    reports = analysis["reports"]

    overview_df = pd.DataFrame(
        [
            {"Metric": "Log Name", "Value": overview["logName"]},
            {"Metric": "Date Time", "Value": overview["dateTime"]},
            {"Metric": "Vehicle Type", "Value": overview["vehicleType"]},
            {"Metric": "Total Flight Duration", "Value": overview["totalFlightDuration"]},
            {"Metric": "Arm/Disarm Time", "Value": overview["armDisarmTime"]},
            {"Metric": "Flight Count", "Value": overview["flightCount"]},
            {"Metric": "Flight Modes", "Value": ", ".join(overview["flightModes"])} ,
            {"Metric": "GPS Status", "Value": overview["gpsStatus"]},
            {"Metric": "Satellite Count", "Value": overview["satelliteCount"]},
            {"Metric": "Home Location Details", "Value": overview["homeLocation"]},
            {"Metric": "Distance Traveled", "Value": overview["distanceTraveled"]},
            {"Metric": "Max Height Reached", "Value": overview["maxAltitude"]},
            {"Metric": "Max Speed", "Value": overview["maxSpeed"]},
            {"Metric": "Orientation Source", "Value": overview["orientationSource"]},
            {"Metric": "IMU Summary", "Value": overview["imuCount"]},
            {"Metric": "Proximity Sensor Count", "Value": overview["proximitySensorCount"]},
            {"Metric": "RC Health", "Value": overview["rcHealth"]},
            {"Metric": "Communication Strength", "Value": overview["communicationStrength"]},
            {"Metric": "Signal Strength", "Value": overview["signalStrength"]},
            {"Metric": "Failsafe Events", "Value": ", ".join(overview["failsafeEvents"])} ,
        ]
    )

    timeline_df = pd.DataFrame(timeline["events"], columns=["timeS", "label", "detail", "category", "severity"])
    signal_samples_df = pd.DataFrame(
        timeline["signalSamples"],
        columns=["timeS", "headingDeg", "rssiPercent", "linkQualityPercent", "satellites", "proximityM"],
    )
    power_summary_df = pd.DataFrame(
        [
            {"Metric": "Starting Voltage", "Value": power["startingVoltage"]},
            {"Metric": "Ending Voltage", "Value": power["endingVoltage"]},
            {"Metric": "Minimum Voltage", "Value": power["minimumVoltage"]},
            {"Metric": "Maximum Current", "Value": power["maximumCurrent"]},
            {"Metric": "Average Current", "Value": power["averageCurrent"]},
            {"Metric": "Power Health", "Value": power["powerHealth"]},
            {"Metric": "Duration (s)", "Value": power["durationS"]},
        ]
    )
    power_samples_df = pd.DataFrame(power["samples"], columns=["timeS", "voltage", "current"])
    vibration_summary_df = pd.DataFrame(
        [
            {"Metric": "Average X", "Value": vibration["averageX"]},
            {"Metric": "Average Y", "Value": vibration["averageY"]},
            {"Metric": "Average Z", "Value": vibration["averageZ"]},
            {"Metric": "Max X", "Value": vibration["maxX"]},
            {"Metric": "Max Y", "Value": vibration["maxY"]},
            {"Metric": "Max Z", "Value": vibration["maxZ"]},
            {"Metric": "Dominant Axis", "Value": vibration["dominantAxis"]},
            {"Metric": "Severity", "Value": vibration["severity"]},
            {"Metric": "Duration (s)", "Value": vibration["durationS"]},
        ]
    )
    vibration_samples_df = pd.DataFrame(vibration["samples"], columns=["timeS", "x", "y", "z"])
    rc_health_df = pd.DataFrame(
        [
            {"Metric": "RC Health", "Value": rc["rcHealth"]},
            {"Metric": "Average Link Quality", "Value": rc["averageLinkQuality"]},
            {"Metric": "Average RSSI", "Value": rc["averageRssi"]},
            {"Metric": "Peak Link Quality", "Value": rc["peakLinkQuality"]},
            {"Metric": "Peak RSSI", "Value": rc["peakRssi"]},
            {"Metric": "Active Channel Count", "Value": rc["activeChannelCount"]},
            *[
                {"Metric": f"Average {channel['label']}", "Value": channel["average"]}
                for channel in rc["channelAverages"]
            ],
            {"Metric": "Duration (s)", "Value": rc["durationS"]},
        ]
    )
    rc_samples_df = pd.DataFrame(rc["samples"], columns=["timeS", "linkQualityPercent", "rssiPercent"])
    rc_channels_df = pd.DataFrame(rc["channelSamples"], columns=["timeS", *RC_CHANNEL_COLUMNS])
    gps_df = pd.DataFrame(
        [
            {
                "gpsStatus": map_data["gpsStatus"],
                "satelliteCount": map_data["satelliteCount"],
                "homeLocation": map_data["homeLocation"],
                "totalTrackPoints": map_data["totalTrackPoints"],
            }
        ]
    )
    map_route_df = pd.DataFrame(
        map_data["routePoints"],
        columns=["timeS", "lat", "lon", "alt", "speed", "satellites", "gpsStatus"],
    )
    event_markers_df = pd.DataFrame(map_data["eventMarkers"], columns=["timeS", "label", "detail", "category", "severity"])
    modes_df = pd.DataFrame({"mode": overview["flightModes"]})
    message_counts_df = pd.DataFrame(
        [
            {"Category": "Errors", "Count": messages["errorCount"]},
            {"Category": "Warnings", "Count": messages["warningCount"]},
            {"Category": "Info", "Count": messages["infoCount"]},
        ]
    )
    raw_messages_df = pd.DataFrame(messages["rawMessages"], columns=["timeS", "type", "severity", "text"])
    warnings_df = pd.DataFrame({"warning": overview["keyWarnings"]})
    anomalies_df = pd.DataFrame({"anomaly": overview["keyAnomalies"]})
    report_meta_df = pd.DataFrame(
        [
            {
                "Format": reports["format"],
                "AvailableSheets": ", ".join(reports["availableSheets"]),
                "IsReady": reports["isReady"],
            }
        ]
    )

    power_samples_start = len(power_summary_df) + 2
    vibration_samples_start = len(vibration_summary_df) + 2
    rc_samples_start = len(rc_health_df) + 2

    with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
        overview_df.to_excel(writer, sheet_name="Summary", index=False)
        timeline_df.to_excel(writer, sheet_name="Timeline", index=False)
        signal_samples_df.to_excel(writer, sheet_name="SignalSamples", index=False)
        power_summary_df.to_excel(writer, sheet_name="Power", index=False)
        power_samples_df.to_excel(writer, sheet_name="Power", index=False, startrow=power_samples_start)
        vibration_summary_df.to_excel(writer, sheet_name="Vibration", index=False)
        vibration_samples_df.to_excel(writer, sheet_name="Vibration", index=False, startrow=vibration_samples_start)
        rc_health_df.to_excel(writer, sheet_name="RcHealth", index=False)
        rc_samples_df.to_excel(writer, sheet_name="RcHealth", index=False, startrow=rc_samples_start)
        rc_channels_df.to_excel(writer, sheet_name="RcChannels", index=False)
        map_route_df.to_excel(writer, sheet_name="MapRoute", index=False)
        gps_df.to_excel(writer, sheet_name="GPS", index=False)
        event_markers_df.to_excel(writer, sheet_name="EventMarkers", index=False)
        modes_df.to_excel(writer, sheet_name="FlightModes", index=False)
        message_counts_df.to_excel(writer, sheet_name="MessageCounts", index=False)
        raw_messages_df.to_excel(writer, sheet_name="Messages", index=False)
        warnings_df.to_excel(writer, sheet_name="Warnings", index=False)
        anomalies_df.to_excel(writer, sheet_name="Anomalies", index=False)
        report_meta_df.to_excel(writer, sheet_name="ReportMeta", index=False)

        workbook = writer.book
        power_sheet = workbook["Power"]
        vibration_sheet = workbook["Vibration"]
        rc_health_sheet = workbook["RcHealth"]
        rc_channels_sheet = workbook["RcChannels"]
        map_route_sheet = workbook["MapRoute"]
        message_counts_sheet = workbook["MessageCounts"]

        _add_line_chart(
            power_sheet,
            title="Power Profile",
            y_axis_title="Voltage (V) / Current (A)",
            x_axis_title="Time",
            min_col=2,
            max_col=3,
            header_row=power_samples_start + 1,
            first_data_row=power_samples_start + 2,
            last_data_row=power_samples_start + len(power_samples_df) + 1,
            anchor="F2",
            colors=["FF4A4A", "1F6FFF"],
        )
        _add_line_chart(
            vibration_sheet,
            title="Vibration Profile",
            y_axis_title="Vibration",
            x_axis_title="Time",
            min_col=2,
            max_col=4,
            header_row=vibration_samples_start + 1,
            first_data_row=vibration_samples_start + 2,
            last_data_row=vibration_samples_start + len(vibration_samples_df) + 1,
            anchor="F2",
            colors=["FF4A4A", "F59E0B", "0F8BFF"],
            height=10,
        )
        _add_line_chart(
            rc_health_sheet,
            title="RC Health Trend",
            y_axis_title="Percent",
            x_axis_title="Time",
            min_col=2,
            max_col=3,
            header_row=rc_samples_start + 1,
            first_data_row=rc_samples_start + 2,
            last_data_row=rc_samples_start + len(rc_samples_df) + 1,
            anchor="F2",
            colors=["FF4A4A", "0F8BFF"],
        )
        _add_line_chart(
            rc_channels_sheet,
            title="RC Channel Trend",
            y_axis_title="Microseconds",
            x_axis_title="Time",
            min_col=2,
            max_col=9,
            header_row=1,
            first_data_row=2,
            last_data_row=len(rc_channels_df) + 1,
            anchor="L2",
            colors=["FF4A4A", "F97316", "F59E0B", "84CC16", "14B8A6", "0F8BFF", "6366F1", "EC4899"],
            width=22,
            height=11,
        )
        _add_line_chart(
            map_route_sheet,
            title="Route Altitude and Speed",
            y_axis_title="Altitude / Speed",
            x_axis_title="Time",
            min_col=4,
            max_col=5,
            header_row=1,
            first_data_row=2,
            last_data_row=len(map_route_df) + 1,
            anchor="J2",
            colors=["FF4A4A", "0F8BFF"],
        )
        _add_bar_chart(
            message_counts_sheet,
            title="Message Counts",
            y_axis_title="Count",
            min_col=2,
            max_col=2,
            header_row=1,
            first_data_row=2,
            last_data_row=len(message_counts_df) + 1,
            anchor="E2",
            colors=["FF4A4A"],
        )

        for sheet_name in workbook.sheetnames:
            _autosize_columns(workbook[sheet_name])

    return str(excel_path)


def generate_pdf_report(analysis: dict[str, Any], output_dir: str | None = None, report_folder: Path | None = None) -> str:
    report_folder = report_folder or _create_report_folder(output_dir)
    pdf_path = report_folder / "mission_report.pdf"
    generated_at = datetime.now()
    current_year = generated_at.year
    overview = analysis["overview"]
    reports = analysis["reports"]

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="KapYahHeaderTitle",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=28,
            textColor=colors.HexColor("#D62828"),
            alignment=TA_LEFT,
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KapYahHeaderSub",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=14,
            textColor=colors.HexColor("#425166"),
            alignment=TA_LEFT,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KapYahSection",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=colors.HexColor("#18202B"),
            spaceBefore=10,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KapYahBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=15,
            textColor=colors.HexColor("#263444"),
            spaceAfter=7,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KapYahFooter",
            parent=styles["BodyText"],
            alignment=TA_CENTER,
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#6E7A8B"),
            spaceBefore=12,
        )
    )

    story: list[Any] = []
    workspace_root = Path(__file__).resolve().parents[1]
    logo_path = workspace_root / "src" / "assets" / "kapyah-company-mark-redico.png"
    title_block = [
        Paragraph("KapYah Mission Analysis Report", styles["KapYahHeaderTitle"]),
    ]
    if logo_path.exists():
        logo = Image(str(logo_path), width=18 * mm, height=18 * mm)
        header_table = Table([[logo, title_block]], colWidths=[24 * mm, 146 * mm])
    else:
        header_table = Table([[title_block]], colWidths=[170 * mm])
    header_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (0, 0), "LEFT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(header_table)
    story.append(Spacer(1, 5 * mm))

    assessment = _assessment_label(overview, analysis["messages"])
    meta_data = [
        ["Generated", generated_at.strftime("%d %b %Y, %I:%M %p")],
        ["Website", "www.kapyah.com"],
        ["Log File", _text(overview.get("logName"))],
        ["Vehicle", _text(overview.get("vehicleType"))],
        ["Mission Status", assessment],
    ]
    meta_table = Table(meta_data, colWidths=[34 * mm, 126 * mm])
    meta_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9.2),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#D62828")),
                ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#263444")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, -1), (-1, -1), 0.6, colors.HexColor("#E3CFC5")),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 4 * mm))

    glance_data = [
        ["Flight Duration", _text(overview.get("totalFlightDuration"))],
        ["Mission Window", _text(overview.get("armDisarmTime"))],
        ["GPS Status", _text(overview.get("gpsStatus"))],
        ["Satellite Count", _text(overview.get("satelliteCount"))],
        ["Home Location Details", _text(overview.get("homeLocation"))],
        ["Distance Traveled", _text(overview.get("distanceTraveled"))],
        ["Max Height Reached", _text(overview.get("maxAltitude"))],
        ["Max Speed", _text(overview.get("maxSpeed"))],
        ["Orientation Source", _text(overview.get("orientationSource"))],
        ["IMU Summary", _text(overview.get("imuCount"))],
        ["Proximity Sensors", _text(overview.get("proximitySensorCount"))],
        ["RC Health", _text(overview.get("rcHealth"))],
    ]
    story.append(Paragraph("Mission At A Glance", styles["KapYahSection"]))
    glance_table = Table(glance_data, colWidths=[52 * mm, 108 * mm])
    glance_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9.2),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#18202B")),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#FFF8F4"), colors.whitesmoke]),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#E3CFC5")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(glance_table)
    story.append(Spacer(1, 3 * mm))

    sections = [
        ("Mission Overview", _build_mission_overview_paragraphs(analysis, generated_at)),
        ("Route And GPS Review", _build_navigation_paragraphs(analysis)),
        ("Timeline And Messages", _build_timeline_message_paragraphs(analysis)),
        ("Power, Vibration, And RC Review", _build_system_health_paragraphs(analysis)),
        ("Findings And Final Assessment", _build_findings_paragraphs(analysis)),
    ]
    for title, paragraphs in sections:
        story.append(Paragraph(title, styles["KapYahSection"]))
        for paragraph in paragraphs:
            story.append(Paragraph(escape(paragraph), styles["KapYahBody"]))

    story.append(Paragraph(f"&#169; {current_year} KapYah Industries Pvt. Ltd. All rights reserved.", styles["KapYahFooter"]))

    document = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=14 * mm,
    )
    document.build(story)
    return str(pdf_path)



