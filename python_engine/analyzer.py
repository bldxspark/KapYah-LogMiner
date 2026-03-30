"""KapYah LogMiner analyzer.

Maintained by Durgesh Tiwari, KapYah Industries Pvt. Ltd.

File purpose: Core Python analysis pipeline that parses supported logs into app-ready mission data.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from math import asin, cos, degrees, radians, sin, sqrt
from pathlib import Path
from statistics import mean
from typing import Any

from pymavlink import mavutil

COPTER_MODE_MAP = {
    0: "Stabilize",
    1: "Acro",
    2: "Altitude Hold",
    3: "Auto",
    4: "Guided",
    5: "Loiter",
    6: "Return To Launch",
    7: "Circle",
    9: "Land",
    11: "Drift",
    13: "Sport",
    14: "Flip",
    15: "Auto Tune",
    16: "Position Hold",
    17: "Brake",
    18: "Throw",
    19: "Avoid ADS-B",
    20: "Guided No GPS",
    21: "Smart RTL",
    22: "Flow Hold",
    23: "Follow",
    24: "ZigZag",
    25: "System ID",
    26: "Autorotate",
    27: "Auto RTL",
}

KNOWN_FLIGHT_MODES = tuple(COPTER_MODE_MAP.values())
MODE_ALIAS_MAP = {
    "ALTHOLD": "Altitude Hold",
    "ALTITUDEHOLD": "Altitude Hold",
    "RTL": "Return To Launch",
    "RETURNTOLAUNCH": "Return To Launch",
    "AUTOTUNE": "Auto Tune",
    "POSHOLD": "Position Hold",
    "GUIDEDNOGPS": "Guided No GPS",
    "SMARTRTL": "Smart RTL",
    "FLOWHOLD": "Flow Hold",
    "SYSTEMID": "System ID",
    "AUTOROTATE": "Autorotate",
    "AUTORTL": "Auto RTL",
}

GPS_STATUS_MAP = {
    0: "No GPS",
    1: "No Fix",
    2: "2D Fix",
    3: "3D Fix",
    4: "DGPS",
    5: "RTK Float",
    6: "RTK Fixed",
}

MAX_RC_CHANNELS = 16
RC_CHANNEL_KEYS = [f"rc{index}" for index in range(1, MAX_RC_CHANNELS + 1)]


@dataclass
class ParsedLog:
    source_file_path: str
    log_name: str
    modified_at: str | None
    timestamps: list[float]
    vibration_rows: list[dict[str, Any]]
    power_rows: list[dict[str, Any]]
    gps_rows: list[dict[str, Any]]
    flight_envelope_rows: list[dict[str, Any]]
    heading_rows: list[dict[str, Any]]
    link_rows: list[dict[str, Any]]
    rc_channel_rows: list[dict[str, Any]]
    proximity_rows: list[dict[str, Any]]
    imu_instances: list[int]
    mode_rows: list[dict[str, Any]]
    error_messages: list[str]
    warning_messages: list[str]
    info_messages: list[str]
    event_messages: list[str]
    message_records: list[dict[str, Any]]
    message_counts: Counter[str]


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _non_negative_float(value: Any) -> float | None:
    parsed = _safe_float(value)
    if parsed is None or parsed < 0:
        return None
    return parsed


def _round_or_none(value: float | None, digits: int = 2) -> float | None:
    return round(value, digits) if value is not None else None


def _format_duration(seconds: float) -> str:
    # Keep short missions readable in seconds and longer missions in minutes/hours.
    total_seconds = int(seconds)
    if total_seconds < 300:
        return f"{total_seconds} s"

    minutes, remaining = divmod(total_seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours} h {minutes} min"
    return f"{minutes} min"


def _format_clock(seconds: float) -> str:
    total_seconds = int(seconds)
    hours, remainder = divmod(total_seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def _format_modified_time(path: Path) -> str | None:
    try:
        return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat(timespec="seconds")
    except OSError:
        return None


def _normalize_mode_token(value: str) -> str:
    return "".join(character for character in value.upper() if character.isalnum())


def _extract_mode_labels(raw_value: str) -> list[str]:
    cleaned = raw_value.strip()
    if not cleaned:
        return []

    labels: list[str] = []
    parts = [part.strip() for part in cleaned.replace("|", ",").split(",") if part.strip()]
    candidates = parts or [cleaned]

    for part in candidates:
        normalized_part = _normalize_mode_token(part)
        for known_mode in KNOWN_FLIGHT_MODES:
            normalized_mode = _normalize_mode_token(known_mode)
            if normalized_part == normalized_mode or normalized_mode in normalized_part:
                if known_mode not in labels:
                    labels.append(known_mode)
        alias_match = MODE_ALIAS_MAP.get(normalized_part)
        if alias_match and alias_match not in labels:
            labels.append(alias_match)

    return labels


def _clean_mode_label(raw_value: str) -> str:
    labels = _extract_mode_labels(raw_value)
    return labels[0] if labels else ""


def _is_valid_mode_label(mode: str) -> bool:
    cleaned = mode.strip()
    if not cleaned:
        return False
    if cleaned in KNOWN_FLIGHT_MODES:
        return True
    if cleaned.isdigit():
        return False
    if "," in cleaned or "|" in cleaned:
        return False
    return any(character.isalpha() for character in cleaned)


def _map_flight_mode(mode_value: Any) -> str:
    raw_value = _clean_mode_label(str(mode_value))
    if not raw_value:
        return ""
    if raw_value in KNOWN_FLIGHT_MODES:
        return raw_value

    try:
        mode_num = int(raw_value)
    except (TypeError, ValueError):
        return raw_value if _is_valid_mode_label(raw_value) else ""
    return COPTER_MODE_MAP.get(mode_num, "")


def _extract_mode_from_text(text: str) -> str:
    for label in _extract_mode_labels(text):
        if _is_valid_mode_label(label):
            return label
    return ""


def _extract_mode_from_message(msg: Any, msg_type: str) -> str:
    candidate_fields = ["Mode", "mode", "mode_name", "ModeName", "flightmode", "FlightMode"]
    if msg_type == "MODE":
        candidate_fields.extend(["ModeNum", "modenum", "mode_num"])
    if msg_type == "HEARTBEAT":
        candidate_fields.extend(["custom_mode", "CustomMode"])

    for field_name in candidate_fields:
        mode = _map_flight_mode(getattr(msg, field_name, ""))
        if mode:
            return mode

    if msg_type == "HEARTBEAT":
        try:
            mode_name = mavutil.mode_string_v10(msg)
        except Exception:
            mode_name = ""
        mode = _extract_mode_from_text(str(mode_name))
        if mode:
            return mode

    text_candidates = [
        getattr(msg, "text", ""),
        getattr(msg, "Text", ""),
        getattr(msg, "Message", ""),
    ]
    for candidate in text_candidates:
        mode = _extract_mode_from_text(str(candidate))
        if mode:
            return mode

    return ""


def _map_gps_status(status: Any) -> str | None:
    try:
        status_num = int(status)
    except (TypeError, ValueError):
        return str(status) if status is not None else None
    return GPS_STATUS_MAP.get(status_num, str(status_num))


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371000.0
    lat1_rad, lon1_rad, lat2_rad, lon2_rad = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = sin(dlat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2) ** 2
    return 2 * radius * asin(sqrt(a))


def _format_distance(distance_m: float | None) -> str | None:
    if distance_m is None:
        return None
    if distance_m >= 1000:
        return f"{distance_m / 1000:.2f} km"
    return f"{distance_m:.0f} m"


def _is_placeholder_coordinate(lat: float | None, lon: float | None) -> bool:
    if lat is None or lon is None:
        return False
    return abs(lat) < 0.000001 and abs(lon) < 0.000001


def _format_location(lat: float | None, lon: float | None, alt: float | None = None) -> str | None:
    if lat is None or lon is None or _is_placeholder_coordinate(lat, lon):
        return None
    lat_cardinal = "N" if lat >= 0 else "S"
    lon_cardinal = "E" if lon >= 0 else "W"
    location = f"{abs(lat):.6f} {lat_cardinal}, {abs(lon):.6f} {lon_cardinal}"
    if alt is None:
        return location
    return f"{location} | Alt {alt:.2f} m"


def _gps_fix_rank(status: Any) -> int | None:
    try:
        return int(status)
    except (TypeError, ValueError):
        return None


def _has_usable_gps_fix(row: dict[str, Any]) -> bool:
    status = _gps_fix_rank(row.get("status"))
    source = row.get("source")
    satellites = row.get("satellites")
    try:
        satellite_count = int(satellites) if satellites is not None else None
    except (TypeError, ValueError):
        satellite_count = None

    if row.get("lat") is None or row.get("lon") is None:
        return False

    if _is_placeholder_coordinate(row.get("lat"), row.get("lon")):
        return False

    if source == "GLOBAL_POSITION_INT":
        return True

    if status is not None and status < 3:
        return False

    if satellite_count is not None and satellite_count < 5:
        return False

    return True


def _is_reasonable_gps_step(
    previous_point: dict[str, Any],
    current_point: dict[str, Any],
) -> bool:
    step_distance = _haversine_meters(
        previous_point["lat"],
        previous_point["lon"],
        current_point["lat"],
        current_point["lon"],
    )
    previous_time = previous_point.get("time_s")
    current_time = current_point.get("time_s")
    previous_speed = _non_negative_float(previous_point.get("speed"))
    current_speed = _non_negative_float(current_point.get("speed"))
    step_time = None
    if previous_time is not None and current_time is not None:
        step_time = max((current_time or 0) - (previous_time or 0), 0)

    if step_distance > 1000:
        return False

    if step_time is None:
        return step_distance <= 30

    if step_time == 0:
        return step_distance <= 2

    step_speed = step_distance / step_time
    if step_speed > 35:
        return False

    reported_speed = max(
        previous_speed or 0.0,
        current_speed or 0.0,
    )
    allowed_distance = max(3.0, (reported_speed * step_time * 2.0) + 5.0)
    if step_distance > allowed_distance:
        return False

    return True


def _format_speed(speed_m_s: float | None) -> str | None:
    return f"{speed_m_s:.2f} m/s" if speed_m_s is not None else None


def _format_percent(value: float | None) -> str | None:
    return f"{value:.0f} %" if value is not None else None


def _normalize_heading_degrees(value: float | None) -> float | None:
    if value is None:
        return None
    normalized = value % 360
    return _round_or_none(normalized, 1)


def _decode_heading_cdeg(value: Any) -> float | None:
    heading = _safe_float(value)
    if heading is None or heading < 0 or heading == 65535:
        return None
    return _normalize_heading_degrees(heading / 100)


def _decode_rssi_percent(value: Any) -> float | None:
    raw_value = _safe_float(value)
    if raw_value is None or raw_value < 0:
        return None
    if raw_value <= 100:
        return _round_or_none(raw_value, 1)
    return _round_or_none(min((raw_value / 255.0) * 100.0, 100.0), 1)


def _decode_link_quality_percent(value: Any) -> float | None:
    raw_value = _safe_float(value)
    if raw_value is None or raw_value < 0:
        return None
    if raw_value <= 100:
        return _round_or_none(raw_value, 1)
    return _round_or_none(max(0.0, 100.0 - (raw_value / 100.0)), 1)


def _classify_rc_health(signal_strength: float | None, communication_strength: float | None) -> str | None:
    available = [value for value in [signal_strength, communication_strength] if value is not None]
    if not available:
        return None
    score = min(available)
    if score >= 75:
        return "Nominal"
    if score >= 45:
        return "Monitor"
    return "Weak"


def _infer_orientation_source(heading_rows: list[dict[str, Any]]) -> str | None:
    if not heading_rows:
        return None

    sources = {str(row.get("source", "")) for row in heading_rows}
    if sources & {"XKF1", "AHR2"}:
        return "EKF / AHRS"
    return "Compass / Magnetometer"


def _format_imu_summary(imu_instances: list[int], fallback_count: int | None) -> str | None:
    if imu_instances:
        labels = ", ".join(f"IMU{index}" for index in imu_instances)
        return f"{len(imu_instances)} | {labels}"
    if fallback_count is None:
        return None
    return str(fallback_count)


def _infer_imu_count_from_messages(message_counts: Counter[str]) -> int | None:
    scaled_matches = set()
    imu_matches = set()

    for message_name, count in message_counts.items():
        if count <= 0:
            continue

        if message_name == "HIGHRES_IMU":
            scaled_matches.add(0)
            continue

        if message_name == "SCALED_IMU":
            scaled_matches.add(0)
            continue

        if message_name.startswith("SCALED_IMU"):
            suffix = message_name.removeprefix("SCALED_IMU")
            if suffix.isdigit():
                scaled_matches.add(int(suffix) - 1)
                continue

        if message_name.startswith("IMU"):
            suffix = message_name.removeprefix("IMU")
            if suffix.isdigit():
                imu_matches.add(int(suffix))

    inferred = scaled_matches or imu_matches
    return (max(inferred) + 1) if inferred else None


def _append_mission_boundary_records(
    timestamps: list[float],
    message_records: list[dict[str, Any]],
    info_messages: list[str],
    event_messages: list[str],
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    if not timestamps:
        return message_records, info_messages, event_messages

    start_time = _round_or_none(min(timestamps), 1) or 0.0
    end_time = _round_or_none(max(timestamps), 1) or start_time

    existing_text = {str(record.get("text", "")).strip().lower() for record in message_records}
    records = list(message_records)
    info_items = list(info_messages)
    event_items = list(event_messages)

    if "mission started" not in existing_text:
        records.append({"timeS": start_time, "type": "SYSTEM", "severity": "info", "text": "Mission started"})
        info_items.insert(0, "Mission started")
        event_items.insert(0, "Mission started")

    if "mission end" not in existing_text:
        records.append({"timeS": end_time, "type": "SYSTEM", "severity": "info", "text": "Mission end"})
        info_items.append("Mission end")
        event_items.append("Mission end")

    return _sort_by_time(records, "timeS"), info_items, event_items


def _build_signal_samples(
    heading_rows: list[dict[str, Any]],
    link_rows: list[dict[str, Any]],
    gps_rows: list[dict[str, Any]],
    proximity_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: dict[float, dict[str, Any]] = {}

    def ensure_row(time_s: float | None) -> dict[str, Any] | None:
        if time_s is None:
            return None
        key = float(time_s)
        existing = rows.get(key)
        if existing is None:
            existing = {
                "timeS": _round_or_none(key, 1),
                "headingDeg": None,
                "rssiPercent": None,
                "linkQualityPercent": None,
                "satellites": None,
                "proximityM": None,
            }
            rows[key] = existing
        return existing

    for row in heading_rows:
        target = ensure_row(row.get("time_s"))
        if target is not None and row.get("heading") is not None:
            target["headingDeg"] = row.get("heading")

    for row in link_rows:
        target = ensure_row(row.get("time_s"))
        if target is None:
            continue
        if row.get("rssi") is not None:
            target["rssiPercent"] = row.get("rssi")
        if row.get("link") is not None:
            target["linkQualityPercent"] = row.get("link")

    for row in gps_rows:
        target = ensure_row(row.get("time_s"))
        if target is not None and row.get("satellites") is not None:
            target["satellites"] = row.get("satellites")

    for row in proximity_rows:
        target = ensure_row(row.get("time_s"))
        if target is None:
            continue
        distance = row.get("distance_m")
        if distance is None:
            continue
        current_distance = target.get("proximityM")
        if current_distance is None or distance < current_distance:
            target["proximityM"] = distance

    return [rows[key] for key in sorted(rows.keys())]


def _severity_from_statustext(value: Any) -> str:
    try:
        severity = int(value)
    except (TypeError, ValueError):
        return "info"
    if severity <= 3:
        return "error"
    if severity <= 5:
        return "warning"
    return "info"


def _message_time_seconds(msg: Any) -> float | None:
    time_us = getattr(msg, "TimeUS", None)
    if time_us is not None:
        return _safe_float(time_us) / 1_000_000

    time_boot_ms = getattr(msg, "time_boot_ms", None)
    if time_boot_ms is not None:
        return _safe_float(time_boot_ms) / 1_000

    return None


def _decode_scaled_coordinate(value: Any, scale: float) -> float | None:
    decoded = _safe_float(value)
    if decoded is None:
        return None
    return decoded / scale


def _decode_latitude(value: Any) -> float | None:
    decoded = _safe_float(value)
    if decoded is None:
        return None
    if abs(decoded) > 90:
        decoded = decoded / 10_000_000
    return decoded if -90 <= decoded <= 90 else None


def _decode_longitude(value: Any) -> float | None:
    decoded = _safe_float(value)
    if decoded is None:
        return None
    if abs(decoded) > 180:
        decoded = decoded / 10_000_000
    return decoded if -180 <= decoded <= 180 else None


def _decode_battery_voltage(value: Any) -> float | None:
    voltage = _safe_float(value)
    if voltage is None or voltage < 0:
        return None
    return voltage / 1000


def _decode_battery_current(value: Any) -> float | None:
    current = _safe_float(value)
    if current is None or current < 0:
        return None
    return current / 100


def _decode_ground_speed(vx: Any, vy: Any) -> float | None:
    speed_x = _safe_float(vx)
    speed_y = _safe_float(vy)
    if speed_x is None and speed_y is None:
        return None
    speed_x = speed_x or 0.0
    speed_y = speed_y or 0.0
    return sqrt((speed_x ** 2) + (speed_y ** 2)) / 100


def _append_vibration_row(
    rows: list[dict[str, Any]],
    time_s: float | None,
    x: Any,
    y: Any,
    z: Any,
    source: str,
) -> None:
    x_value = _safe_float(x)
    y_value = _safe_float(y)
    z_value = _safe_float(z)
    rows.append(
        {
            "time_s": time_s,
            "x": abs(x_value) if x_value is not None else None,
            "y": abs(y_value) if y_value is not None else None,
            "z": abs(z_value) if z_value is not None else None,
            "source": source,
        }
    )


def _parse_mavlink_log(log_file: str) -> ParsedLog:
    log_path = Path(log_file)
    mav = mavutil.mavlink_connection(str(log_path))

    timestamps: list[float] = []
    vibration_rows: list[dict[str, Any]] = []
    power_rows: list[dict[str, Any]] = []
    gps_rows: list[dict[str, Any]] = []
    flight_envelope_rows: list[dict[str, Any]] = []
    heading_rows: list[dict[str, Any]] = []
    link_rows: list[dict[str, Any]] = []
    rc_channel_rows: list[dict[str, Any]] = []
    proximity_rows: list[dict[str, Any]] = []
    imu_instances: set[int] = set()
    mode_rows: list[dict[str, Any]] = []
    last_mode: str | None = None
    last_known_time_s: float | None = None
    error_messages: list[str] = []
    warning_messages: list[str] = []
    info_messages: list[str] = []
    event_messages: list[str] = []
    message_records: list[dict[str, Any]] = []
    message_counts: Counter[str] = Counter()

    while True:
        msg = mav.recv_match()
        if msg is None:
            break

        msg_type = msg.get_type()
        if msg_type == "BAD_DATA":
            continue

        message_counts[msg_type] += 1

        raw_time_s = _message_time_seconds(msg)
        if raw_time_s is not None:
            last_known_time_s = raw_time_s
            timestamps.append(raw_time_s)

        effective_time_s = raw_time_s if raw_time_s is not None else last_known_time_s
        time_s = _round_or_none(effective_time_s, 1)

        if msg_type == "VIBE":
            _append_vibration_row(
                vibration_rows,
                time_s,
                getattr(msg, "VibeX", None),
                getattr(msg, "VibeY", None),
                getattr(msg, "VibeZ", None),
                "VIBE",
            )
        elif msg_type == "VIBRATION":
            _append_vibration_row(
                vibration_rows,
                time_s,
                getattr(msg, "vibration_x", None),
                getattr(msg, "vibration_y", None),
                getattr(msg, "vibration_z", None),
                "VIBRATION",
            )
        elif msg_type == "HIGHRES_IMU":
            imu_instances.add(0)
            _append_vibration_row(
                vibration_rows,
                time_s,
                getattr(msg, "xacc", None),
                getattr(msg, "yacc", None),
                getattr(msg, "zacc", None),
                "HIGHRES_IMU",
            )
        elif msg_type == "SCALED_IMU2":
            imu_instances.add(1)
            _append_vibration_row(
                vibration_rows,
                time_s,
                getattr(msg, "xacc", None),
                getattr(msg, "yacc", None),
                getattr(msg, "zacc", None),
                "SCALED_IMU2",
            )
        elif msg_type == "SCALED_IMU":
            imu_instances.add(0)
            _append_vibration_row(
                vibration_rows,
                time_s,
                getattr(msg, "xacc", None),
                getattr(msg, "yacc", None),
                getattr(msg, "zacc", None),
                "SCALED_IMU",
            )
        elif msg_type == "IMU":
            imu_index = getattr(msg, "I", None)
            if isinstance(imu_index, int):
                imu_instances.add(imu_index)
            _append_vibration_row(
                vibration_rows,
                time_s,
                getattr(msg, "AccX", None),
                getattr(msg, "AccY", None),
                getattr(msg, "AccZ", None),
                "IMU",
            )
        elif msg_type == "BAT":
            power_rows.append(
                {
                    "time_s": time_s,
                    "voltage": _non_negative_float(getattr(msg, "Volt", None)),
                    "current": _non_negative_float(getattr(msg, "Curr", None)),
                }
            )
        elif msg_type == "VFR_HUD":
            flight_envelope_rows.append(
                {
                    "time_s": time_s,
                    "alt": _safe_float(getattr(msg, "alt", None)),
                    "speed": _non_negative_float(getattr(msg, "groundspeed", None)),
                    "source": "VFR_HUD",
                }
            )
            heading = _normalize_heading_degrees(_safe_float(getattr(msg, "heading", None)))
            if heading is not None:
                heading_rows.append({"time_s": time_s, "heading": heading, "source": "VFR_HUD"})
        elif msg_type == "ATTITUDE":
            yaw_radians = _safe_float(getattr(msg, "yaw", None))
            heading = _normalize_heading_degrees(degrees(yaw_radians)) if yaw_radians is not None else None
            if heading is not None:
                heading_rows.append({"time_s": time_s, "heading": heading, "source": "ATTITUDE"})
        elif msg_type == "XKF1":
            heading = _normalize_heading_degrees(_safe_float(getattr(msg, "Yaw", None)))
            if heading is not None:
                heading_rows.append({"time_s": time_s, "heading": heading, "source": "XKF1"})
        elif msg_type == "AHR2":
            heading = _normalize_heading_degrees(_safe_float(getattr(msg, "Yaw", None)))
            if heading is not None:
                heading_rows.append({"time_s": time_s, "heading": heading, "source": "AHR2"})
        elif msg_type == "GPS":
            gps_rows.append(
                {
                    "time_s": time_s,
                    "lat": _decode_latitude(getattr(msg, "Lat", None)),
                    "lon": _decode_longitude(getattr(msg, "Lng", None)),
                    "alt": _safe_float(getattr(msg, "Alt", None)),
                    "speed": _non_negative_float(getattr(msg, "Spd", None)),
                    "satellites": getattr(msg, "NSats", None),
                    "status": getattr(msg, "Status", None),
                    "source": "GPS",
                }
            )
        elif msg_type == "GPS_RAW_INT":
            gps_rows.append(
                {
                    "time_s": time_s,
                    "lat": _decode_latitude(getattr(msg, "lat", None)),
                    "lon": _decode_longitude(getattr(msg, "lon", None)),
                    "alt": _decode_scaled_coordinate(getattr(msg, "alt", None), 1000),
                    "speed": _decode_scaled_coordinate(getattr(msg, "vel", None), 100),
                    "satellites": getattr(msg, "satellites_visible", None),
                    "status": getattr(msg, "fix_type", None),
                    "source": "GPS_RAW_INT",
                }
            )
            heading = _decode_heading_cdeg(getattr(msg, "cog", None))
            if heading is not None:
                heading_rows.append({"time_s": time_s, "heading": heading, "source": "GPS_RAW_INT"})
        elif msg_type == "GLOBAL_POSITION_INT":
            gps_rows.append(
                {
                    "time_s": time_s,
                    "lat": _decode_latitude(getattr(msg, "lat", None)),
                    "lon": _decode_longitude(getattr(msg, "lon", None)),
                    "alt": _decode_scaled_coordinate(getattr(msg, "relative_alt", None), 1000),
                    "speed": _decode_ground_speed(getattr(msg, "vx", None), getattr(msg, "vy", None)),
                    "satellites": None,
                    "status": None,
                    "source": "GLOBAL_POSITION_INT",
                }
            )
            heading = _decode_heading_cdeg(getattr(msg, "hdg", None))
            if heading is not None:
                heading_rows.append({"time_s": time_s, "heading": heading, "source": "GLOBAL_POSITION_INT"})
        elif msg_type == "RC_CHANNELS":
            channel_row = {"time_s": time_s}
            for channel_index in range(1, MAX_RC_CHANNELS + 1):
                channel_row[f"rc{channel_index}"] = _safe_float(getattr(msg, f"chan{channel_index}_raw", None))
            rc_channel_rows.append(channel_row)
            rssi = _decode_rssi_percent(getattr(msg, "rssi", None))
            if rssi is not None:
                link_rows.append({"time_s": time_s, "rssi": rssi, "link": rssi, "source": "RC_CHANNELS"})
        elif msg_type in {"RADIO", "RADIO_STATUS"}:
            rssi = _decode_rssi_percent(getattr(msg, "rssi", None))
            remote_rssi = _decode_rssi_percent(getattr(msg, "remrssi", None))
            txbuf = _decode_link_quality_percent(getattr(msg, "txbuf", None))
            link_quality = max([value for value in [rssi, remote_rssi, txbuf] if value is not None], default=None)
            if rssi is not None or link_quality is not None:
                link_rows.append({"time_s": time_s, "rssi": rssi or remote_rssi, "link": link_quality, "source": msg_type})
        elif msg_type == "DISTANCE_SENSOR":
            distance_cm = _safe_float(getattr(msg, "current_distance", None))
            distance_m = _round_or_none(distance_cm / 100.0, 2) if distance_cm is not None and distance_cm >= 0 else None
            proximity_rows.append(
                {
                    "time_s": time_s,
                    "distance_m": distance_m,
                    "sensor_id": getattr(msg, "id", None),
                }
            )
        elif msg_type == "MODE":
            mode = _extract_mode_from_message(msg, msg_type)
            if mode and mode != last_mode:
                last_mode = mode
                mode_rows.append({"time_s": time_s, "mode": mode})
                message_records.append(
                    {
                        "timeS": time_s,
                        "type": "MODE",
                        "severity": "info",
                        "text": f"Mode changed to {mode}",
                    }
                )
        elif msg_type == "HEARTBEAT":
            mode = _extract_mode_from_message(msg, msg_type)
            if mode and mode != last_mode:
                last_mode = mode
                mode_rows.append({"time_s": time_s, "mode": mode})
                message_records.append(
                    {
                        "timeS": time_s,
                        "type": "HEARTBEAT",
                        "severity": "info",
                        "text": f"Mode changed to {mode}",
                    }
                )
        elif msg_type == "ERR":
            text = f"ERR Subsys={getattr(msg, 'Subsys', '?')} ECode={getattr(msg, 'ECode', '?')}"
            error_messages.append(text)
            event_messages.append(text)
            message_records.append({"timeS": time_s, "type": "ERR", "severity": "error", "text": text})
        elif msg_type == "SYS_STATUS":
            power_rows.append(
                {
                    "time_s": time_s,
                    "voltage": _decode_battery_voltage(getattr(msg, "voltage_battery", None)),
                    "current": _decode_battery_current(getattr(msg, "current_battery", None)),
                }
            )
            link_quality = _decode_link_quality_percent(getattr(msg, "drop_rate_comm", None))
            if link_quality is not None:
                link_rows.append({"time_s": time_s, "rssi": None, "link": link_quality, "source": "SYS_STATUS"})
        elif msg_type == "BATTERY_STATUS":
            voltages = getattr(msg, "voltages", None)
            voltage = None
            if isinstance(voltages, (list, tuple)):
                valid_cells = [value for value in voltages if value not in (None, 0, 65535)]
                if valid_cells:
                    voltage = sum(valid_cells) / 1000
            power_rows.append(
                {
                    "time_s": time_s,
                    "voltage": voltage,
                    "current": _decode_battery_current(getattr(msg, "current_battery", None)),
                }
            )
        elif msg_type == "STATUSTEXT":
            text = str(getattr(msg, "text", "")).strip()
            severity = _severity_from_statustext(getattr(msg, "severity", None))
            if text:
                inferred_mode = _extract_mode_from_text(text)
                if inferred_mode and inferred_mode != last_mode:
                    last_mode = inferred_mode
                    mode_rows.append({"time_s": time_s, "mode": inferred_mode})
                event_messages.append(text)
                message_records.append(
                    {
                        "timeS": time_s,
                        "type": "STATUSTEXT",
                        "severity": severity,
                        "text": text,
                    }
                )
                if severity == "error":
                    error_messages.append(text)
                elif severity == "warning":
                    warning_messages.append(text)
                else:
                    info_messages.append(text)
        elif msg_type == "MSG":
            text = str(getattr(msg, "Message", getattr(msg, "text", ""))).strip()
            if text:
                inferred_mode = _extract_mode_from_text(text)
                if inferred_mode and inferred_mode != last_mode:
                    last_mode = inferred_mode
                    mode_rows.append({"time_s": time_s, "mode": inferred_mode})
                info_messages.append(text)
                event_messages.append(text)
                message_records.append({"timeS": time_s, "type": "MSG", "severity": "info", "text": text})

    if timestamps:
        start_offset = min(timestamps)
        timestamps = [round(value - start_offset, 1) for value in timestamps]

        def normalize_rows(rows: list[dict[str, Any]]) -> None:
            for row in rows:
                if row.get("time_s") is not None:
                    row["time_s"] = _round_or_none(row["time_s"] - start_offset, 1)

        normalize_rows(vibration_rows)
        normalize_rows(power_rows)
        normalize_rows(gps_rows)
        normalize_rows(flight_envelope_rows)
        normalize_rows(heading_rows)
        normalize_rows(link_rows)
        normalize_rows(proximity_rows)
        normalize_rows(mode_rows)

        for record in message_records:
            if record.get("timeS") is not None:
                record["timeS"] = _round_or_none(record["timeS"] - start_offset, 1)

    vibration_rows = _sort_by_time(vibration_rows, "time_s")
    power_rows = _sort_by_time(power_rows, "time_s")
    gps_rows = _sort_by_time(gps_rows, "time_s")
    flight_envelope_rows = _sort_by_time(flight_envelope_rows, "time_s")
    heading_rows = _sort_by_time(heading_rows, "time_s")
    link_rows = _sort_by_time(link_rows, "time_s")
    rc_channel_rows = _sort_by_time(rc_channel_rows, "time_s")
    proximity_rows = _sort_by_time(proximity_rows, "time_s")
    mode_rows = _sort_by_time(mode_rows, "time_s")
    message_records = _sort_by_time(message_records, "timeS")
    message_records, info_messages, event_messages = _append_mission_boundary_records(
        timestamps,
        message_records,
        info_messages,
        event_messages,
    )

    return ParsedLog(
        source_file_path=str(log_path),
        log_name=log_path.name,
        modified_at=_format_modified_time(log_path),
        timestamps=timestamps,
        vibration_rows=vibration_rows,
        power_rows=power_rows,
        gps_rows=gps_rows,
        flight_envelope_rows=flight_envelope_rows,
        heading_rows=heading_rows,
        link_rows=link_rows,
        rc_channel_rows=rc_channel_rows,
        proximity_rows=proximity_rows,
        imu_instances=sorted(imu_instances),
        mode_rows=mode_rows,
        error_messages=error_messages,
        warning_messages=warning_messages,
        info_messages=info_messages,
        event_messages=event_messages,
        message_records=message_records,
        message_counts=message_counts,
    )


def parse_log(log_file: str) -> ParsedLog:
    log_path = Path(log_file)
    if log_path.suffix.lower() in {".ulg", ".ulog"}:
        from ulog_parser import parse_ulog_log

        return parse_ulog_log(log_file)
    return _parse_mavlink_log(log_file)


def _prepare_vibration_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    preferred_true_sources = ["VIBE", "VIBRATION"]
    preferred_rows = [
        [row for row in rows if row.get("source") == source]
        for source in preferred_true_sources
    ]
    preferred_rows = [filtered for filtered in preferred_rows if filtered]
    if preferred_rows:
        return max(preferred_rows, key=len)

    fallback_sources = ["HIGHRES_IMU", "SCALED_IMU2", "SCALED_IMU"]
    fallback_candidates: list[list[dict[str, Any]]] = []
    for source in fallback_sources:
        filtered = [row for row in rows if row.get("source") == source]
        if not filtered:
            continue

        scale = 1000 if source.startswith("SCALED_IMU") else 1
        derived_rows: list[dict[str, Any]] = []
        previous = None
        for row in filtered:
            if previous is None:
                previous = row
                continue
            derived_rows.append(
                {
                    "time_s": row.get("time_s"),
                    "x": _round_or_none(abs(((row.get("x") or 0) - (previous.get("x") or 0)) / scale), 3),
                    "y": _round_or_none(abs(((row.get("y") or 0) - (previous.get("y") or 0)) / scale), 3),
                    "z": _round_or_none(abs(((row.get("z") or 0) - (previous.get("z") or 0)) / scale), 3),
                }
            )
            previous = row
        if derived_rows:
            fallback_candidates.append(derived_rows)

    if fallback_candidates:
        return max(fallback_candidates, key=len)

    return []


def _preferred_gps_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    source_order = ["GPS_RAW_INT", "GPS", "GLOBAL_POSITION_INT"]
    for source in source_order:
        filtered = [row for row in rows if row.get("source") == source and _has_usable_gps_fix(row)]
        if filtered:
            return filtered
    return [row for row in rows if _has_usable_gps_fix(row)]


def _prepare_power_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    prepared_rows: list[dict[str, Any]] = []
    last_voltage: float | None = None
    last_current: float | None = None

    for row in rows:
        voltage = row.get("voltage")
        current = row.get("current")

        if voltage is not None:
            last_voltage = voltage
        if current is not None:
            last_current = current

        prepared_rows.append(
            {
                "time_s": row.get("time_s"),
                "voltage": last_voltage,
                "current": last_current,
            }
        )

    return prepared_rows


def build_analysis_result(parsed: ParsedLog) -> dict[str, Any]:
    prepared_vibration_rows = _prepare_vibration_rows(parsed.vibration_rows)
    prepared_power_rows = _prepare_power_rows(parsed.power_rows)
    vibration_x = [row["x"] for row in prepared_vibration_rows if row["x"] is not None]
    vibration_y = [row["y"] for row in prepared_vibration_rows if row["y"] is not None]
    vibration_z = [row["z"] for row in prepared_vibration_rows if row["z"] is not None]
    voltages = [row["voltage"] for row in prepared_power_rows if row["voltage"] is not None]
    currents = [row["current"] for row in prepared_power_rows if row["current"] is not None]
    preferred_gps_rows = _preferred_gps_rows(parsed.gps_rows)
    speeds = [row["speed"] for row in preferred_gps_rows if row.get("speed") is not None]
    envelope_speeds = [row["speed"] for row in parsed.flight_envelope_rows if row.get("speed") is not None]
    cleaned_mode_rows = [
        _clean_mode_label(str(row.get("mode", "")))
        for row in parsed.mode_rows
        if row.get("mode")
    ]
    unique_modes = list(dict.fromkeys([
        mode for mode in cleaned_mode_rows if _is_valid_mode_label(mode)
    ]))

    gps_status = None
    satellite_count = None
    home_location = None
    max_altitude = None
    distance_traveled_m = None
    route_points: list[dict[str, Any]] = []
    if preferred_gps_rows:
        last_gps = preferred_gps_rows[-1]
        gps_status = _map_gps_status(last_gps.get("status"))
        satellite_count = last_gps.get("satellites")
        first_gps = preferred_gps_rows[0]
        if first_gps.get("lat") is not None and first_gps.get("lon") is not None:
            home_location = _format_location(first_gps.get("lat"), first_gps.get("lon"), first_gps.get("alt"))

        valid_points: list[dict[str, Any]] = []
        previous_point: dict[str, Any] | None = None
        for row in preferred_gps_rows:
            lat = row.get("lat")
            lon = row.get("lon")
            if lat is None or lon is None:
                continue
            if previous_point is not None and not _is_reasonable_gps_step(previous_point, row):
                continue
            valid_points.append(row)
            previous_point = row
        altitude_baseline = next((row.get("alt") for row in valid_points if row.get("alt") is not None), None)
        normalized_points: list[dict[str, Any]] = []
        normalized_altitudes: list[float] = []
        for row in valid_points:
            normalized_row = dict(row)
            raw_altitude = row.get("alt")
            if raw_altitude is not None:
                baseline = altitude_baseline or 0.0
                normalized_altitude = max(raw_altitude - baseline, 0.0)
                normalized_row["alt"] = _round_or_none(normalized_altitude, 2)
                normalized_altitudes.append(normalized_altitude)
            normalized_points.append(normalized_row)

        max_altitude = _round_or_none(max(normalized_altitudes), 2) if normalized_altitudes else None
        route_points = [
            {
                "timeS": row.get("time_s"),
                "lat": row["lat"],
                "lon": row["lon"],
                "alt": row.get("alt"),
                "speed": row.get("speed"),
                "satellites": row.get("satellites"),
                "gpsStatus": _map_gps_status(row.get("status")),
            }
            for row in normalized_points
        ]
        if route_points and parsed.timestamps:
            mission_start = _round_or_none(min(parsed.timestamps), 1)
            first_route_time = route_points[0].get("timeS")
            if (
                mission_start is not None
                and first_route_time is not None
                and mission_start < first_route_time
            ):
                first_point = route_points[0]
                gap = max(first_route_time - mission_start, 0)
                step_count = max(2, min(int(gap), 18))
                synthetic_points: list[dict[str, Any]] = []
                first_alt = max(first_point.get("alt") or 0.0, 0.0)
                first_speed = max(first_point.get("speed") or 0.0, 0.0)

                for index in range(step_count):
                    ratio = index / step_count
                    synthetic_points.append(
                        {
                            "timeS": _round_or_none(mission_start + (gap * ratio), 1),
                            "lat": first_point["lat"],
                            "lon": first_point["lon"],
                            "alt": _round_or_none(first_alt * ratio, 2),
                            "speed": _round_or_none(first_speed * ratio, 3),
                            "satellites": first_point.get("satellites"),
                            "gpsStatus": first_point.get("gpsStatus"),
                        },
                    )

                route_points = synthetic_points + route_points
        if len(valid_points) >= 2:
            total = 0.0
            for current, nxt in zip(valid_points, valid_points[1:]):
                segment_distance = _haversine_meters(current["lat"], current["lon"], nxt["lat"], nxt["lon"])
                if segment_distance < 0.8:
                    continue
                total += segment_distance
            distance_traveled_m = total

    if max_altitude is None and parsed.flight_envelope_rows:
        envelope_altitudes = [row["alt"] for row in parsed.flight_envelope_rows if row.get("alt") is not None]
        if envelope_altitudes:
            baseline = envelope_altitudes[0]
            normalized_altitudes = [max(altitude - baseline, 0.0) for altitude in envelope_altitudes]
            max_altitude = _round_or_none(max(normalized_altitudes), 2) if normalized_altitudes else None

    if not speeds and envelope_speeds:
        speeds = envelope_speeds

    total_duration = None
    arm_disarm = None
    if parsed.timestamps:
        start = min(parsed.timestamps)
        end = max(parsed.timestamps)
        duration = max(end - start, 0)
        total_duration = _format_duration(duration)
        arm_disarm = f"{_format_clock(start)} - {_format_clock(end)}"

    mission_detected = bool(
        parsed.timestamps
        or parsed.gps_rows
        or parsed.power_rows
        or prepared_vibration_rows
        or parsed.message_records
    )

    anomalies = _build_anomalies(vibration_x, vibration_y, vibration_z, voltages)
    severity_rank = {"info": 0, "warning": 1, "error": 2}
    timeline_events = _build_timeline(parsed)
    highlighted_events = sorted(timeline_events, key=lambda item: (severity_rank[item["severity"]], item["timeS"] or 0), reverse=True)[:8]
    warning_events = [item for item in timeline_events if item["severity"] in {"warning", "error"}][:40]
    mode_transitions = [
        {
            "timeS": row["time_s"],
            "label": _clean_mode_label(row["mode"]),
            "detail": f"Mode transition to {_clean_mode_label(row['mode'])}",
            "category": "mode",
            "severity": "info",
        }
        for row in parsed.mode_rows[:100]
        if _is_valid_mode_label(_clean_mode_label(row["mode"]))
    ]
    dominant_axis = _dominant_axis(vibration_x, vibration_y, vibration_z)
    signal_samples = _build_signal_samples(parsed.heading_rows, parsed.link_rows, preferred_gps_rows, parsed.proximity_rows)
    rssi_values = [row.get("rssi") for row in parsed.link_rows if row.get("rssi") is not None]
    link_quality_values = [row.get("link") for row in parsed.link_rows if row.get("link") is not None]
    average_rssi = _round_or_none(mean(rssi_values), 0) if rssi_values else None
    average_link_quality = _round_or_none(mean(link_quality_values), 0) if link_quality_values else None
    channel_averages: dict[str, float | None] = {}
    for key in RC_CHANNEL_KEYS:
        values = [row.get(key) for row in parsed.rc_channel_rows if row.get(key) is not None]
        channel_averages[key] = _round_or_none(mean(values), 0) if values else None
    active_channel_count = sum(1 for key in RC_CHANNEL_KEYS if channel_averages.get(key) is not None)
    active_channel_averages = [
        {
            "key": key,
            "label": key.upper(),
            "average": channel_averages.get(key),
        }
        for key in RC_CHANNEL_KEYS
        if channel_averages.get(key) is not None
    ]
    imu_count = len(parsed.imu_instances) or None
    if imu_count is None:
        imu_count = _infer_imu_count_from_messages(parsed.message_counts)
    imu_summary = _format_imu_summary(parsed.imu_instances, imu_count)
    proximity_sensor_count = len({row.get("sensor_id") for row in parsed.proximity_rows if row.get("sensor_id") is not None}) or None
    orientation_source = _infer_orientation_source(parsed.heading_rows)
    rc_health = _classify_rc_health(average_rssi, average_link_quality)

    return {
        "status": "ready",
        "sourceFilePath": parsed.source_file_path,
        "overview": {
            "logName": parsed.log_name,
            "dateTime": parsed.modified_at,
            "vehicleType": _guess_vehicle_type(unique_modes) or ("Quadcopter" if (parsed.gps_rows or parsed.power_rows or parsed.vibration_rows) else None),
            "totalFlightDuration": total_duration,
            "armDisarmTime": arm_disarm,
            "flightCount": 1 if mission_detected else 0,
            "flightModes": unique_modes,
            "gpsStatus": gps_status,
            "satelliteCount": satellite_count,
            "homeLocation": home_location,
            "distanceTraveled": _format_distance(distance_traveled_m),
            "maxAltitude": f"{max_altitude} m" if max_altitude is not None else None,
            "maxSpeed": _format_speed(max(speeds)) if speeds else None,
            "orientationSource": orientation_source,
            "imuCount": imu_summary,
            "proximitySensorCount": proximity_sensor_count,
            "rcHealth": rc_health,
            "communicationStrength": _format_percent(average_link_quality),
            "signalStrength": _format_percent(average_rssi),
            "failsafeEvents": [msg for msg in parsed.event_messages if "failsafe" in msg.lower()],
            "errorMessages": parsed.error_messages,
            "keyWarnings": parsed.warning_messages[:5],
            "keyAnomalies": anomalies,
        },
        "timeline": {
            "totalEvents": len(timeline_events),
            "highlightedEvents": highlighted_events,
            "modeTransitions": mode_transitions,
            "warningEvents": warning_events,
            "events": timeline_events[:250],
            "signalSamples": signal_samples,
        },
        "vibration": {
            "averageX": _round_or_none(mean(vibration_x), 2) if vibration_x else None,
            "averageY": _round_or_none(mean(vibration_y), 2) if vibration_y else None,
            "averageZ": _round_or_none(mean(vibration_z), 2) if vibration_z else None,
            "maxX": _round_or_none(max(vibration_x), 2) if vibration_x else None,
            "maxY": _round_or_none(max(vibration_y), 2) if vibration_y else None,
            "maxZ": _round_or_none(max(vibration_z), 2) if vibration_z else None,
            "dominantAxis": dominant_axis,
            "severity": _classify_vibration(vibration_x, vibration_y, vibration_z),
            "durationS": _round_or_none(max(parsed.timestamps), 1) if parsed.timestamps else None,
            "samples": [
                {
                    "timeS": row.get("time_s"),
                    "x": row.get("x"),
                    "y": row.get("y"),
                    "z": row.get("z"),
                }
                for row in prepared_vibration_rows
            ],
        },
        "power": {
            "startingVoltage": _round_or_none(voltages[0], 2) if voltages else None,
            "endingVoltage": _round_or_none(voltages[-1], 2) if voltages else None,
            "minimumVoltage": _round_or_none(min(voltages), 2) if voltages else None,
            "maximumCurrent": _round_or_none(max(currents), 2) if currents else None,
            "averageCurrent": _round_or_none(mean(currents), 2) if currents else None,
            "powerHealth": _classify_power(voltages, currents),
            "durationS": _round_or_none(max(parsed.timestamps), 1) if parsed.timestamps else None,
            "samples": [
                {
                    "timeS": row.get("time_s"),
                    "voltage": row.get("voltage"),
                    "current": row.get("current"),
                }
                for row in prepared_power_rows
            ],
        },
        "rc": {
            "averageLinkQuality": average_link_quality,
            "averageRssi": average_rssi,
            "peakLinkQuality": _round_or_none(max(link_quality_values), 0) if link_quality_values else None,
            "peakRssi": _round_or_none(max(rssi_values), 0) if rssi_values else None,
            "rcHealth": rc_health,
            "activeChannelCount": active_channel_count,
            "channelAverages": active_channel_averages,
            "durationS": _round_or_none(max(parsed.timestamps), 1) if parsed.timestamps else None,
            "samples": [
                {
                    "timeS": row.get("time_s"),
                    "linkQualityPercent": row.get("link"),
                    "rssiPercent": row.get("rssi"),
                }
                for row in parsed.link_rows
            ],
            "channelSamples": [
                {
                    "timeS": row.get("time_s"),
                    **{key: row.get(key) for key in RC_CHANNEL_KEYS},
                }
                for row in parsed.rc_channel_rows
            ],
        },
        "map": {
            "gpsStatus": gps_status,
            "satelliteCount": satellite_count,
            "homeLocation": home_location,
            "totalTrackPoints": len(route_points),
            "routePoints": route_points,
            "highlightedRoute": route_points[::max(len(route_points) // 60, 1)] if route_points else [],
            "eventMarkers": highlighted_events,
        },
        "messages": {
            "errorCount": len(parsed.error_messages),
            "warningCount": len(parsed.warning_messages),
            "infoCount": len(parsed.info_messages),
            "lastEvent": parsed.event_messages[-1] if parsed.event_messages else None,
            "rawMessages": parsed.message_records[:300],
        },
        "reports": {
            "format": "xlsx + pdf",
            "availableSheets": [
                "Summary",
                "Timeline",
                "SignalSamples",
                "Power",
                "Vibration",
                "RcHealth",
                "RcChannels",
                "MapRoute",
                "GPS",
                "EventMarkers",
                "FlightModes",
                "MessageCounts",
                "Messages",
                "Warnings",
                "Anomalies",
                "ReportMeta",
            ],
            "isReady": True,
        },
    }


def _build_timeline(parsed: ParsedLog) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for row in parsed.mode_rows:
        cleaned_mode = _clean_mode_label(row["mode"])
        if not _is_valid_mode_label(cleaned_mode):
            continue
        events.append(
            {
                "timeS": row["time_s"],
                "label": cleaned_mode,
                "detail": f"Mode transition to {cleaned_mode}",
                "category": "mode",
                "severity": "info",
            }
        )
    for record in parsed.message_records:
        events.append(
            {
                "timeS": record["timeS"],
                "label": record["type"],
                "detail": record["text"],
                "category": "warning" if record["severity"] == "warning" else "error" if record["severity"] == "error" else "event",
                "severity": record["severity"],
            }
        )
    events.sort(key=lambda item: (item["timeS"] is None, item["timeS"] or 0))
    return events


def _guess_vehicle_type(flight_modes: list[str]) -> str | None:
    if not flight_modes:
        return None
    return "Quadcopter"


def _dominant_axis(vibration_x: list[float], vibration_y: list[float], vibration_z: list[float]) -> str | None:
    axis_values = {
        "X": max(vibration_x) if vibration_x else None,
        "Y": max(vibration_y) if vibration_y else None,
        "Z": max(vibration_z) if vibration_z else None,
    }
    filtered = {axis: value for axis, value in axis_values.items() if value is not None}
    if not filtered:
        return None
    return max(filtered, key=filtered.get)


def _classify_vibration(vibration_x: list[float], vibration_y: list[float], vibration_z: list[float]) -> str:
    peak = max(vibration_x + vibration_y + vibration_z) if (vibration_x or vibration_y or vibration_z) else 0
    if peak >= 40:
        return "High"
    if peak >= 20:
        return "Monitor"
    return "Nominal"


def _classify_power(voltages: list[float], currents: list[float]) -> str:
    min_voltage = min(voltages) if voltages else None
    max_current = max(currents) if currents else None
    if (min_voltage is not None and min_voltage < 23) or (max_current is not None and max_current > 30):
        return "High Draw"
    if (min_voltage is not None and min_voltage < 24) or (max_current is not None and max_current > 20):
        return "Monitor"
    return "Nominal"


def _sort_by_time(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    return sorted(
        rows,
        key=lambda row: (row.get(key) is None, row.get(key) if row.get(key) is not None else 0),
    )


def _build_anomalies(
    vibration_x: list[float],
    vibration_y: list[float],
    vibration_z: list[float],
    voltages: list[float],
) -> list[str]:
    anomalies: list[str] = []
    if vibration_z and max(vibration_z) > 20:
        anomalies.append("Elevated Z-axis vibration detected")
    if voltages and min(voltages) < 23:
        anomalies.append("Voltage dipped below 23 V")
    return anomalies










