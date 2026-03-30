"""File purpose: ULog-specific parsing helpers used for .ulg and .ulog support."""
from __future__ import annotations

from collections import Counter
from math import degrees, sqrt
from pathlib import Path
from typing import Any

from pyulog import ULog

from analyzer import (
    ParsedLog,
    _decode_latitude,
    _decode_longitude,
    _decode_rssi_percent,
    _extract_mode_from_text,
    _format_modified_time,
    _non_negative_float,
    _normalize_heading_degrees,
    MAX_RC_CHANNELS,
    _round_or_none,
    _safe_float,
    _sort_by_time,
)

PX4_TO_APP_MODE = {
    0: "Stabilize",
    1: "Altitude Hold",
    2: "Position Hold",
    3: "Auto",
    4: "Loiter",
    5: "Return To Launch",
    6: "Acro",
    7: "Guided",
    8: "Stabilize",
    9: "Acro",
    10: "Guided",
    11: "Land",
    12: "Land",
    13: "Land",
}


def _ulog_time_s(timestamp_us: Any, start_timestamp_us: float) -> float | None:
    timestamp = _safe_float(timestamp_us)
    if timestamp is None:
        return None
    return _round_or_none(max((timestamp - start_timestamp_us) / 1_000_000, 0.0), 1)


def _ulog_altitude_m(value: Any) -> float | None:
    altitude = _safe_float(value)
    if altitude is None:
        return None
    if abs(altitude) > 100000:
        altitude = altitude / 1000.0
    return altitude


def _ulog_speed_m_s(dataset: Any, index: int) -> float | None:
    direct_speed = _safe_float(_ulog_value(dataset, index, ["vel_m_s", "groundspeed_m_s", "ground_speed_ms"]))
    if direct_speed is not None:
        return _non_negative_float(direct_speed)

    north = _safe_float(_ulog_value(dataset, index, ["vel_n_m_s", "e_vel", "vel_n"]))
    east = _safe_float(_ulog_value(dataset, index, ["vel_e_m_s", "n_vel", "vel_e"]))
    if north is None and east is None:
        return None
    north = north or 0.0
    east = east or 0.0
    return _round_or_none(sqrt((north ** 2) + (east ** 2)), 2)


def _ulog_value(dataset: Any, index: int, field_names: list[str]) -> Any:
    for field_name in field_names:
        values = dataset.data.get(field_name)
        if values is None or index >= len(values):
            continue
        return values[index]
    return None


def _iter_datasets(ulog: ULog, *names: str) -> list[Any]:
    allowed = set(names)
    return [dataset for dataset in ulog.data_list if dataset.name in allowed]


def _severity_from_ulog_level(level_name: str) -> str:
    normalized = level_name.strip().upper()
    if normalized in {"EMERGENCY", "ALERT", "CRITICAL", "ERROR"}:
        return "error"
    if normalized in {"WARNING", "WARN"}:
        return "warning"
    return "info"


def _append_timestamp(target: list[float], time_s: float | None) -> None:
    if time_s is not None:
        target.append(time_s)


