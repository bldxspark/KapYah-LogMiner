// File purpose: Vibration telemetry tab for mission vibration trends and severity review.
import LineChartPanel from "../LineChartPanel";
import MetricList from "../MetricList";
import type { VibrationAnalysis } from "../../types/analysis";

type VibrationTabProps = VibrationAnalysis & {
  missionDurationS?: number | null;
  missionStartTime?: string | null;
};

function vibrationUnit() {
  return (
    <>
      m/s<sup>2</sup>
    </>
  );
}

function formatUnitValue(value: number | null) {
  return value === null ? "N/A" : <>{value.toFixed(2)} {vibrationUnit()}</>;
}

export default function VibrationTab({
  averageX,
  averageY,
  averageZ,
  maxX,
  maxY,
  maxZ,
  dominantAxis,
  severity,
  durationS,
  missionDurationS,
  missionStartTime,
  samples,
}: VibrationTabProps) {
  const maxTimeS = Math.max(durationS ?? 0, missionDurationS ?? 0, samples[samples.length - 1]?.timeS ?? 0);
  const lastSampleTimeS = samples[samples.length - 1]?.timeS ?? null;
  const chartSamples =
    lastSampleTimeS !== null && maxTimeS > lastSampleTimeS
      ? (() => {
          const lastSample = samples[samples.length - 1];
          const extensionStepS = Math.max(30, Math.round((maxTimeS - lastSampleTimeS) / 120) || 30);
          const extension = [];

          for (let timeS = lastSampleTimeS + extensionStepS; timeS < maxTimeS; timeS += extensionStepS) {
            extension.push({
              timeS,
              x: lastSample?.x ?? null,
              y: lastSample?.y ?? null,
              z: lastSample?.z ?? null,
            });
          }

          extension.push({
            timeS: maxTimeS,
            x: lastSample?.x ?? null,
            y: lastSample?.y ?? null,
            z: lastSample?.z ?? null,
          });

          return [...samples, ...extension];
        })()
      : samples;

  return (
    <section className="module-stack">
      <article className="summary-card">
        <p className="section-title">Vibration</p>
        <h4>Airframe vibration review</h4>
        <MetricList
          items={[
            { label: "Average X", value: formatUnitValue(averageX) },
            { label: "Average Y", value: formatUnitValue(averageY) },
            { label: "Average Z", value: formatUnitValue(averageZ) },
            { label: "Max X", value: formatUnitValue(maxX) },
            { label: "Max Y", value: formatUnitValue(maxY) },
            { label: "Max Z", value: formatUnitValue(maxZ) },
            { label: "Dominant Axis", value: dominantAxis ?? "N/A" },
            { label: "Severity", value: severity },
          ]}
        />
      </article>

      <LineChartPanel
        title="Vibration Trend"
        subtitle="Axis vibration profile"
        maxTimeS={maxTimeS ?? 0}
        yAxisLabel={vibrationUnit()}
        missionStartTime={missionStartTime}
        series={[
          {
            key: "x",
            label: "Axis X",
            color: "#ff4a4a",
            unit: "m/s^2",
            points: chartSamples.map((sample) => ({ x: sample.timeS ?? 0, y: sample.x })),
          },
          {
            key: "y",
            label: "Axis Y",
            color: "#f59e0b",
            unit: "m/s^2",
            points: chartSamples.map((sample) => ({ x: sample.timeS ?? 0, y: sample.y })),
          },
          {
            key: "z",
            label: "Axis Z",
            color: "#0f8bff",
            unit: "m/s^2",
            points: chartSamples.map((sample) => ({ x: sample.timeS ?? 0, y: sample.z })),
          },
        ]}
      />
    </section>
  );
}
