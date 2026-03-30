// File purpose: Main application page coordinating analysis, playback, reports, and tab content.
// KapYah LogMiner
// Maintained by Durgesh Tiwari, KapYah Industries Pvt. Ltd.
import { invoke } from "@tauri-apps/api/core";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import EmptyStatePanel from "../components/EmptyStatePanel";
import MessagesTab from "../components/tabs/MessagesTab";
import OverviewDashboard from "../components/tabs/OverviewDashboard";
import PowerTab from "../components/tabs/PowerTab";
import ReportsTab from "../components/tabs/ReportsTab";
import HelpSupportTab from "../components/tabs/HelpSupportTab";
import TimelineTab from "../components/tabs/TimelineTab";
import VibrationTab from "../components/tabs/VibrationTab";
import RcHealthTab from "../components/tabs/RcHealthTab";
import MapTab from "../components/tabs/MapTab";
import companyMark from "../assets/kapyah-company-mark-redico.png";
import companyMarkBlack from "../assets/kapyah-company-mark-black.jpeg";
import type { AnalysisData, SummaryOverview } from "../types/analysis";

type HomePageProps = {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  resetToken: number;
  onLoadedStateChange: (loaded: boolean) => void;
  theme: "dark" | "light";
  onThemeToggle: () => void;
};

const emptyOverview: SummaryOverview = {
  logName: "",
  dateTime: null,
  vehicleType: null,
  totalFlightDuration: null,
  armDisarmTime: null,
  flightCount: 0,
  flightModes: [],
  gpsStatus: null,
  satelliteCount: null,
  homeLocation: null,
  distanceTraveled: null,
  maxAltitude: null,
  maxSpeed: null,
  orientationSource: null,
  imuCount: null,
  proximitySensorCount: null,
  rcHealth: null,
  communicationStrength: null,
  signalStrength: null,
  failsafeEvents: [],
  errorMessages: [],
  keyWarnings: [],
  keyAnomalies: [],
};

type AnalyzerResponse = {
  ok: boolean;
  data?: AnalysisData;
  error?: string;
};

type ReportResponse = {
  ok: boolean;
  excelPath?: string;
  pdfPath?: string;
  error?: string;
};

type RecentReportEntry = {
  folderName: string;
  folderPath: string;
  excelPath: string;
  pdfPath: string;
  createdAt: string;
};

const RECENT_REPORTS_STORAGE_KEY = "kapyah-recent-reports";

