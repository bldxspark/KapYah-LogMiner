// File purpose: Shared chart wrapper used by telemetry trend sections.
import type { ReactNode, WheelEvent } from "react";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPlaybackTime } from "../utils/timeFormat";

type SeriesPoint = {
  x: number;
  y: number | null;
};

type ChartSeries = {
  key: string;
  label: string;
  color: string;
  unit?: string;
  points: SeriesPoint[];
  yAxisId?: "left" | "right";
};

type LineChartPanelProps = {
  title: string;
  subtitle: string;
  series: ChartSeries[];
  maxTimeS?: number;
  yAxisLabel?: ReactNode;
  missionStartTime?: string | null;
};

type ChartRange = {
  start: number;
  end: number;
};

const NORMAL_MAX_POINTS = 1200;
const FULLSCREEN_MAX_POINTS = 2400;

function formatValue(value: number | string) {
  return typeof value === "number" ? value.toFixed(2) : value;
}

function clampRange(start: number, end: number, maxTimeS: number): ChartRange {
  const total = Math.max(maxTimeS, 0);
  const nextStart = Math.max(Math.min(start, total), 0);
  const nextEnd = Math.max(Math.min(end, total), 0);
  if (total <= 0) {
    return { start: 0, end: 0 };
  }
  if (nextEnd <= nextStart) {
    return { start: 0, end: total };
  }
  return { start: nextStart, end: nextEnd };
}

function buildFullRange(maxTimeS: number): ChartRange {
  return { start: 0, end: Math.max(maxTimeS, 0) };
}

function filterPointsInRange(points: SeriesPoint[], range: ChartRange) {
  if (!points.length) {
    return points;
  }

  const filtered = points.filter((point) => point.x >= range.start && point.x <= range.end);
  if (!filtered.length) {
    const closest = points.reduce((nearest, point) => {
      const nearestDistance = Math.min(Math.abs(nearest.x - range.start), Math.abs(nearest.x - range.end));
      const pointDistance = Math.min(Math.abs(point.x - range.start), Math.abs(point.x - range.end));
      return pointDistance < nearestDistance ? point : nearest;
    }, points[0]);
    return [closest];
  }

  const firstIndex = points.findIndex((point) => point.x >= range.start);
  let lastIndex = -1;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].x <= range.end) {
      lastIndex = index;
      break;
    }
  }
  const leadingPoint = firstIndex > 0 ? points[firstIndex - 1] : null;
  const trailingPoint = lastIndex >= 0 && lastIndex < points.length - 1 ? points[lastIndex + 1] : null;

  return [
    ...(leadingPoint ? [leadingPoint] : []),
    ...filtered,
    ...(trailingPoint ? [trailingPoint] : []),
  ];
}

