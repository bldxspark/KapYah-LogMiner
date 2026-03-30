// File purpose: Mission messages tab for warnings, errors, and timeline message review.
import MetricList from "../MetricList";
import { formatPlaybackTime } from "../../utils/timeFormat";
import type { MessageSummary } from "../../types/analysis";

function isMissionBoundaryMessage(text: string) {
  const normalized = text.trim().toLowerCase();
  return normalized === "mission started" || normalized === "mission end";
}

function buildVisibleMessages(rawMessages: MessageSummary["rawMessages"]) {
  const startBoundary = rawMessages.find((message) => message.text.trim().toLowerCase() === "mission started");
  const endBoundary = [...rawMessages].reverse().find((message) => message.text.trim().toLowerCase() === "mission end");
  const coreMessages = rawMessages.filter((message) => !isMissionBoundaryMessage(message.text));
  const tailMessages = coreMessages.slice(-38);
  const visible = [
    ...(startBoundary ? [startBoundary] : []),
    ...tailMessages,
    ...(endBoundary ? [endBoundary] : []),
  ];

  return visible.filter(
    (message, index, messages) =>
      messages.findIndex(
        (candidate) =>
          candidate.timeS === message.timeS &&
          candidate.type === message.type &&
          candidate.severity === message.severity &&
          candidate.text === message.text,
      ) === index,
  );
}

function severityClassName(severity: string) {
  if (severity === "error") {
    return "severity-badge severity-error";
  }
  if (severity === "warning") {
    return "severity-badge severity-warning";
  }
  return "severity-badge severity-info";
}

export default function MessagesTab({
  errorCount,
  warningCount,
  infoCount,
  lastEvent,
  rawMessages,
  missionStartTime,
}: MessageSummary & { missionStartTime?: string | null }) {
  const visibleMessages = buildVisibleMessages(rawMessages);
  const maxTimeS = visibleMessages[visibleMessages.length - 1]?.timeS ?? rawMessages[rawMessages.length - 1]?.timeS ?? 0;
  const lastRealEvent =
    [...rawMessages].reverse().find((message) => !isMissionBoundaryMessage(message.text))?.text ?? lastEvent;

  return (
    <section className="module-stack">
      <article className="summary-card">
        <p className="section-title">Messages</p>
        <h4>Engineering event and diagnostic review</h4>
        <MetricList
          items={[
            { label: "Error Messages", value: errorCount },
            { label: "Warning Messages", value: warningCount },
            { label: "Info Messages", value: infoCount },
            { label: "Last Logged Event", value: lastRealEvent ?? "None" },
            { label: "Visible Records", value: visibleMessages.length },
          ]}
        />
      </article>

      <article className="summary-card">
        <div className="chart-panel-header">
          <div>
            <p className="section-title">Message Table</p>
            <h4>Severity-tagged telemetry and system events</h4>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {visibleMessages.map((message, index) => (
                <tr key={`${message.type}-${message.timeS ?? index}-${index}`}>
                  <td>{formatPlaybackTime(message.timeS, maxTimeS, { missionStartTime })}</td>
                  <td>{message.type}</td>
                  <td>
                    <span className={severityClassName(message.severity)}>{message.severity.toUpperCase()}</span>
                  </td>
                  <td>{message.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
