// File purpose: Timeline tab for mission events, summaries, and synthetic boundary markers.
import MetricList from "../MetricList";
import { formatMissionDateParts, formatMissionMoment, formatPlaybackTime } from "../../utils/timeFormat";
import type { TimelineAnalysis, TimelineEvent } from "../../types/analysis";

type TimelineTabProps = TimelineAnalysis & {
  missionDurationS?: number | null;
  missionStartTime?: string | null;
};

function severityClassName(severity: string) {
  if (severity === "error") {
    return "severity-badge severity-error";
  }
  if (severity === "warning") {
    return "severity-badge severity-warning";
  }
  return "severity-badge severity-info";
}

function buildEventFeed(events: TimelineEvent[], missionDurationS: number) {
  const sortedEvents = [...events].sort((left, right) => (left.timeS ?? 0) - (right.timeS ?? 0));
  const hasStartEvent = sortedEvents.some((event) => (event.timeS ?? 0) <= 0.1);
  const hasEndEvent = sortedEvents.some((event) => Math.abs((event.timeS ?? 0) - missionDurationS) <= 0.1);

  const feed: TimelineEvent[] = [];

  if (!hasStartEvent) {
    feed.push({
      timeS: 0,
      label: "START",
      detail: "Mission start",
      category: "system",
      severity: "info",
    });
  }

  feed.push(...sortedEvents);

  if (missionDurationS > 0 && !hasEndEvent) {
    feed.push({
      timeS: missionDurationS,
      label: "END",
      detail: "Mission end",
      category: "system",
      severity: "info",
    });
  }

  return feed;
}

function buildTimelineScenario(
  events: TimelineEvent[],
  highlightedEvents: TimelineEvent[],
  modeTransitions: TimelineEvent[],
  warningEvents: TimelineEvent[],
  missionStartTime?: string | null,
) {
  const sortedEvents = [...events].sort((left, right) => (left.timeS ?? 0) - (right.timeS ?? 0));
  const firstEvent = sortedEvents[0];
  const lastEvent = sortedEvents[sortedEvents.length - 1];
  const firstMode = modeTransitions[0];
  const latestMode = modeTransitions[modeTransitions.length - 1];
  const highlightedSummary = highlightedEvents
    .slice(0, 4)
    .map((event) => event.detail?.trim() || event.label?.trim())
    .filter(Boolean)
    .join(", ");
  const totalEvents = sortedEvents.length;

  if (!firstEvent) {
    return "Timeline review did not contain enough event detail to build a mission sequence summary.";
  }

  const missionStartLabel = formatMissionDateParts(missionStartTime);
  const startMoment = missionStartLabel
    ? `${missionStartLabel.date} | ${missionStartLabel.day} | ${missionStartLabel.time}`
    : formatPlaybackTime(firstEvent.timeS, firstEvent.timeS ?? 0);
  const endMoment = formatMissionMoment(lastEvent?.timeS ?? firstEvent.timeS, missionStartTime);
  const endTime = formatPlaybackTime(lastEvent?.timeS ?? firstEvent.timeS, lastEvent?.timeS ?? firstEvent.timeS ?? 0);
  const opening = `Timeline review indicates that the mission sequence begins with ${firstEvent.detail} at ${startMoment} and continues through ${totalEvents} recorded event${totalEvents === 1 ? "" : "s"} until the final logged point at ${endMoment}, where the sequence closes with ${lastEvent?.detail ?? "the last recorded event"} after ${endTime}.`;
  const modeStory = modeTransitions.length
    ? ` During this progression, ${modeTransitions.length} mode transition${modeTransitions.length === 1 ? "" : "s"} ${modeTransitions.length === 1 ? "is" : "are"} visible in the timeline, beginning with ${firstMode?.detail ?? firstMode?.label ?? "an initial mode change"}${latestMode && latestMode !== firstMode ? ` and later reaching ${latestMode.detail ?? latestMode.label}` : ""}.`
    : " No distinct mode-transition markers were extracted from the reviewed event stream.";
  const warningStory = warningEvents.length
    ? ` The reviewed sequence also contains ${warningEvents.length} warning-oriented timeline event${warningEvents.length === 1 ? "" : "s"}, indicating points that may require closer operational review for anomaly interpretation, pre-flight checks, or in-mission caution states.`
    : " No warning-oriented timeline events were identified in the reviewed sequence.";
  const highlightStory = highlightedSummary
    ? ` Notable highlighted events observed across the mission include ${highlightedSummary}, which together help describe the overall operational flow of the flight.`
    : " No additional highlighted events were extracted beyond the main event stream.";

  return `${opening}${modeStory}${warningStory}${highlightStory}`;
}

export default function TimelineTab({
  totalEvents,
  highlightedEvents,
  modeTransitions,
  warningEvents,
  events,
  missionDurationS,
  missionStartTime,
}: TimelineTabProps) {
  const maxTimeS = Math.max(missionDurationS ?? 0, ...events.map((event) => event.timeS ?? 0));
  const previewEvents = buildEventFeed(events, maxTimeS);
  const scenarioParagraphs = buildTimelineScenario(events, highlightedEvents, modeTransitions, warningEvents, missionStartTime);

  return (
    <section className="module-stack">
      <article className="summary-card">
        <div className="timeline-scenario-copy timeline-summary-copy">
          <p className="section-title">Summary</p>
          <h4>Operational event review</h4>
          <p>{scenarioParagraphs}</p>
        </div>
        <div className="timeline-scenario-copy timeline-metrics-copy">
          <p className="section-title">Timeline</p>
          <h4>Mission sequence summary</h4>
          <MetricList
            items={[
              { label: "Total Events", value: totalEvents },
              { label: "Mode Transitions", value: modeTransitions.length },
              { label: "Warning Events", value: warningEvents.length },
              { label: "Highlighted Events", value: highlightedEvents.length },
            ]}
          />
        </div>
      </article>

      <article className="summary-card">
        <p className="section-title">Event Feed</p>
        <h4>Chronological mission markers</h4>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Elapsed Time</th>
                {missionStartTime ? <th>Date / Time</th> : null}
                <th>Category</th>
                <th>Severity</th>
                <th>Event</th>
              </tr>
            </thead>
            <tbody>
              {previewEvents.map((event, index) => (
                <tr key={`${event.label}-${event.timeS}-${index}`}>
                  <td>{formatPlaybackTime(event.timeS, maxTimeS)}</td>
                  {missionStartTime ? <td>{formatMissionMoment(event.timeS, missionStartTime)}</td> : null}
                  <td>{event.category}</td>
                  <td>
                    <span className={severityClassName(event.severity)}>{event.severity.toUpperCase()}</span>
                  </td>
                  <td>{event.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