function downsamplePoints(points: SeriesPoint[], maxPoints: number) {
  if (points.length <= maxPoints || maxPoints < 3) {
    return points;
  }

  const sampled: SeriesPoint[] = [points[0]];
  const stride = (points.length - 2) / (maxPoints - 2);

  for (let index = 1; index < maxPoints - 1; index += 1) {
    sampled.push(points[Math.round(index * stride)]);
  }

  sampled.push(points[points.length - 1]);

  const deduped: SeriesPoint[] = [];
  const seen = new Set<string>();
  sampled
    .sort((left, right) => left.x - right.x)
    .forEach((point) => {
      const key = `${point.x}:${point.y ?? "null"}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(point);
      }
    });

  return deduped;
}

function buildChartData(series: ChartSeries[]) {
  const rows = new Map<number, Record<string, number | string | null>>();

  series.forEach((item) => {
    item.points.forEach((point) => {
      const existing = rows.get(point.x) ?? { time: point.x };
      existing[item.key] = point.y;
      rows.set(point.x, existing);
    });
  });

  return [...rows.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, value]) => value);
}

function chartRangeLabel(range: ChartRange, maxTimeS: number, missionStartTime?: string | null) {
  return `${formatPlaybackTime(range.start, maxTimeS)} - ${formatPlaybackTime(range.end, maxTimeS)}`;
}

export default function LineChartPanel({ title, subtitle, series, maxTimeS, yAxisLabel, missionStartTime }: LineChartPanelProps) {
  const totalDurationS = Math.max(
    maxTimeS ?? 0,
    ...series.map((item) => item.points[item.points.length - 1]?.x ?? 0),
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hiddenSeriesKeys, setHiddenSeriesKeys] = useState<string[]>([]);
  const [viewRange, setViewRange] = useState<ChartRange>(() => buildFullRange(totalDurationS));
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [selectionStartX, setSelectionStartX] = useState<number | null>(null);
  const [selectionEndX, setSelectionEndX] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setViewRange(buildFullRange(totalDurationS));
  }, [totalDurationS]);

  const visibleSeries = useMemo(
    () => series.filter((item) => !hiddenSeriesKeys.includes(item.key)),
    [hiddenSeriesKeys, series],
  );

  const processedSeries = useMemo(() => {
    const maxPoints = isFullscreen ? FULLSCREEN_MAX_POINTS : NORMAL_MAX_POINTS;
    return visibleSeries.map((item) => ({
      ...item,
      points: downsamplePoints(filterPointsInRange(item.points, viewRange), maxPoints),
    }));
  }, [isFullscreen, viewRange, visibleSeries]);

  const deferredSeries = useDeferredValue(processedSeries);
  const data = useMemo(() => buildChartData(deferredSeries), [deferredSeries]);
  const seriesByKey = Object.fromEntries(visibleSeries.map((item) => [item.key, item]));
  const hasRightAxis = visibleSeries.some((item) => item.yAxisId === "right");
  const isChartLoading = isPending || deferredSeries !== processedSeries;
  const isZoomed = viewRange.start > 0 || viewRange.end < totalDurationS;
  const tickCount = totalDurationS >= 300 ? (isFullscreen ? 18 : 12) : (isFullscreen ? 14 : 10);

  const isDraggingSelection = selectionStart !== null;
  const selectionBox =
    selectionStartX !== null && selectionEndX !== null
      ? {
          left: Math.min(selectionStartX, selectionEndX),
          width: Math.max(Math.abs(selectionEndX - selectionStartX), 2),
        }
      : null;
  const selectionRange =
    selectionStart !== null && selectionEnd !== null
      ? {
          start: Math.min(selectionStart, selectionEnd),
          end: Math.max(selectionStart, selectionEnd),
        }
      : null;

  function updateRange(start: number, end: number) {
    startTransition(() => {
      setViewRange(clampRange(start, end, totalDurationS));
    });
  }

  function resetRange() {
    updateRange(0, totalDurationS);
  }

  function zoom(factor: number) {
    const currentSpan = Math.max(viewRange.end - viewRange.start, 1);
    const nextSpan = Math.min(Math.max(currentSpan * factor, 10), Math.max(totalDurationS, 10));
    const center = viewRange.start + currentSpan / 2;
    updateRange(center - nextSpan / 2, center + nextSpan / 2);
  }

  function pan(direction: -1 | 1) {
    const currentSpan = Math.max(viewRange.end - viewRange.start, 1);
    const offset = currentSpan * 0.2 * direction;
    updateRange(viewRange.start + offset, viewRange.end + offset);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!totalDurationS || !event.altKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    zoom(event.deltaY > 0 ? 1.2 : 0.8);
  }

  function toggleSeries(key: string) {
    startTransition(() => {
      setHiddenSeriesKeys((current) =>
        current.includes(key)
          ? current.filter((value) => value !== key)
          : [...current, key],
      );
    });
  }

  function toggleAllSeries() {
    startTransition(() => {
      setHiddenSeriesKeys((current) => (
        current.length === 0
          ? series.map((item) => item.key)
          : []
      ));
    });
  }

  function handleChartMouseDown(state?: { activeLabel?: number | string; chartX?: number }) {
    const nextValue = Number(state?.activeLabel);
    const nextX = Number(state?.chartX);
    if (Number.isFinite(nextValue)) {
      setSelectionStart(nextValue);
      setSelectionEnd(nextValue);
    }
    if (Number.isFinite(nextX)) {
      setSelectionStartX(nextX);
      setSelectionEndX(nextX);
    }
  }

  function handleChartMouseMove(state?: { activeLabel?: number | string; chartX?: number }) {
    if (selectionStart === null) {
      return;
    }
    const nextValue = Number(state?.activeLabel);
    const nextX = Number(state?.chartX);
    if (Number.isFinite(nextValue)) {
      setSelectionEnd(nextValue);
    }
    if (Number.isFinite(nextX)) {
      setSelectionEndX(nextX);
    }
  }

  function handleChartMouseUp() {
    if (selectionStart === null || selectionEnd === null) {
      setSelectionStart(null);
      setSelectionEnd(null);
      setSelectionStartX(null);
      setSelectionEndX(null);
      return;
    }

    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);

    setSelectionStart(null);
    setSelectionEnd(null);
    setSelectionStartX(null);
    setSelectionEndX(null);

    if (Math.abs(end - start) < 5) {
      return;
    }

    updateRange(start, end);
  }

  const controls = (
    <>
      <div className="chart-control-group">
        <button className="chart-control-button" type="button" onClick={() => zoom(0.8)}>
          Zoom In
        </button>
        <button className="chart-control-button" type="button" onClick={() => zoom(1.25)}>
          Zoom Out
        </button>
        <button className="chart-control-button" type="button" onClick={() => pan(-1)}>
          Pan Left
        </button>
        <button className="chart-control-button" type="button" onClick={() => pan(1)}>
          Pan Right
        </button>
        <button className="chart-control-button" type="button" onClick={resetRange}>
          Reset
        </button>
        <button className="chart-control-button" type="button" onClick={() => setIsFullscreen((value) => !value)}>
          {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        </button>
      </div>
      <div className="chart-control-group">
        <button className={`chart-filter-button ${!isZoomed ? "is-active" : ""}`} type="button" onClick={resetRange}>
          Full
        </button>
      </div>
      <div className="chart-control-group chart-control-series">
        <button
          className={`chart-filter-button ${hiddenSeriesKeys.length === 0 ? "is-active" : ""}`}
          type="button"
          onClick={toggleAllSeries}
        >
          All
        </button>
        {series.map((item) => {
          const isVisible = !hiddenSeriesKeys.includes(item.key);
          return (
            <button
              key={item.key}
              className={`chart-filter-button ${isVisible ? "is-active" : ""}`}
              type="button"
              onClick={() => toggleSeries(item.key)}
            >
              <span className="legend-dot" style={{ backgroundColor: item.color }} />
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="chart-range-copy">
        <span>Window {chartRangeLabel(viewRange, totalDurationS, missionStartTime)}</span>
        <span>Drag on the chart to select a range, hold Alt and scroll to zoom</span>
      </div>
    </>
  );

  return (
    <article className={`summary-card chart-panel-card ${isFullscreen ? "chart-panel-card-fullscreen" : ""}`}>
      {isFullscreen ? (
        <div className="chart-fullscreen-layout">
          <aside className="chart-fullscreen-sidebar">
            <div className="chart-panel-header">
              <div>
                <p className="section-title">{title}</p>
                <h4>{subtitle}</h4>
              </div>
            </div>
            <div className="chart-controls-shell chart-controls-sidebar">{controls}</div>
          </aside>
          <div className="chart-fullscreen-main">
            <div className="chart-stage">
              {yAxisLabel ? <div className="chart-y-axis-label">{yAxisLabel}</div> : null}
              <div className={`chart-canvas ${isDraggingSelection ? "chart-canvas-selecting" : ""}`} onWheel={handleWheel}>
                {isChartLoading ? (
                  <div className="chart-loading-overlay">
                    <div className="chart-spinner" />
                    <span>Preparing chart...</span>
                  </div>
                ) : null}
                {selectionRange ? (
                  <>
                    <div className="chart-selection-badge">
                      <span className="chart-selection-badge-title">Area Selection</span>
                      <span className="chart-selection-badge-range">{chartRangeLabel(selectionRange, totalDurationS, missionStartTime)}</span>
                    </div>
                    <div className="chart-selection-note">Release to zoom into the selected range</div>
                  </>
                ) : null}
                {selectionBox ? (
                  <div
                    className="chart-selection-overlay"
                    style={{ left: `${selectionBox.left}px`, width: `${selectionBox.width}px` }}
                  />
                ) : null}
                <ResponsiveContainer width="100%" height={520}>
                  <LineChart
                    data={data}
                    margin={{ top: 18, right: 24, left: 34, bottom: 8 }}
                    onMouseDown={handleChartMouseDown}
                    onMouseMove={handleChartMouseMove}
                    onMouseUp={handleChartMouseUp}
                  >
                    <CartesianGrid stroke="rgba(15, 23, 42, 0.10)" strokeDasharray="4 4" />
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={[viewRange.start, Math.max(viewRange.end, viewRange.start + 1)]}
                      allowDataOverflow
                      stroke="#5e6b7d"
                      tick={{ fill: "#5e6b7d", fontSize: 12 }}
                      tickCount={tickCount}
                      minTickGap={12}
                      interval="preserveStartEnd"
                      tickFormatter={(value) => formatPlaybackTime(Number(value), totalDurationS, { compact: true })}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke="#5e6b7d"
                      tick={{ fill: "#5e6b7d", fontSize: 12 }}
                    />
                    {hasRightAxis ? (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#5e6b7d"
                        tick={{ fill: "#5e6b7d", fontSize: 12 }}
                      />
                    ) : null}
                    {!isDraggingSelection ? (
                      <Tooltip
                        contentStyle={{
                          borderRadius: 14,
                          border: "1px solid rgba(15,23,42,0.08)",
                          background: "#ffffff",
                          boxShadow: "0 14px 30px rgba(15,23,42,0.12)",
                        }}
                        formatter={(value, name) => {
                          const item = seriesByKey[String(name)];
                          const formatted = formatValue(value as number);
                          return item?.unit ? `${formatted} ${item.unit}` : formatted;
                        }}
                        labelFormatter={(value) => `Elapsed ${formatPlaybackTime(Number(value), totalDurationS)}`}
                      />
                    ) : null}
                    <Legend wrapperStyle={{ paddingTop: 10 }} />
                    {selectionRange ? (
                      <ReferenceArea
                        x1={selectionRange.start}
                        x2={selectionRange.end}
                        stroke="#1f6fff"
                        strokeOpacity={1}
                        strokeWidth={2.5}
                        strokeDasharray="8 4"
                        fill="rgba(31, 111, 255, 0.28)"
                      />
                    ) : null}
                    {visibleSeries.map((item) => (
                      <Line
                        key={item.key}
                        type="monotone"
                        dataKey={item.key}
                        name={item.label}
                        yAxisId={item.yAxisId ?? "left"}
                        stroke={item.color}
                        strokeWidth={2.8}
                        dot={false}
                        connectNulls
                        isAnimationActive={!isChartLoading}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="chart-panel-header chart-panel-header-with-controls">
            <div>
              <p className="section-title">{title}</p>
              <h4>{subtitle}</h4>
            </div>
            <div className="chart-controls-shell">{controls}</div>
          </div>
          <div className="chart-stage">
            {yAxisLabel ? <div className="chart-y-axis-label">{yAxisLabel}</div> : null}
            <div className={`chart-canvas ${isDraggingSelection ? "chart-canvas-selecting" : ""}`} onWheel={handleWheel}>
              {isChartLoading ? (
                <div className="chart-loading-overlay">
                  <div className="chart-spinner" />
                  <span>Preparing chart...</span>
                </div>
              ) : null}
              {selectionRange ? (
                <>
                  <div className="chart-selection-badge">
                    <span className="chart-selection-badge-title">Area Selection</span>
                    <span className="chart-selection-badge-range">{chartRangeLabel(selectionRange, totalDurationS, missionStartTime)}</span>
                  </div>
                  <div className="chart-selection-note">Release to zoom into the selected range</div>
                </>
              ) : null}
              {selectionBox ? (
                <div
                  className="chart-selection-overlay"
                  style={{ left: `${selectionBox.left}px`, width: `${selectionBox.width}px` }}
                />
              ) : null}
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={data}
                  margin={{ top: 18, right: 24, left: 34, bottom: 8 }}
                  onMouseDown={handleChartMouseDown}
                  onMouseMove={handleChartMouseMove}
                  onMouseUp={handleChartMouseUp}
                >
                  <CartesianGrid stroke="rgba(15, 23, 42, 0.10)" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={[viewRange.start, Math.max(viewRange.end, viewRange.start + 1)]}
                    allowDataOverflow
                    stroke="#5e6b7d"
                    tick={{ fill: "#5e6b7d", fontSize: 12 }}
                    tickCount={tickCount}
                    minTickGap={12}
                    interval="preserveStartEnd"
                    tickFormatter={(value) => formatPlaybackTime(Number(value), totalDurationS, { compact: true })}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#5e6b7d"
                    tick={{ fill: "#5e6b7d", fontSize: 12 }}
                  />
                  {hasRightAxis ? (
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#5e6b7d"
                      tick={{ fill: "#5e6b7d", fontSize: 12 }}
                    />
                  ) : null}
                    {!isDraggingSelection ? (
                      <Tooltip
                        contentStyle={{
                          borderRadius: 14,
                          border: "1px solid rgba(15,23,42,0.08)",
                          background: "#ffffff",
                          boxShadow: "0 14px 30px rgba(15,23,42,0.12)",
                        }}
                        formatter={(value, name) => {
                          const item = seriesByKey[String(name)];
                          const formatted = formatValue(value as number);
                          return item?.unit ? `${formatted} ${item.unit}` : formatted;
                        }}
                        labelFormatter={(value) => `Elapsed ${formatPlaybackTime(Number(value), totalDurationS)}`}
                      />
                    ) : null}
                  <Legend wrapperStyle={{ paddingTop: 10 }} />
                  {selectionRange ? (
                    <ReferenceArea
                      x1={selectionRange.start}
                      x2={selectionRange.end}
                      stroke="#1f6fff"
                      strokeOpacity={1}
                      strokeWidth={2.5}
                      strokeDasharray="8 4"
                      fill="rgba(31, 111, 255, 0.28)"
                    />
                  ) : null}
                  {visibleSeries.map((item) => (
                    <Line
                      key={item.key}
                      type="monotone"
                      dataKey={item.key}
                      name={item.label}
                      yAxisId={item.yAxisId ?? "left"}
                      stroke={item.color}
                      strokeWidth={2.8}
                      dot={false}
                      connectNulls
                      isAnimationActive={!isChartLoading}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </article>
  );
}
