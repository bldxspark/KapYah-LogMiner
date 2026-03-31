// File purpose: Shared helpers for formatting mission and playback time values.
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

function formatUtcClock(date: Date) {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function formatUtcDate(date: Date) {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatUtcWeekday(date: Date) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getUTCDay()];
}

export function formatMissionDateParts(missionStartTime: string | null | undefined) {
  const missionStartMs = parseMissionStartTime(missionStartTime);
  if (missionStartMs === null) {
    return null;
  }

  const date = new Date(missionStartMs);
  return {
    date: formatUtcDate(date),
    day: formatUtcWeekday(date),
    time: `${formatUtcClock(date)} UTC`,
  };
}

export function formatMissionMoment(
  timeS: number | null | undefined,
  missionStartTime: string | null | undefined,
  options?: {
    compact?: boolean;
  },
) {
  if (timeS === null || timeS === undefined || Number.isNaN(timeS)) {
    return "N/A";
  }

  const missionStartMs = parseMissionStartTime(missionStartTime);
  if (missionStartMs === null) {
    return "N/A";
  }

  const utcDate = new Date(missionStartMs + (timeS * 1000));
  const compact = options?.compact ?? false;
  const datePart = formatUtcDate(utcDate);
  const dayPart = formatUtcWeekday(utcDate);
  const timePart = formatUtcClock(utcDate);

  if (compact) {
    return `${datePart} ${timePart}`;
  }

  return `${datePart} | ${dayPart} | ${timePart} UTC`;
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