type ReverseGeocodeResponse = {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

function parseCardinalLocation(location: string | null) {
  if (!location) {
    return null;
  }

  const match = location.match(/([\d.]+)\s*([NS])\s*,\s*([\d.]+)\s*([EW])/i);
  if (!match) {
    return null;
  }

  const lat = Number(match[1]) * (match[2].toUpperCase() === "S" ? -1 : 1);
  const lon = Number(match[3]) * (match[4].toUpperCase() === "W" ? -1 : 1);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  if (Math.abs(lat) < 0.000001 && Math.abs(lon) < 0.000001) {
    return null;
  }

  return { lat, lon };
}

function isPlaceholderLocationText(location: string | null | undefined) {
  if (!location) {
    return true;
  }

  return location.includes("0.000000 N, 0.000000 E");
}

function hasUsableGpsData(gpsStatus: string | null | undefined, homeLocation: string | null | undefined) {
  if (!gpsStatus) {
    return false;
  }

  const normalized = gpsStatus.trim().toLowerCase();
  if (normalized === "no gps" || normalized === "no fix" || normalized === "unavailable") {
    return false;
  }

  return !isPlaceholderLocationText(homeLocation);
}

function buildLocationLabel(placeName: string | null, coordinates: string | null) {
  if (placeName && coordinates) {
    return `${placeName} | ${coordinates}`;
  }
  return placeName ?? coordinates;
}

function findPlaybackIndex(
  routePoints: AnalysisData["map"]["routePoints"],
  playbackTimeS: number | null,
) {
  if (!routePoints.length || playbackTimeS === null) {
    return 0;
  }

  for (let index = routePoints.length - 1; index >= 0; index -= 1) {
    const timeS = routePoints[index]?.timeS;
    if (timeS !== null && timeS <= playbackTimeS) {
      return index;
    }
  }

  return 0;
}

function sanitizeFlightModeLabel(mode: string) {
  const cleaned = mode.trim();
  if (!cleaned) {
    return cleaned;
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

  const parts = cleaned.split(/[|,]/).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const matchedPart = knownModes.find((knownMode) => part.toLowerCase() === knownMode.toLowerCase());
    if (matchedPart) {
      return matchedPart;
    }
  }

  const matchedMode = knownModes.find((knownMode) => cleaned.toLowerCase().includes(knownMode.toLowerCase()));
  if (matchedMode) {
    return matchedMode;
  }

  for (const part of parts) {
    const strippedPart = part.replace(/^\d+[\s,:-]*/, "").trim();
    if (strippedPart && /[a-z]/i.test(strippedPart) && !/^\d+$/.test(strippedPart)) {
      return strippedPart;
    }
  }

  const strippedLeadingNumbers = cleaned.replace(/^\d+[\s,:-]*/, "").trim();
  if (strippedLeadingNumbers && /[a-z]/i.test(strippedLeadingNumbers) && !/^\d+$/.test(strippedLeadingNumbers)) {
    return strippedLeadingNumbers;
  }

  return /^[0-9,|\s.-]+$/.test(cleaned) ? "" : (/[a-z]/i.test(cleaned) ? cleaned : "");
}

function sortRoutePoints(routePoints: AnalysisData["map"]["routePoints"]) {
  return [...routePoints].sort(
    (left, right) => (left.timeS ?? 0) - (right.timeS ?? 0),
  );
}

function parseDurationToSeconds(duration: string | null | undefined) {
  if (!duration) {
    return null;
  }

  const normalized = duration.toLowerCase();
  let totalSeconds = 0;
  let matched = false;

  const hourMatch = normalized.match(/(\d+)\s*h/);
  if (hourMatch) {
    totalSeconds += Number(hourMatch[1]) * 3600;
    matched = true;
  }

  const minuteMatch = normalized.match(/(\d+)\s*(?:min|m)\b/);
  if (minuteMatch) {
    totalSeconds += Number(minuteMatch[1]) * 60;
    matched = true;
  }

  const secondMatch = normalized.match(/(\d+)\s*s\b/);
  if (secondMatch) {
    totalSeconds += Number(secondMatch[1]);
    matched = true;
  }

  return matched ? totalSeconds : null;
}

function getFolderPathFromReportPaths(excelPath: string, pdfPath: string) {
  const path = excelPath || pdfPath;
  return path.replace(/[\\/][^\\/]+$/, "");
}

function getFolderNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function padFolderPart(value: number) {
  return String(value).padStart(2, "0");
}

function buildDefaultReportFolderPath(downloadsPath: string) {
  const now = new Date();
  // Use a timestamp-based folder name so each export starts with a unique suggestion.
  const folderName = [
    "report",
    now.getFullYear(),
    padFolderPart(now.getMonth() + 1),
    padFolderPart(now.getDate()),
    padFolderPart(now.getHours()),
    padFolderPart(now.getMinutes()),
    padFolderPart(now.getSeconds()),
  ].join("_");

  return `${downloadsPath}/${folderName}`;
}

function loadRecentReports() {
  try {
    const raw = window.localStorage.getItem(RECENT_REPORTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as RecentReportEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentReports(entries: RecentReportEntry[]) {
  window.localStorage.setItem(RECENT_REPORTS_STORAGE_KEY, JSON.stringify(entries));
}

function formatDurationLabel(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  const roundedSeconds = Math.round(seconds);
  if (roundedSeconds < 300) {
    return `${roundedSeconds} s`;
  }

  const minutes = Math.floor(roundedSeconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours} h ${minutes % 60} min`;
  }
  return `${minutes} min`;
}

function getAirborneDurationLabel(routePoints: AnalysisData["map"]["routePoints"]) {
  // "In-Air Time" is derived from usable route points above a minimal altitude threshold.
  const airbornePoints = routePoints.filter(
    (point) => point.timeS !== null && (point.alt ?? 0) > 1,
  );

  if (airbornePoints.length < 2) {
    return "0 s";
  }

  const startTime = airbornePoints[0]?.timeS ?? null;
  const endTime = airbornePoints[airbornePoints.length - 1]?.timeS ?? null;
  if (startTime === null || endTime === null || endTime < startTime) {
    return "0 s";
  }

  return formatDurationLabel(endTime - startTime);
}

function getAirborneRoutePoints(routePoints: AnalysisData["map"]["routePoints"]) {
  return routePoints.filter(
    (point) => point.timeS !== null && (point.alt ?? 0) > 1,
  );
}

function getAverageSpeedLabel(routePoints: AnalysisData["map"]["routePoints"]) {
  const speedValues = getAirborneRoutePoints(routePoints)
    .map((point) => point.speed)
    .filter((speed): speed is number => speed !== null && Number.isFinite(speed));

  if (!speedValues.length) {
    return "0 m/s";
  }

  const averageSpeed = speedValues.reduce((total, speed) => total + speed, 0) / speedValues.length;
  return `${averageSpeed.toFixed(2)} m/s`;
}

function getAirborneMaxSpeedLabel(routePoints: AnalysisData["map"]["routePoints"], fallbackMaxSpeed: string | null | undefined) {
  const speedValues = getAirborneRoutePoints(routePoints)
    .map((point) => point.speed)
    .filter((speed): speed is number => speed !== null && Number.isFinite(speed));

  if (!speedValues.length) {
    return "0 m/s";
  }

  return fallbackMaxSpeed ?? `${Math.max(...speedValues).toFixed(2)} m/s`;
}

function getMaxEventTime(events: AnalysisData["timeline"]["events"]) {
  return events.reduce((maxTime, event) => Math.max(maxTime, event.timeS ?? 0), 0);
}

function getLastPowerSampleTime(samples: AnalysisData["power"]["samples"] | undefined) {
  return (samples ?? []).reduce((maxTime, sample) => Math.max(maxTime, sample.timeS ?? 0), 0);
}

function getLastVibrationSampleTime(samples: AnalysisData["vibration"]["samples"] | undefined) {
  return (samples ?? []).reduce((maxTime, sample) => Math.max(maxTime, sample.timeS ?? 0), 0);
}

function getLastRcSampleTime(samples: AnalysisData["rc"]["samples"] | undefined) {
  return (samples ?? []).reduce((maxTime, sample) => Math.max(maxTime, sample.timeS ?? 0), 0);
}

export default function HomePage({ activeTab, onSelectTab, resetToken, onLoadedStateChange, theme, onThemeToggle }: HomePageProps) {
  function openKapYahSite() {
    void invoke("open_external_url", { url: "https://kapyah.com/" });
  }
  const [selectedLogName, setSelectedLogName] = useState("");
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [exportTargetPath, setExportTargetPath] = useState<string | null>(null);
  const [reportPath, setReportPath] = useState<string | null>(null);
  const [pdfReportPath, setPdfReportPath] = useState<string | null>(null);
  const [recentReports, setRecentReports] = useState<RecentReportEntry[]>(() => loadRecentReports());
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [homePlaceName, setHomePlaceName] = useState<string | null>(null);
  const [playbackTimeS, setPlaybackTimeS] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackFrameRef = useRef<number | null>(null);
  const playbackLastFrameRef = useRef<number | null>(null);

  const routePoints = useMemo(
    () => sortRoutePoints(analysis?.map.routePoints ?? []),
    [analysis?.map.routePoints],
  );
  const routeStartTime = Math.max(routePoints[0]?.timeS ?? 0, 0);
  const routeEndTime = Math.max(routePoints[routePoints.length - 1]?.timeS ?? 0, routeStartTime);
  const playbackIndex = findPlaybackIndex(routePoints, playbackTimeS);
  const currentPlaybackPoint = routePoints[playbackIndex] ?? null;
  const currentTimeS = playbackTimeS ?? currentPlaybackPoint?.timeS ?? null;
  const airborneDurationLabel = getAirborneDurationLabel(routePoints);
  const averageSpeedLabel = getAverageSpeedLabel(routePoints);
  const airborneMaxSpeedLabel = getAirborneMaxSpeedLabel(routePoints, analysis?.overview.maxSpeed);
  const missionDurationS = Math.max(
    parseDurationToSeconds(analysis?.overview.totalFlightDuration) ?? 0,
    routeEndTime,
    analysis?.power.durationS ?? 0,
    analysis?.vibration.durationS ?? 0,
    analysis?.rc.durationS ?? 0,
    getLastPowerSampleTime(analysis?.power.samples),
    getLastVibrationSampleTime(analysis?.vibration.samples),
    getLastRcSampleTime(analysis?.rc.samples),
    getMaxEventTime(analysis?.timeline.events ?? []),
  );

  useEffect(() => {
    setPlaybackTimeS(Math.max(routePoints[0]?.timeS ?? 0, 0));
    setIsPlaying(false);
    setPlaybackSpeed(1);
  }, [analysis, activeTab, routePoints]);

  useEffect(() => {
    onLoadedStateChange(Boolean(selectedLogName));
  }, [onLoadedStateChange, selectedLogName]);

  useEffect(() => {
    let isMounted = true;

    async function loadDefaultExportFolder() {
      try {
        const downloadsPath = await invoke<string>("default_downloads_dir");
        if (isMounted) {
          setExportTargetPath(buildDefaultReportFolderPath(downloadsPath));
        }
      } catch {
        // Keep the existing fallback behavior if the path cannot be resolved.
      }
    }

    void loadDefaultExportFolder();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setSelectedLogName("");
    setSelectedFilePath("");
    setAnalysis(null);
    setIsProcessing(false);
    setIsReanalyzing(false);
    setIsGeneratingReport(false);
    setExportTargetPath(null);
    setReportPath(null);
    setPdfReportPath(null);
    setAnalysisError(null);
    setHomePlaceName(null);
    setPlaybackTimeS(null);
    setIsPlaying(false);
    setPlaybackSpeed(1);
  }, [resetToken]);

  useEffect(() => {
    const coordinates = parseCardinalLocation(analysis?.overview.homeLocation ?? null);
    if (!coordinates) {
      setHomePlaceName(null);
      return;
    }

    const controller = new AbortController();
    const { lat, lon } = coordinates;

    async function loadPlaceName() {
      try {
        // Reverse geocoding is optional enrichment for display only.
        const params = new URLSearchParams({
          format: "jsonv2",
          lat: String(lat),
          lon: String(lon),
          zoom: "10",
          addressdetails: "1",
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          setHomePlaceName(null);
          return;
        }

        const data = (await response.json()) as ReverseGeocodeResponse;
        const address = data.address;
        const placeName = [
          address?.city,
          address?.town,
          address?.village,
          address?.municipality,
          address?.county,
          address?.state,
          address?.country,
        ].filter(Boolean).slice(0, 3).join(", ");

        setHomePlaceName(placeName || data.display_name || null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setHomePlaceName(null);
      }
    }

    void loadPlaceName();

    return () => controller.abort();
  }, [analysis?.overview.homeLocation]);

  useEffect(() => {
    if (!isPlaying || routePoints.length <= 1 || playbackTimeS === null) {
      playbackLastFrameRef.current = null;
      return;
    }

    if (playbackTimeS >= routeEndTime) {
      setIsPlaying(false);
      playbackLastFrameRef.current = null;
      return;
    }

    const tick = (now: number) => {
      const previousFrame = playbackLastFrameRef.current ?? now;
      const elapsedSeconds = (now - previousFrame) / 1000;
      playbackLastFrameRef.current = now;

      setPlaybackTimeS((current) => {
        if (current === null) {
          return routeStartTime;
        }

        const next = Math.min(current + (elapsedSeconds * playbackSpeed), routeEndTime);
        if (next >= routeEndTime) {
          setIsPlaying(false);
          return routeEndTime;
        }
        return next;
      });

      playbackFrameRef.current = window.requestAnimationFrame(tick);
    };

    playbackFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (playbackFrameRef.current !== null) {
        window.cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
      }
      playbackLastFrameRef.current = null;
    };
  }, [isPlaying, playbackSpeed, playbackTimeS, routeEndTime, routeStartTime, routePoints.length]);

  async function analyzeSelectedLog(filePath: string, fileName: string, options?: { switchToOverview?: boolean; isReanalyze?: boolean }) {
    setSelectedFilePath(filePath);
    setSelectedLogName(fileName);
    if (options?.switchToOverview ?? true) {
      onSelectTab("Overview");
    }
    setAnalysis(null);
    setAnalysisError(null);
    setReportPath(null);
    setPdfReportPath(null);
    setPlaybackTimeS(0);
    setIsPlaying(false);
    setPlaybackSpeed(1);
    setIsProcessing(true);
    setIsReanalyzing(Boolean(options?.isReanalyze));

    try {
      const response = await invoke<AnalyzerResponse>("analyze_log", {
        filePath,
      });

      if (!response.ok || !response.data) {
        setAnalysis(null);
        setAnalysisError(response.error ?? "Analysis failed.");
        return;
      }

      // Drop placeholder GPS values so downstream tabs do not present misleading location data.
      const normalizedRoutePoints = sortRoutePoints(response.data.map.routePoints);
      const gpsDataAvailable = hasUsableGpsData(response.data.overview.gpsStatus, response.data.overview.homeLocation);
      const normalizedAnalysis: AnalysisData = {
        ...response.data,
        overview: {
          ...response.data.overview,
          flightModes: Array.from(new Set(response.data.overview.flightModes.map(sanitizeFlightModeLabel).filter(Boolean))),
          gpsStatus: gpsDataAvailable ? response.data.overview.gpsStatus : null,
          satelliteCount: gpsDataAvailable ? response.data.overview.satelliteCount : null,
          homeLocation: gpsDataAvailable ? response.data.overview.homeLocation : null,
          distanceTraveled: gpsDataAvailable ? response.data.overview.distanceTraveled : null,
        },
        map: {
          ...response.data.map,
          gpsStatus: gpsDataAvailable ? response.data.map.gpsStatus : null,
          satelliteCount: gpsDataAvailable ? response.data.map.satelliteCount : null,
          homeLocation: gpsDataAvailable ? response.data.map.homeLocation : null,
          routePoints: normalizedRoutePoints,
        },
      };

      setAnalysis(normalizedAnalysis);
      setSelectedLogName(normalizedAnalysis.overview.logName || fileName);
      setPlaybackTimeS(Math.max(normalizedRoutePoints[0]?.timeS ?? 0, 0));
    } catch (error) {
      setAnalysis(null);
      setAnalysisError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsProcessing(false);
      setIsReanalyzing(false);
    }
  }

  async function handleSelectLog() {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Flight Logs", extensions: ["bin", "tlog", "log", "ulg", "ulog"] },
      ],
    });

    if (typeof selected !== "string") {
      return;
    }

    const fileName = selected.split("\\").pop() ?? selected;
    await analyzeSelectedLog(selected, fileName, { switchToOverview: true, isReanalyze: false });
  }

  async function handleReanalyzeLog() {
    if (!selectedFilePath) {
      return;
    }

    const fileName = selectedFilePath.split("\\").pop() ?? selectedFilePath;
    await analyzeSelectedLog(selectedFilePath, fileName, { switchToOverview: false, isReanalyze: true });
  }

  async function handleSelectExportFolder() {
    let defaultPath = exportTargetPath ?? undefined;

    try {
      const downloadsPath = await invoke<string>("default_downloads_dir");
      defaultPath = buildDefaultReportFolderPath(downloadsPath);
      setExportTargetPath(defaultPath);
    } catch {
      // Keep the existing fallback behavior if the path cannot be resolved.
    }

    const selected = await save({
      defaultPath,
      title: "Choose Report Folder Name",
    });

    if (typeof selected !== "string") {
      return null;
    }

    setExportTargetPath(selected);
    setReportPath(null);
    setPdfReportPath(null);
    return selected;
  }

  async function handleGenerateReport() {
    if (!selectedFilePath) {
      return;
    }

    const selectedOutputPath = await handleSelectExportFolder();
    if (!selectedOutputPath) {
      return;
    }

    setIsGeneratingReport(true);
    setAnalysisError(null);

    try {
      const response = await invoke<ReportResponse>("generate_report", {
        filePath: selectedFilePath,
        outputDir: selectedOutputPath,
      });

      if (!response.ok || !response.excelPath || !response.pdfPath) {
        setAnalysisError(response.error ?? "Report generation failed.");
        return;
      }

      setReportPath(response.excelPath);
      setPdfReportPath(response.pdfPath);
      const folderPath = getFolderPathFromReportPaths(response.excelPath, response.pdfPath);
      const newEntry: RecentReportEntry = {
        folderName: getFolderNameFromPath(folderPath),
        folderPath,
        excelPath: response.excelPath,
        pdfPath: response.pdfPath,
        createdAt: new Date().toISOString(),
      };
      setRecentReports((current) => {
        const next = [
          newEntry,
          ...current.filter((entry) => entry.folderPath !== folderPath),
        ].slice(0, 12);
        saveRecentReports(next);
        return next;
      });
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGeneratingReport(false);
    }
  }

  async function handleOpenReportPath(path: string) {
    try {
      await invoke("open_path_in_system", { path });
    } catch {
      await message("The selected report file or folder was moved, deleted, or is no longer available.", {
        title: "Report Not Available",
        kind: "warning",
      });
    }
  }

  async function handleDeleteRecentReport(folderPath: string) {
    try {
      await invoke("delete_report_folder", { folderPath });
      setRecentReports((current) => {
        const next = current.filter((entry) => entry.folderPath !== folderPath);
        saveRecentReports(next);
        return next;
      });
      if (reportPath && getFolderPathFromReportPaths(reportPath, pdfReportPath ?? "") === folderPath) {
        setReportPath(null);
        setPdfReportPath(null);
      }
    } catch {
      await message("The selected report folder was moved, deleted, or is no longer available.", {
        title: "Report Not Available",
        kind: "warning",
      });
    }
  }


  function handlePlayPause() {
    if (routePoints.length <= 1) {
      return;
    }
    if ((playbackTimeS ?? routeStartTime) >= routeEndTime) {
      setPlaybackTimeS(routeStartTime);
    }
    setIsPlaying((value) => !value);
  }

  function handleStepBack() {
    setIsPlaying(false);
    const previousIndex = Math.max(playbackIndex - 1, 0);
    setPlaybackTimeS(Math.max(routePoints[previousIndex]?.timeS ?? routeStartTime, 0));
  }

  function handleStepForward() {
    setIsPlaying(false);
    const nextIndex = Math.min(playbackIndex + 1, Math.max(routePoints.length - 1, 0));
    setPlaybackTimeS(Math.max(routePoints[nextIndex]?.timeS ?? routeEndTime, 0));
  }

  function handleSeek(value: number) {
    setIsPlaying(false);
    setPlaybackTimeS(Math.max(Math.min(value, routeEndTime), routeStartTime, 0));
  }

  const overview = analysis?.overview ?? { ...emptyOverview, logName: selectedLogName };
  const displayHomeLocation = buildLocationLabel(homePlaceName, overview.homeLocation);

  const moduleContent = analysis
    ? {
        Overview: (
          <OverviewDashboard
            isProcessing={isProcessing}
            {...analysis.overview}
            homeLocation={displayHomeLocation}
            airborneFlightTime={airborneDurationLabel}
            averageSpeed={averageSpeedLabel}
            envelopeMaxSpeed={airborneMaxSpeedLabel}
          />
        ),
        Timeline: <TimelineTab {...analysis.timeline} missionDurationS={missionDurationS} missionStartTime={analysis.overview.dateTime} />,
        Power: <PowerTab {...analysis.power} missionDurationS={missionDurationS} missionStartTime={analysis.overview.dateTime} />,
        Vibration: <VibrationTab {...analysis.vibration} missionDurationS={missionDurationS} missionStartTime={analysis.overview.dateTime} />,
        "RC Info": <RcHealthTab {...analysis.rc} missionDurationS={missionDurationS} missionStartTime={analysis.overview.dateTime} />,
        Map: (
          <MapTab
            {...analysis.map}
            homeLocation={displayHomeLocation}
            currentIndex={playbackIndex}
            currentTimeS={currentTimeS}
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            missionStartTime={analysis.overview.dateTime}
            onPlayPause={handlePlayPause}
            onStepBack={handleStepBack}
            onStepForward={handleStepForward}
            onSeek={handleSeek}
            onSpeedChange={setPlaybackSpeed}
          />
        ),
        Messages: <MessagesTab {...analysis.messages} missionStartTime={analysis.overview.dateTime} />,
        Reports: (
          <ReportsTab
            {...analysis.reports}
            exportFolder={exportTargetPath}
            isGeneratingReport={isGeneratingReport}
            reportPath={reportPath}
            pdfReportPath={pdfReportPath}
            recentReports={recentReports}
            onGenerateReport={handleGenerateReport}
            onSelectExportFolder={handleSelectExportFolder}
            onOpenReportPath={handleOpenReportPath}
            onDeleteRecentReport={handleDeleteRecentReport}
          />
        ),
        "Help & Support": <HelpSupportTab />,
      }
    : null;

  return (
    <main className="main-panel">
        {!selectedLogName ? (
          <section className="workspace-panel empty-workspace-shell">
            <div className="empty-brand-wrap">
              <div className="empty-brand-header">
                <div className="empty-brand-logo-column">
                  <button className="empty-brand-mark-button" type="button" onClick={openKapYahSite} title="Open KapYah website">
                    <img className="empty-brand-mark" src={companyMark} alt="KapYah Industries logo" />
                  </button>
                  <button
                    className={`theme-toggle empty-home-theme-toggle ${theme === "light" ? "is-light" : ""}`}
                    type="button"
                    onClick={onThemeToggle}
                    aria-label={`Switch to ${theme === "dark" ? "day" : "dark"} mode`}
                    title={theme === "dark" ? "Switch to day mode" : "Switch to dark mode"}
                  >
                    <span className="theme-toggle-track">
                      <span className="theme-toggle-thumb">
                        <img src={theme === "light" ? companyMarkBlack : companyMark} alt="" />
                      </span>
                    </span>
                  </button>
                </div>
                <div className="empty-brand-copy">
                  <div className="empty-title-stack">
                    <p className="empty-product-name">KapYah</p>
                    <p className="empty-product-subname">LogMiner</p>
                  </div>
                  <p className="empty-company-line">by KapYah Industries Pvt. Ltd.</p>
                  <p className="empty-company-tagline">An Emersion of Thoughts</p>
                </div>
              </div>
            </div>

          <div className="empty-mission-copy">
            <p className="section-title">Mission Intelligence Workspace</p>
            <h2>Flight log review for mission insight and reporting.</h2>
            <p>
              Load one mission log to begin route review, synchronized timeline analysis,
              power and vibration inspection, message investigation, and full report generation.
            </p>
            <div className="empty-actions">
              <button className="primary-button" type="button" onClick={handleSelectLog} disabled={isProcessing}>
                {isProcessing ? "Processing..." : "Select Flight Log"}
              </button>
              <p className="empty-support-text">Supports .bin, .tlog, .log, .ulg, and .ulog logs.</p>
            </div>
            {analysisError ? <p className="inline-error">{analysisError}</p> : null}
          </div>
        </section>
      ) : (
        <>
          {activeTab !== "Help & Support" ? (
            <section className="workspace-panel mission-header-panel">
              <div className="mission-header-copy">
                <p className="section-title">Loaded Mission</p>
                <h2>{overview.logName}</h2>
                <p className="workspace-copy">
                  {overview.vehicleType ?? "Vehicle"} | {overview.totalFlightDuration ?? "Duration unavailable"} | {overview.gpsStatus ?? "GPS status unavailable"}
                </p>
                <div className="mission-stat-pills">
                  <span className="mission-pill">{overview.flightModes.length} modes</span>
                  <span className="mission-pill">{analysis?.timeline.totalEvents ?? 0} events</span>
                  <span className="mission-pill">{analysis?.map.totalTrackPoints ?? 0} track points</span>
                </div>
                {analysisError ? <p className="inline-error">{analysisError}</p> : null}
                {reportPath ? <p className="selected-log-name">Report saved to folder {reportPath.replace(/[\/][^\/]+$/, "")}</p> : null}
              </div>
              <div className="mission-header-actions">
                {selectedFilePath && analysis ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={handleReanalyzeLog}
                    disabled={isProcessing || isGeneratingReport}
                  >
                    {isReanalyzing ? "Reanalyzing..." : "Reanalyze Log"}
                  </button>
                ) : null}
                <button
                  className="secondary-button"
                  type="button"
                  onClick={handleSelectLog}
                  disabled={isProcessing || isGeneratingReport}
                >
                  Choose Another Log
                </button>
              </div>
            </section>
          ) : null}

          {isProcessing ? (
            <section className="workspace-panel module-panel">
              <EmptyStatePanel
                title="Analyzing selected mission log"
                description="Telemetry, route, timeline, power, and diagnostic signals are being prepared for review."
              />
            </section>
          ) : null}

          {!isProcessing && analysis && moduleContent ? (
            <section className="workspace-panel module-panel">
              {activeTab !== "Help & Support" ? (
                <div className="module-panel-header">
                  <div>
                    <p className="section-title">{activeTab}</p>
                    <h3>{activeTab === "Overview" ? "Mission command overview" : `${activeTab} analysis`}</h3>
                  </div>
                </div>
              ) : null}
              {moduleContent[activeTab as keyof typeof moduleContent]}
            </section>
          ) : null}

          {!isProcessing && !analysis ? (
            <section className="workspace-panel module-panel">
              <EmptyStatePanel
                title="Mission analysis unavailable"
                description="The selected file could not be analyzed. Load another flight log to continue."
              />
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}