def parse_ulog_log(log_file: str) -> ParsedLog:
    log_path = Path(log_file)
    ulog = ULog(str(log_path))
    start_timestamp_us = _safe_float(getattr(ulog, "start_timestamp", None)) or 0.0

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
    error_messages: list[str] = []
    warning_messages: list[str] = []
    info_messages: list[str] = []
    event_messages: list[str] = []
    message_records: list[dict[str, Any]] = []
    message_counts: Counter[str] = Counter()

    for dataset in ulog.data_list:
        message_counts[dataset.name] += len(dataset.data.get("timestamp", []))

    for dataset in _iter_datasets(ulog, "sensor_combined", "sensor_accel", "vehicle_imu"):
        timestamps_us = dataset.data.get("timestamp", [])
        for index, timestamp_us in enumerate(timestamps_us):
            time_s = _ulog_time_s(timestamp_us, start_timestamp_us)
            x = _ulog_value(dataset, index, ["accelerometer_m_s2[0]", "x", "xyz[0]"])
            y = _ulog_value(dataset, index, ["accelerometer_m_s2[1]", "y", "xyz[1]"])
            z = _ulog_value(dataset, index, ["accelerometer_m_s2[2]", "z", "xyz[2]"])
            x_value = _safe_float(x)
            y_value = _safe_float(y)
            z_value = _safe_float(z)
            if x_value is None and y_value is None and z_value is None:
                continue
            _append_timestamp(timestamps, time_s)
            vibration_rows.append(
                {
                    "time_s": time_s,
                    "x": abs(x_value) if x_value is not None else None,
                    "y": abs(y_value) if y_value is not None else None,
                    "z": abs(z_value) if z_value is not None else None,
                    "source": dataset.name,
                }
            )
            imu_instances.add(dataset.multi_id)

    for dataset in _iter_datasets(ulog, "battery_status"):
        timestamps_us = dataset.data.get("timestamp", [])
        for index, timestamp_us in enumerate(timestamps_us):
            time_s = _ulog_time_s(timestamp_us, start_timestamp_us)
            voltage = _safe_float(_ulog_value(dataset, index, ["voltage_v", "voltage_filtered_v"]))
            current = _safe_float(_ulog_value(dataset, index, ["current_a", "current_filtered_a"]))
            if voltage is None and current is None:
                continue
            _append_timestamp(timestamps, time_s)
            power_rows.append(
                {
                    "time_s": time_s,
                    "voltage": _non_negative_float(voltage),
                    "current": _non_negative_float(current),
                }
            )

    for dataset in _iter_datasets(ulog, "vehicle_gps_position", "vehicle_global_position"):
        timestamps_us = dataset.data.get("timestamp", [])
        for index, timestamp_us in enumerate(timestamps_us):
            time_s = _ulog_time_s(timestamp_us, start_timestamp_us)
            lat = _decode_latitude(_ulog_value(dataset, index, ["lat", "lat_deg"]))
            lon = _decode_longitude(_ulog_value(dataset, index, ["lon", "lon_deg"]))
            alt = _ulog_altitude_m(_ulog_value(dataset, index, ["alt", "altitude_msl_m", "alt_ellipsoid", "alt_ellipsoid_m"]))
            speed = _ulog_speed_m_s(dataset, index)
            satellites = _ulog_value(dataset, index, ["satellites_used", "satellites_visible"])
            status = _ulog_value(dataset, index, ["fix_type"])
            if lat is None or lon is None:
                continue
            _append_timestamp(timestamps, time_s)
            gps_rows.append(
                {
                    "time_s": time_s,
                    "lat": lat,
                    "lon": lon,
                    "alt": alt,
                    "speed": speed,
                    "satellites": satellites,
                    "status": status,
                    "source": dataset.name,
                }
            )

            heading_rad = _safe_float(_ulog_value(dataset, index, ["cog_rad", "heading"]))
            if heading_rad is not None:
                heading = _normalize_heading_degrees(degrees(heading_rad) if abs(heading_rad) <= 6.5 else heading_rad)
                if heading is not None:
                    heading_rows.append({"time_s": time_s, "heading": heading, "source": dataset.name})

    for dataset in _iter_datasets(ulog, "vehicle_local_position"):
        timestamps_us = dataset.data.get("timestamp", [])
        for index, timestamp_us in enumerate(timestamps_us):
            time_s = _ulog_time_s(timestamp_us, start_timestamp_us)
            north = _safe_float(_ulog_value(dataset, index, ["vx", "vx_m_s"]))
            east = _safe_float(_ulog_value(dataset, index, ["vy", "vy_m_s"]))
            down = _safe_float(_ulog_value(dataset, index, ["z", "dist_bottom"]))
            speed = None
            if north is not None or east is not None:
                speed = _round_or_none(sqrt(((north or 0.0) ** 2) + ((east or 0.0) ** 2)), 2)
            alt = _round_or_none(max(-(down or 0.0), 0.0), 2) if down is not None else None
            if alt is None and speed is None:
                continue
            _append_timestamp(timestamps, time_s)
            flight_envelope_rows.append(
                {
                    "time_s": time_s,
                    "alt": alt,
                    "speed": speed,
                    "source": dataset.name,
                }
            )
            heading = _safe_float(_ulog_value(dataset, index, ["heading", "heading_good_for_control"]))
            normalized_heading = _normalize_heading_degrees(degrees(heading) if heading is not None and abs(heading) <= 6.5 else heading)
            if normalized_heading is not None:
                heading_rows.append({"time_s": time_s, "heading": normalized_heading, "source": dataset.name})

    for dataset in _iter_datasets(ulog, "input_rc"):
        timestamps_us = dataset.data.get("timestamp", [])
        for index, timestamp_us in enumerate(timestamps_us):
            time_s = _ulog_time_s(timestamp_us, start_timestamp_us)
            channel_row = {"time_s": time_s}
            has_channel_data = False
            for channel_index in range(MAX_RC_CHANNELS):
                raw_value = _safe_float(_ulog_value(dataset, index, [f"values[{channel_index}]", f"channel[{channel_index}]", f"channel{channel_index}"]))
                if raw_value is not None and raw_value > 0:
                    has_channel_data = True
                channel_row[f"rc{channel_index + 1}"] = raw_value
            if has_channel_data:
                _append_timestamp(timestamps, time_s)
                rc_channel_rows.append(channel_row)

            rssi = _decode_rssi_percent(_ulog_value(dataset, index, ["rssi", "signal_lost"]))
            if rssi is not None:
                link_rows.append({"time_s": time_s, "rssi": rssi, "link": rssi, "source": dataset.name})

    for dataset in _iter_datasets(ulog, "telemetry_status"):
        timestamps_us = dataset.data.get("timestamp", [])
        for index, timestamp_us in enumerate(timestamps_us):
            time_s = _ulog_time_s(timestamp_us, start_timestamp_us)
            rssi = _decode_rssi_percent(_ulog_value(dataset, index, ["rssi", "remote_rssi"]))
            link = _decode_rssi_percent(_ulog_value(dataset, index, ["quality", "tx_rate_avg", "rx_rate_avg"]))
            if rssi is None and link is None:
                continue
            _append_timestamp(timestamps, time_s)
            link_rows.append({"time_s": time_s, "rssi": rssi, "link": link or rssi, "source": dataset.name})

    for dataset in _iter_datasets(ulog, "distance_sensor"):
        timestamps_us = dataset.data.get("timestamp", [])
        for index, timestamp_us in enumerate(timestamps_us):
            time_s = _ulog_time_s(timestamp_us, start_timestamp_us)
            distance = _safe_float(_ulog_value(dataset, index, ["current_distance", "distance_m"]))
            if distance is None:
                continue
            if distance > 100:
                distance = distance / 100.0
            _append_timestamp(timestamps, time_s)
            proximity_rows.append(
                {
                    "time_s": time_s,
                    "distance_m": _round_or_none(distance, 2),
                    "sensor_id": _ulog_value(dataset, index, ["device_id", "id"]),
                }
            )

    for dataset in _iter_datasets(ulog, "vehicle_status"):
        timestamps_us = dataset.data.get("timestamp", [])
        for index, timestamp_us in enumerate(timestamps_us):
            time_s = _ulog_time_s(timestamp_us, start_timestamp_us)
            nav_state = _ulog_value(dataset, index, ["nav_state"])
            try:
                mode = PX4_TO_APP_MODE.get(int(nav_state), "")
            except (TypeError, ValueError):
                mode = ""
            if mode and mode != last_mode:
                last_mode = mode
                _append_timestamp(timestamps, time_s)
                mode_rows.append({"time_s": time_s, "mode": mode})
                message_records.append(
                    {
                        "timeS": time_s,
                        "type": "VEHICLE_STATUS",
                        "severity": "info",
                        "text": f"Mode changed to {mode}",
                    }
                )
                event_messages.append(f"Mode changed to {mode}")

    for entry in list(getattr(ulog, "logged_messages", [])) + list(getattr(ulog, "logged_messages_tagged", [])):
        time_s = _ulog_time_s(getattr(entry, "timestamp", None), start_timestamp_us)
        message = str(getattr(entry, "message", "")).strip()
        if not message:
            continue
        _append_timestamp(timestamps, time_s)
        severity = _severity_from_ulog_level(getattr(entry, "log_level_str")())
        message_records.append(
            {
                "timeS": time_s,
                "type": "ULOG",
                "severity": severity,
                "text": message,
            }
        )
        event_messages.append(message)
        if severity == "error":
            error_messages.append(message)
        elif severity == "warning":
            warning_messages.append(message)
        else:
            info_messages.append(message)

        inferred_mode = _extract_mode_from_text(message)
        if inferred_mode and inferred_mode != last_mode:
            last_mode = inferred_mode
            mode_rows.append({"time_s": time_s, "mode": inferred_mode})

    timestamps = sorted(value for value in timestamps if value is not None)
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
