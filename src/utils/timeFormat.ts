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

function formatUtcClock(date: Date, compact: boolean) {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  if (compact) {
    return `${hours}:${minutes}:${seconds}`;
  }

  return `${hours}:${minutes}:${seconds} UTC`;
}

export function formatPlaybackTime(
  timeS: number | null | undefined,
  maxTimeS: number | null | undefined,
  options?: {
    compact?: boolean;
    includeUnit?: boolean;
    missionStartTime?: string | null;
  },
) {
  if (timeS === null || timeS === undefined || Number.isNaN(timeS)) {
    return "N/A";
  }

  const compact = options?.compact ?? false;
  const includeUnit = options?.includeUnit ?? true;
  const missionStartMs = parseMissionStartTime(options?.missionStartTime);

  if (missionStartMs !== null) {
    const utcDate = new Date(missionStartMs + (timeS * 1000));
    const formatted = formatUtcClock(utcDate, compact);
    if (!includeUnit) {
      return formatted.replace(" UTC", "");
    }
    return formatted;
  }

  if (shouldUseMinuteTime(maxTimeS)) {
    const minutes = timeS / 60;
    if (!includeUnit) {
      return minutes.toFixed(1);
    }
    return compact ? `${minutes.toFixed(1)}m` : `${minutes.toFixed(1)} min`;
  }

  if (!includeUnit) {
    return timeS.toFixed(1);
  }
  return compact ? `${timeS.toFixed(1)}s` : `${timeS.toFixed(1)} s`;
}
