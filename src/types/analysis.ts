// File purpose: Shared TypeScript types describing analyzer and UI data structures.
export type LogStatus = "idle" | "processing" | "ready" | "error";
export type EventSeverity = "info" | "warning" | "error";
export type TimelineCategory = "mode" | "warning" | "error" | "system" | "event";

export type SummaryOverview = {
  logName: string;
  dateTime: string | null;
  vehicleType: string | null;
  totalFlightDuration: string | null;
  armDisarmTime: string | null;
  flightCount: number;
  flightModes: string[];
  gpsStatus: string | null;
  satelliteCount: number | null;
  homeLocation: string | null;
  distanceTraveled: string | null;
  maxAltitude: string | null;
  maxSpeed: string | null;
  orientationSource: string | null;
  imuCount: string | null;
  proximitySensorCount: number | null;
  rcHealth: string | null;
  communicationStrength: string | null;
  signalStrength: string | null;
  failsafeEvents: string[];
  errorMessages: string[];
  keyWarnings: string[];
  keyAnomalies: string[];
};

export type TimelineEvent = {
  timeS: number | null;
  label: string;
  detail: string;
  category: TimelineCategory;
  severity: EventSeverity;
};

export type TimelineSignalSample = {
  timeS: number | null;
  headingDeg: number | null;
  rssiPercent: number | null;
  linkQualityPercent: number | null;
  satellites: number | null;
  proximityM: number | null;
};

export type TimelineAnalysis = {
  totalEvents: number;
  highlightedEvents: TimelineEvent[];
  modeTransitions: TimelineEvent[];
  warningEvents: TimelineEvent[];
  events: TimelineEvent[];
  signalSamples: TimelineSignalSample[];
};

export type VibrationSample = {
  timeS: number | null;
  x: number | null;
  y: number | null;
  z: number | null;
};

export type VibrationAnalysis = {
  averageX: number | null;
  averageY: number | null;
  averageZ: number | null;
  maxX: number | null;
  maxY: number | null;
  maxZ: number | null;
  dominantAxis: "X" | "Y" | "Z" | null;
  severity: "Nominal" | "Monitor" | "High";
  durationS: number | null;
  samples: VibrationSample[];
};

export type PowerSample = {
  timeS: number | null;
  voltage: number | null;
  current: number | null;
};

export type PowerAnalysis = {
  startingVoltage: number | null;
  endingVoltage: number | null;
  minimumVoltage: number | null;
  maximumCurrent: number | null;
  averageCurrent: number | null;
  powerHealth: "Nominal" | "Monitor" | "High Draw";
  durationS: number | null;
  samples: PowerSample[];
};

export type RcSample = {
  timeS: number | null;
  linkQualityPercent: number | null;
  rssiPercent: number | null;
};

export type RcChannelKey = `rc${number}`;

export type RcChannelSample = {
  timeS: number | null;
} & Partial<Record<RcChannelKey, number | null>>;

export type RcChannelAverage = {
  key: RcChannelKey;
  label: string;
  average: number | null;
};

export type RcAnalysis = {
  averageLinkQuality: number | null;
  averageRssi: number | null;
  peakLinkQuality: number | null;
  peakRssi: number | null;
  rcHealth: string | null;
  activeChannelCount: number;
  channelAverages: RcChannelAverage[];
  durationS: number | null;
  samples: RcSample[];
  channelSamples: RcChannelSample[];
};

export type RoutePoint = {
  timeS: number | null;
  lat: number;
  lon: number;
  alt: number | null;
  speed: number | null;
  satellites: number | null;
  gpsStatus: string | null;
};

export type MapAnalysis = {
  gpsStatus: string | null;
  satelliteCount: number | null;
  homeLocation: string | null;
  totalTrackPoints: number;
  routePoints: RoutePoint[];
  highlightedRoute: RoutePoint[];
  eventMarkers: TimelineEvent[];
};

export type MessageRecord = {
  timeS: number | null;
  type: string;
  severity: EventSeverity;
  text: string;
};

export type MessageSummary = {
  errorCount: number;
  warningCount: number;
  infoCount: number;
  lastEvent: string | null;
  rawMessages: MessageRecord[];
};

export type ReportSummary = {
  format: string;
  availableSheets: string[];
  isReady: boolean;
};

export type AnalysisData = {
  status: LogStatus;
  sourceFilePath: string | null;
  overview: SummaryOverview;
  timeline: TimelineAnalysis;
  vibration: VibrationAnalysis;
  power: PowerAnalysis;
  rc: RcAnalysis;
  map: MapAnalysis;
  messages: MessageSummary;
  reports: ReportSummary;
};
