// File purpose: Map review tab with playback controls, follow mode, and fullscreen actions.
import { useEffect, useRef, useState } from "react";
import CesiumGlobePanel from "../CesiumGlobePanel";
import PlaybackControls from "../PlaybackControls";
import { formatPlaybackTime } from "../../utils/timeFormat";
import type { MapAnalysis } from "../../types/analysis";

type MapTabProps = MapAnalysis & {
  currentIndex: number;
  currentTimeS: number | null;
  isPlaying: boolean;
  playbackSpeed: number;
  missionStartTime?: string | null;
  onPlayPause: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSeek: (index: number) => void;
  onSpeedChange: (speed: number) => void;
};

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

export default function MapTab({
  gpsStatus,
  satelliteCount,
  homeLocation,
  totalTrackPoints,
  routePoints,
  eventMarkers,
  currentIndex,
  currentTimeS,
  isPlaying,
  playbackSpeed,
  missionStartTime,
  onPlayPause,
  onStepBack,
  onStepForward,
  onSeek,
  onSpeedChange,
}: MapTabProps) {
  const workspaceRef = useRef<HTMLElement | null>(null);
  const [followDrone, setFollowDrone] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const maxTimeS = routePoints[routePoints.length - 1]?.timeS ?? Math.max(routePoints.length - 1, 0);
  const gpsDataAvailable = hasUsableGps(gpsStatus, homeLocation);

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    };

    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  async function handleToggleFullscreen() {
    const element = workspaceRef.current;
    if (!element) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await element.requestFullscreen();
  }

  const timeLabel = currentTimeS === null ? "No route point selected" : `Time ${formatPlaybackTime(currentTimeS, maxTimeS, { missionStartTime })}`;

  return (
    <section className="module-stack map-module-shell">
      <article
        ref={workspaceRef}
        className={`summary-card map-workspace-card map-workspace-immersive${isFullscreen ? " map-workspace-fullscreen" : ""}`}
      >
        {!isFullscreen ? (
          <>
            <div className="map-top-bar">
              <div className="map-top-meta">
                <p className="section-title">Map</p>
                <p className="map-panel-meta">
                  {gpsDataAvailable ? gpsStatus : "Data unavailable"} | {gpsDataAvailable ? `${satelliteCount ?? "N/A"} sats` : "Data unavailable"} | {totalTrackPoints} points | {gpsDataAvailable ? (homeLocation ?? "Data unavailable") : "Data unavailable"}
                </p>
              </div>
              <div className="map-top-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={handleToggleFullscreen}
                >
                  Fullscreen
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setFollowDrone(false);
                    setResetToken((value) => value + 1);
                  }}
                >
                  Reset View
                </button>
                <button
                  className={followDrone ? "primary-button" : "secondary-button"}
                  type="button"
                  onClick={() => setFollowDrone((value) => !value)}
                >
                  {followDrone ? "Following Drone" : "Follow Drone"}
                </button>
              </div>
            </div>
            <div className="map-bottom-bar map-bottom-bar-top">
              <div className="map-bottom-meta">
                <p className="map-panel-meta">
                  {isPlaying ? "Playing" : "Paused"} | {timeLabel}
                </p>
              </div>
              <PlaybackControls
                isPlaying={isPlaying}
                currentValue={currentTimeS ?? currentIndex}
                maxValue={maxTimeS}
                currentLabel={timeLabel}
                playbackSpeed={playbackSpeed}
                missionStartTime={missionStartTime}
                onPlayPause={onPlayPause}
                onStepBack={onStepBack}
                onStepForward={onStepForward}
                onSeek={onSeek}
                onSpeedChange={onSpeedChange}
              />
            </div>
            <div className="map-content-shell">
              <CesiumGlobePanel
                routePoints={routePoints}
                eventMarkers={eventMarkers}
                currentIndex={currentIndex}
                currentTimeS={currentTimeS}
                followDrone={followDrone}
                resetToken={resetToken}
              />
            </div>
          </>
        ) : (
          <div className="map-fullscreen-layout">
            <aside className="map-fullscreen-sidebar">
              <div className="map-fullscreen-block">
                <p className="section-title">Map</p>
                <p className="map-panel-meta">{gpsStatus ?? "GPS unavailable"}</p>
                <p className="map-panel-meta">{satelliteCount ?? "N/A"} sats</p>
                <p className="map-panel-meta">{totalTrackPoints} points</p>
                <p className="map-panel-meta">{homeLocation ?? "Home unavailable"}</p>
              </div>

              <div className="map-fullscreen-block">
                <p className="map-panel-meta">{isPlaying ? "Playing" : "Paused"}</p>
                <p className="map-panel-meta">{timeLabel}</p>
              </div>

              <div className="map-fullscreen-controls">
                <button className="secondary-button" type="button" onClick={onStepBack} disabled={(currentTimeS ?? currentIndex) <= 0}>
                  Back
                </button>
                <button className="primary-button" type="button" onClick={onPlayPause} disabled={maxTimeS <= 0}>
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button className="secondary-button" type="button" onClick={onStepForward} disabled={(currentTimeS ?? currentIndex) >= maxTimeS}>
                  Next
                </button>
                <select
                  className="playback-speed-select map-speed-select"
                  value={String(playbackSpeed)}
                  onChange={(event) => onSpeedChange(Number(event.target.value))}
                >
                  <option value="0.5">0.5x</option>
                  <option value="1">1x</option>
                  <option value="2">2x</option>
                  <option value="4">4x</option>
                </select>
                <button className="secondary-button" type="button" onClick={handleToggleFullscreen}>
                  Exit Fullscreen
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setFollowDrone(false);
                    setResetToken((value) => value + 1);
                  }}
                >
                  Reset View
                </button>
                <button
                  className={followDrone ? "primary-button" : "secondary-button"}
                  type="button"
                  onClick={() => setFollowDrone((value) => !value)}
                >
                  {followDrone ? "Following Drone" : "Follow Drone"}
                </button>
              </div>
            </aside>

            <div className="map-fullscreen-main">
              <div className="map-fullscreen-globe">
                <CesiumGlobePanel
                  routePoints={routePoints}
                  eventMarkers={eventMarkers}
                  currentIndex={currentIndex}
                  currentTimeS={currentTimeS}
                  followDrone={followDrone}
                  resetToken={resetToken}
                />
              </div>
              <div className="map-fullscreen-slider-bar">
                <PlaybackControls
                  isPlaying={isPlaying}
                  currentValue={currentTimeS ?? currentIndex}
                  maxValue={maxTimeS}
                  currentLabel={timeLabel}
                  playbackSpeed={playbackSpeed}
                  missionStartTime={missionStartTime}
                  onPlayPause={onPlayPause}
                  onStepBack={onStepBack}
                  onStepForward={onStepForward}
                  onSeek={onSeek}
                  onSpeedChange={onSpeedChange}
                  sliderOnly
                />
              </div>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
