// File purpose: Power telemetry tab for voltage, current, and related mission trends.
import LineChartPanel from "../LineChartPanel";
import MetricList from "../MetricList";
import type { PowerAnalysis } from "../../types/analysis";

type PowerTabProps = PowerAnalysis & {
  missionDurationS?: number | null;
  missionStartTime?: string | null;
};

function formatUnitValue(value: number | null, unit: string) {
  return value === null ? "N/A" : `${value.toFixed(2)} ${unit}`;
}

export default function PowerTab({
  startingVoltage,
  endingVoltage,
  minimumVoltage,
  maximumCurrent,
  averageCurrent,
  powerHealth,
  durationS,
  missionDurationS,
  missionStartTime,
  samples,
}: PowerTabProps) {
  const chartSamples = samples;
  const maxTimeS = Math.max(durationS ?? 0, missionDurationS ?? 0, chartSamples[chartSamples.length - 1]?.timeS ?? 0);

  return (
    <section className="module-stack">
      <article className="summary-card">
        <p className="section-title">Power</p>
        <h4>Battery and current review</h4>
        <MetricList
          items={[
            { label: "Starting Voltage", value: formatUnitValue(startingVoltage, "V") },
            { label: "Ending Voltage", value: formatUnitValue(endingVoltage, "V") },
            { label: "Minimum Voltage", value: formatUnitValue(minimumVoltage, "V") },
            { label: "Maximum Current", value: formatUnitValue(maximumCurrent, "A") },
            { label: "Average Current", value: formatUnitValue(averageCurrent, "A") },
            { label: "Power Health", value: powerHealth },
          ]}
        />
      </article>

      <LineChartPanel
        title="Power Trend"
        subtitle="Voltage and current profile"
        maxTimeS={maxTimeS ?? 0}
        yAxisLabel="V / A"
        missionStartTime={missionStartTime}
        series={[
          {
            key: "voltage",
            label: "Voltage",
            color: "#ff4a4a",
            unit: "V",
            yAxisId: "left",
            points: chartSamples.map((sample) => ({ x: sample.timeS ?? 0, y: sample.voltage })),
          },
          {
            key: "current",
            label: "Current",
            color: "#1f6fff",
            unit: "A",
            yAxisId: "right",
            points: chartSamples.map((sample) => ({ x: sample.timeS ?? 0, y: sample.current })),
          },
        ]}
      />
    </section>
  );
}
