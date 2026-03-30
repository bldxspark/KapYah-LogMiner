// File purpose: RC health tab showing link quality, RSSI, and RC channel trends.
import LineChartPanel from "../LineChartPanel";
import MetricList from "../MetricList";
import type { RcAnalysis, RcChannelKey } from "../../types/analysis";

type RcHealthTabProps = RcAnalysis & {
  missionDurationS?: number | null;
  missionStartTime?: string | null;
};

function formatPercentValue(value: number | null) {
  return value === null ? "N/A" : `${value.toFixed(0)} %`;
}

function formatChannelValue(value: number | null) {
  return value === null ? "N/A" : `${value.toFixed(0)} us`;
}

const RC_CHANNEL_COLORS = [
  "#ff4a4a",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#14b8a6",
  "#0f8bff",
  "#6366f1",
  "#ec4899",
  "#8b5cf6",
  "#22c55e",
  "#eab308",
  "#06b6d4",
  "#ef4444",
  "#a855f7",
  "#f97316",
  "#10b981",
];

export default function RcHealthTab({
  averageLinkQuality,
  averageRssi,
  peakLinkQuality,
  peakRssi,
  rcHealth,
  activeChannelCount,
  channelAverages,
  durationS,
  missionDurationS,
  missionStartTime,
  samples,
  channelSamples,
}: RcHealthTabProps) {
  const chartSamples = samples;
  const channelChartSamples = channelSamples;
  const activeChannelAverages = channelAverages.filter((channel) => channel.average !== null);
  const channelSeries = activeChannelAverages.map((channel, index) => ({
    key: channel.key,
    label: channel.label,
    color: RC_CHANNEL_COLORS[index % RC_CHANNEL_COLORS.length],
    unit: "us",
    points: channelChartSamples.map((sample) => ({
      x: sample.timeS ?? 0,
      y: sample[channel.key as RcChannelKey] ?? null,
    })),
  }));
  const maxTimeS = Math.max(
    durationS ?? 0,
    missionDurationS ?? 0,
    chartSamples[chartSamples.length - 1]?.timeS ?? 0,
    channelChartSamples[channelChartSamples.length - 1]?.timeS ?? 0,
  );

  return (
    <section className="module-stack">
      <article className="summary-card">
        <p className="section-title">RC Health</p>
        <h4>Control link and signal review</h4>
        <MetricList
          items={[
            { label: "RC Health", value: rcHealth ?? "Unavailable" },
            { label: "Average Link Quality", value: formatPercentValue(averageLinkQuality) },
            { label: "Average RSSI", value: formatPercentValue(averageRssi) },
            { label: "Peak Link Quality", value: formatPercentValue(peakLinkQuality) },
            { label: "Peak RSSI", value: formatPercentValue(peakRssi) },
            { label: "Sample Count", value: chartSamples.length },
          ]}
        />
      </article>

      <LineChartPanel
        title="RC Health Trend"
        subtitle="Link quality and RSSI profile"
        maxTimeS={maxTimeS ?? 0}
        yAxisLabel="%"
        missionStartTime={missionStartTime}
        series={[
          {
            key: "linkQuality",
            label: "Link Quality",
            color: "#ff4a4a",
            unit: "%",
            points: chartSamples.map((sample) => ({ x: sample.timeS ?? 0, y: sample.linkQualityPercent })),
          },
          {
            key: "rssi",
            label: "RSSI",
            color: "#0f8bff",
            unit: "%",
            points: chartSamples.map((sample) => ({ x: sample.timeS ?? 0, y: sample.rssiPercent })),
          },
        ]}
      />

      <LineChartPanel
        title="RC Channel Trend"
        subtitle="Channel profile across the mission"
        maxTimeS={maxTimeS ?? 0}
        yAxisLabel="us"
        missionStartTime={missionStartTime}
        series={channelSeries}
      />

      <article className="summary-card">
        <p className="section-title">RC Channels</p>
        <h4>Channel input review</h4>
        <MetricList
          items={[
            { label: "Active Channels", value: activeChannelCount },
            ...activeChannelAverages.map((channel) => ({
              label: `${channel.label} Avg`,
              value: formatChannelValue(channel.average),
            })),
          ]}
        />
      </article>
    </section>
  );
}
