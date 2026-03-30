// File purpose: Overview dashboard summarizing mission status, flight envelope, and key findings.
import MetricList from "../MetricList";
import type { SummaryOverview } from "../../types/analysis";

type OverviewDashboardProps = {
  isProcessing: boolean;
  airborneFlightTime?: string | null;
  averageSpeed?: string | null;
  envelopeMaxSpeed?: string | null;
} & SummaryOverview;

function cleanFlightMode(mode: string) {
  const rawValue = mode.trim();
  if (!rawValue) {
    return "";
  }

  const knownModes = [
    "Stabilize",
    "Acro",
    "Altitude Hold",
    "Auto",
    "Guided",
    "Loiter",
    "Return To Launch",
    "Circle",
    "Land",
    "Drift",
    "Sport",
    "Flip",
    "Auto Tune",
    "Position Hold",
    "Brake",
    "Throw",
    "Avoid ADS-B",
    "Guided No GPS",
    "Smart RTL",
    "Flow Hold",
    "Follow",
    "ZigZag",
    "System ID",
    "Autorotate",
    "Auto RTL",
  ];

  const parts = rawValue.split(/[|,]/).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const matchedPart = knownModes.find((knownMode) => part.toLowerCase() === knownMode.toLowerCase());
    if (matchedPart) {
      return matchedPart;
    }
  }

  const matchedMode = knownModes.find((knownMode) => rawValue.toLowerCase().includes(knownMode.toLowerCase()));
  return matchedMode ?? "";
}

function hasUsableGps(gpsStatus: string | null, homeLocation: string | null) {
  if (!gpsStatus) {
    return false;
  }

  const normalized = gpsStatus.trim().toLowerCase();
  if (normalized === "no gps" || normalized === "no fix" || normalized === "unavailable") {
    return false;
  }

  if (homeLocation && homeLocation.includes("0.000000 N, 0.000000 E")) {
    return false;
  }

  return true;
}

function gpsDisplayValue(value: string | number | null | undefined, gpsDataAvailable: boolean, fallback = "Data unavailable") {
  if (!gpsDataAvailable) {
    return fallback;
  }
  return value ?? fallback;
}

function buildPrimaryModes(flightModes: string[]) {
  const seen = new Set<string>();
  const uniqueModes: string[] = [];

  for (const mode of flightModes) {
    const cleaned = cleanFlightMode(mode);
    if (!cleaned) {
      continue;
    }

    const normalized = cleaned.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    uniqueModes.push(cleaned);
  }

  return uniqueModes;
}

function buildMissionAssessment(
  failsafeEvents: string[],
  errorMessages: string[],
  keyWarnings: string[],
  keyAnomalies: string[],
) {
  if (failsafeEvents.length || errorMessages.length) {
    return "Needs review";
  }
  if (keyWarnings.length || keyAnomalies.length) {
    return "Caution";
  }
  return "Normal";
}

function buildGpsConfidence(
  gpsDataAvailable: boolean,
  satelliteCount: number | null,
) {
  if (!gpsDataAvailable) {
    return "Unavailable";
  }
  if (typeof satelliteCount === "number" && satelliteCount >= 10) {
    return "Good";
  }
  if (typeof satelliteCount === "number" && satelliteCount >= 6) {
    return "Moderate";
  }
  return "Limited";
}

function buildReviewFocus(
  failsafeEvents: string[],
  errorMessages: string[],
  keyWarnings: string[],
  keyAnomalies: string[],
) {
  if (failsafeEvents.length) {
    return "Failsafe sequence";
  }
  if (errorMessages.length) {
    return "Critical errors";
  }
  if (keyWarnings.length) {
    return "Warning events";
  }
  if (keyAnomalies.length) {
    return "Anomaly review";
  }
  return "General mission review";
}

function buildDataCoverage(
  gpsDataAvailable: boolean,
  rcHealth: string | null,
  imuCount: string | null,
) {
  const coverage: string[] = [];
  if (gpsDataAvailable) {
    coverage.push("GPS");
  }
  if (rcHealth) {
    coverage.push("RC");
  }
  if (imuCount) {
    coverage.push("IMU");
  }
  return coverage.length ? coverage.join(" + ") : "Limited";
}

