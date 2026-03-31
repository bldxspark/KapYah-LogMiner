// File purpose: Shared playback controls for mission timeline and map scrubbing.
import { formatPlaybackTime } from "../utils/timeFormat";

type PlaybackControlsProps = {
  isPlaying: boolean;
  currentValue: number;
  maxValue: number;
  currentLabel: string;
  playbackSpeed: number;
  missionStartTime?: string | null;
  onPlayPause: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSeek: (value: number) => void;
  onSpeedChange: (speed: number) => void;
  sliderOnly?: boolean;
};

export default function PlaybackControls({
  isPlaying,
  currentValue,
  maxValue,
  currentLabel,
  playbackSpeed,
  missionStartTime,
  onPlayPause,
  onStepBack,
  onStepForward,
  onSeek,
  onSpeedChange,
  sliderOnly = false,
}: PlaybackControlsProps) {
  if (sliderOnly) {
    return (
      <div className="playback-bar playback-bar-slider-only">
        <div className="playback-slider-wrap">
          <div className="playback-scale">
            <span>{formatPlaybackTime(0, maxValue, { compact: true })}</span>
            <span>{formatPlaybackTime(maxValue, maxValue, { compact: true })}</span>
          </div>
          <input
            className="playback-slider"
            type="range"
            min={0}
            max={Math.max(maxValue, 0)}
            step="0.1"
            value={Math.min(currentValue, Math.max(maxValue, 0))}
            onChange={(event) => onSeek(Number(event.target.value))}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="playback-bar">
      <div className="playback-actions">
        <button className="secondary-button" type="button" onClick={onStepBack} disabled={currentValue <= 0}>
          Back
        </button>
        <button className="primary-button" type="button" onClick={onPlayPause} disabled={maxValue <= 0}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button className="secondary-button" type="button" onClick={onStepForward} disabled={currentValue >= maxValue}>
          Next
        </button>
        <select
          className="playback-speed-select"
          value={String(playbackSpeed)}
          onChange={(event) => onSpeedChange(Number(event.target.value))}
        >
          <option value="0.5">0.5x</option>
          <option value="1">1x</option>
          <option value="2">2x</option>
          <option value="4">4x</option>
        </select>
      </div>
      <div className="playback-slider-wrap">
        <div className="playback-scale">
          <span>{formatPlaybackTime(0, maxValue, { compact: true })}</span>
          <span>{formatPlaybackTime(maxValue, maxValue, { compact: true })}</span>
        </div>
        <input
          className="playback-slider"
          type="range"
          min={0}
          max={Math.max(maxValue, 0)}
          step="0.1"
          value={Math.min(currentValue, Math.max(maxValue, 0))}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
      </div>
      <p className="playback-label">{currentLabel}</p>
    </div>
  );
}
