// File purpose: Shared helpers for formatting mission and playback time values.
const INDIA_TIMEZONE = "Asia/Kolkata";
const INDIA_TIMEZONE_LABEL = "IST";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: INDIA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: INDIA_TIMEZONE,
  weekday: "long",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: INDIA_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function shouldUseMinuteTime(maxTimeS: number | null | undefined) {
  return (maxTimeS ?? 0) >= 300;
}

function parseMissionStartTime(missionStartTime: string | null | undefined) {
  if (!missionStartTime) {
    return null;
  }

  const parsed = Date.parse(missionStartTime);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatClockParts(totalSeconds: number) {
  const normalizedSeconds = Math.max(totalSeconds, 0);
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const seconds = Math.floor(normalizedSeconds % 60);

  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

function formatIndiaDate(date: Date) {
  return dateFormatter.format(date);
}

function formatIndiaWeekday(date: Date) {
  return weekdayFormatter.format(date);
}

function formatIndiaClock(date: Date) {
  return timeFormatter.format(date);
}

export function formatMissionDateParts(missionStartTime: string | null | undefined) {
  const missionStartMs = parseMissionStartTime(missionStartTime);
  if (missionStartMs === null) {
    return null;
  }

  const date = new Date(missionStartMs);
  return {
    date: formatIndiaDate(date),
    day: formatIndiaWeekday(date),
    time: `${formatIndiaClock(date)} ${INDIA_TIMEZONE_LABEL}`,
  };
}

export function formatMissionMoment(
  timeS: number | null | undefined,
  missionStartTime: string | null | undefined,
  options?: {
    compact?: boolean;
    timeOnly?: boolean;
  },
) {
  if (timeS === null || timeS === undefined || Number.isNaN(timeS)) {
    return "N/A";
  }

  const missionStartMs = parseMissionStartTime(missionStartTime);
  if (missionStartMs === null) {
    return "N/A";
  }

  const absoluteDate = new Date(missionStartMs + (timeS * 1000));
  const compact = options?.compact ?? false;
  const timeOnly = options?.timeOnly ?? false;
  const datePart = formatIndiaDate(absoluteDate);
  const dayPart = formatIndiaWeekday(absoluteDate);
  const timePart = `${formatIndiaClock(absoluteDate)} ${INDIA_TIMEZONE_LABEL}`;

  if (timeOnly) {
    return timePart;
  }

  if (compact) {
    return `${datePart} ${timePart}`;
  }

  return `${datePart} | ${dayPart} | ${timePart}`;
}

export function formatPlaybackTime(
  timeS: number | null | undefined,
  _maxTimeS: number | null | undefined,
  options?: {
    compact?: boolean;
    includeUnit?: boolean;
  },
) {
  if (timeS === null || timeS === undefined || Number.isNaN(timeS)) {
    return "N/A";
  }

  const compact = options?.compact ?? false;
  const includeUnit = options?.includeUnit ?? true;
  const parts = formatClockParts(timeS);
  const formatted = `${parts.hours}:${parts.minutes}:${parts.seconds}`;

  if (!includeUnit) {
    return formatted;
  }

  return compact ? formatted : formatted;
}