export default function OverviewDashboard({
  logName,
  isProcessing,
  airborneFlightTime,
  averageSpeed,
  envelopeMaxSpeed,
  vehicleType,
  totalFlightDuration,
  armDisarmTime,
  flightCount,
  flightModes,
  gpsStatus,
  satelliteCount,
  homeLocation,
  distanceTraveled,
  maxAltitude,
  maxSpeed,
  orientationSource,
  imuCount,
  proximitySensorCount,
  rcHealth,
  communicationStrength,
  signalStrength,
  failsafeEvents,
  errorMessages,
  keyWarnings,
  keyAnomalies,
}: OverviewDashboardProps) {
  const primaryModes = buildPrimaryModes(flightModes);
  const gpsDataAvailable = hasUsableGps(gpsStatus, homeLocation);
  const missionAssessment = buildMissionAssessment(failsafeEvents, errorMessages, keyWarnings, keyAnomalies);
  const gpsConfidence = buildGpsConfidence(gpsDataAvailable, satelliteCount);
  const reviewFocus = buildReviewFocus(failsafeEvents, errorMessages, keyWarnings, keyAnomalies);
  const dataCoverage = buildDataCoverage(gpsDataAvailable, rcHealth, imuCount);

  return (
    <section className="module-stack">
      <div className="placeholder-grid">
        <article className="summary-card">
          <p className="section-title">Mission Status</p>
          <h4>{isProcessing ? "Processing mission telemetry" : logName || "Loaded mission"}</h4>
          <MetricList
            items={[
              { label: "Vehicle Type", value: vehicleType ?? "Unknown" },
              { label: "Flight Duration", value: totalFlightDuration ?? "Unavailable" },
              { label: "Arm / Disarm", value: armDisarmTime ?? "Unavailable" },
              { label: "Mission Count", value: flightCount },
            ]}
          />
        </article>

        <article className="summary-card">
          <p className="section-title">Navigation</p>
          <h4>Route and positioning state</h4>
          <MetricList
            items={[
              { label: "GPS Status", value: gpsDisplayValue(gpsStatus, gpsDataAvailable) },
              { label: "Satellite Count", value: gpsDisplayValue(satelliteCount, gpsDataAvailable) },
              { label: "Distance Traveled", value: gpsDisplayValue(distanceTraveled, gpsDataAvailable) },
              { label: "Home Location Details", value: gpsDisplayValue(homeLocation, gpsDataAvailable) },
            ]}
          />
        </article>

        <article className="summary-card">
          <p className="section-title">Flight Envelope</p>
          <h4>Altitude, speed, and mode coverage</h4>
          <MetricList
            items={[
              { label: "Max Height Reached", value: maxAltitude ?? "Unavailable" },
              { label: "Max Speed", value: envelopeMaxSpeed ?? maxSpeed ?? "Unavailable" },
              { label: "Average Speed", value: averageSpeed ?? "Unavailable" },
              { label: "In-Air Time", value: airborneFlightTime ?? "Unavailable" },
              { label: "Mode Count", value: primaryModes.length },
              ...(primaryModes.length
                ? [{ label: "Primary Modes", value: primaryModes.join(", ") }]
                : []),
            ]}
          />
          {!primaryModes.length ? (
            <p className="overview-card-note">No flight modes were detected in this log.</p>
          ) : null}
        </article>

        <article className="summary-card">
          <p className="section-title">Telemetry</p>
          <h4>Orientation, sensors, and control link</h4>
          <MetricList
            items={[
              { label: "Orientation Source", value: orientationSource ?? "Unavailable" },
              { label: "IMU Count", value: imuCount ?? "Unavailable" },
              { label: "Proximity Sensors", value: proximitySensorCount ?? "Unavailable" },
              { label: "RC Health", value: rcHealth ?? "Unavailable" },
              { label: "Comm Strength", value: communicationStrength ?? "Unavailable" },
              { label: "RSSI", value: signalStrength ?? "Unavailable" },
            ]}
          />
        </article>

        <article className="summary-card">
          <p className="section-title">System Signals</p>
          <h4>Warnings, anomalies, and event health</h4>
          <MetricList
            items={[
              { label: "Failsafe Events", value: failsafeEvents.length },
              { label: "Error Messages", value: errorMessages.length },
              { label: "Warnings", value: keyWarnings.length },
              { label: "Anomalies", value: keyAnomalies.length },
            ]}
          />
        </article>

        <article className="summary-card">
          <p className="section-title">Key Facts</p>
          <h4>Mission snapshot</h4>
          <MetricList
            items={[
              { label: "Assessment", value: missionAssessment },
              { label: "GPS Confidence", value: gpsConfidence },
              { label: "Review Focus", value: reviewFocus },
              { label: "Data Coverage", value: dataCoverage },
            ]}
          />
        </article>
      </div>

      <article className="summary-card">
        <div className="chart-panel-header">
          <div>
            <p className="section-title">Command Summary</p>
            <h4>Primary mission findings</h4>
          </div>
        </div>
        <div className="overview-findings-grid">
          <div className="overview-finding-block">
            <h5>Warnings</h5>
            {keyWarnings.length ? (
              <ul className="finding-list">
                {keyWarnings.slice(0, 5).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p>No major warnings were surfaced in the loaded analysis.</p>
            )}
          </div>
          <div className="overview-finding-block">
            <h5>Anomalies</h5>
            {keyAnomalies.length ? (
              <ul className="finding-list">
                {keyAnomalies.slice(0, 5).map((anomaly) => (
                  <li key={anomaly}>{anomaly}</li>
                ))}
              </ul>
            ) : (
              <p>No major anomalies were surfaced in the loaded analysis.</p>
            )}
          </div>
          <div className="overview-finding-block">
            <h5>Error Messages</h5>
            {errorMessages.length ? (
              <ul className="finding-list">
                {errorMessages.slice(0, 5).map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : (
              <p>No critical error messages were detected in the current mission file.</p>
            )}
          </div>
        </div>
      </article>
    </section>
  );
}
