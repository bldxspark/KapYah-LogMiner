// File purpose: Help, FAQ, product information, and contact section for the app.
import { invoke } from "@tauri-apps/api/core";

const FAQ_ITEMS = [
  {
    question: "Which log formats are supported?",
    answer:
      "KapYah LogMiner supports .bin, .tlog, .log, .ulg, and .ulog flight logs. MAVLink-style logs use the main parser path, while ULog and ULG files use the pyulog-based parser path.",
  },
  {
    question: "How do I start a mission review?",
    answer:
      "Use Select Flight Log from the home screen, choose a supported log file, and wait for analysis to finish. After processing completes, the Overview, Timeline, Power, Vibration, RC Info, Map, Messages, Reports, and Help & Support sections are available from the sidebar.",
  },
  {
    question: "What does the Overview section show?",
    answer:
      "Overview summarizes the mission at a glance, including vehicle type, detected duration, mission count, GPS state, home location details, distance traveled, max altitude, max speed, orientation source, IMU summary, control-link health, and notable warnings, anomalies, failsafe events, or error indicators when available.",
  },
  {
    question: "What is the Timeline used for?",
    answer:
      "Timeline provides the chronological mission feed so you can review mode changes, warnings, errors, and synthetic mission boundary markers such as Mission started and Mission end. It is intended for incident reconstruction, event sequencing, and mission-state interpretation.",
  },
  {
    question: "What does the Map section show?",
    answer:
      "Map shows the reconstructed route, start and end markers, current playback position, and selected event markers. Follow Drone, Reset View, playback scrubbing, speed control, and fullscreen review are available for spatial analysis without modifying the source log.",
  },
  {
    question: "What can I learn from Messages?",
    answer:
      "Messages focuses on system, telemetry, warning, and error text records. It helps identify pre-arm issues, EKF warnings, mission boundary events, and the last real logged event, while keeping synthetic mission boundary rows from distorting the final message summary.",
  },
  {
    question: "What is included in RC Info?",
    answer:
      "RC Info shows control-link health, RSSI and link-quality trends, active RC channels, and RC channel trend lines. The backend supports up to 16 RC channels when present in the log, and the UI focuses on channels that are actually active.",
  },
  {
    question: "What is included in Power and Vibration review?",
    answer:
      "Power review summarizes starting, ending, and minimum voltage, current trends, and overall power health. Vibration review highlights average and maximum X, Y, and Z vibration levels, dominant axis, severity classification, and charted samples over mission time.",
  },
  {
    question: "How does report generation work?",
    answer:
      "When you click Generate Report, the app opens a save dialog and suggests a default folder name based on the current date and time, such as report_2026_03_30_14_25_18. You can keep that name or enter your own folder name, and the export process writes both flight_data.xlsx and mission_report.pdf into the same generated report folder.",
  },
  {
    question: "What is inside the generated Excel report?",
    answer:
      "The Excel report includes operational sheets derived from the analyzed mission, including summary, timeline, signal samples, power, vibration, RC health, RC channels, map route, GPS, event markers, flight modes, message counts, raw messages, warnings, anomalies, and report metadata.",
  },
  {
    question: "Why can the report folder name change automatically?",
    answer:
      "The default report folder name includes the current date and time, so each export starts with a unique suggested folder name and helps avoid overwriting an earlier report.",
  },
  {
    question: "Why can some values show as unavailable?",
    answer:
      "Some logs do not contain reliable GPS, RC, vibration, power, or mission-state data for every metric. In those cases the app keeps the section visible but marks missing values as unavailable instead of fabricating placeholders or misleading estimates.",
  },
  {
    question: "Why can GPS or route information be missing?",
    answer:
      "GPS or route details may be missing when the log has no valid fix, no usable coordinates, or placeholder location values. In those cases the app suppresses unreliable home location and route-derived values instead of displaying misleading map output.",
  },
  {
    question: "Does the app send my logs anywhere?",
    answer:
      "The app is designed for local desktop analysis. Log parsing, mission review, and report generation run inside the local application environment. External actions are limited to opening the KapYah website or email link when you explicitly click them.",
  },
];

const DOC_SECTIONS = [
  {
    title: "Supported Log Formats",
    body:
      "Use .bin, .tlog, .log, .ulg, or .ulog files. The file picker, parser routing, map analysis, timeline review, and report workflow are aligned to these supported formats throughout the application.",
  },
  {
    title: "Upload And Review Workflow",
    body:
      "Load a supported flight log, wait for parsing to complete, then review mission behavior through Overview, Timeline, Power, Vibration, RC Info, Map, Messages, and Reports depending on the investigation task.",
  },
  {
    title: "Playback And Map Behavior",
    body:
      "Map playback is synchronized to the reconstructed route data and supports scrubbing, stepping, speed changes, Follow Drone, Reset View, and fullscreen review. If route points are unavailable, playback controls may still render but meaningful map motion depends on valid route samples in the log.",
  },
  {
    title: "Export Workflow",
    body:
      "The Reports section creates one named export folder for each generated report. That folder contains both flight_data.xlsx and mission_report.pdf, allowing mission data sheets and the narrative report to stay grouped together for handoff and archive use.",
  },
  {
    title: "Troubleshooting Guidance",
    body:
      "If a value is unavailable, first confirm that the log actually contains that telemetry stream. GPS, RC, vibration, power, and mission event coverage can vary by firmware, vehicle type, and recorder settings, so missing values may reflect missing source data rather than an application fault.",
  },
  {
    title: "Privacy And Data Handling",
    body:
      "Logs are analyzed locally. Generated reports are written to the chosen folder on the local machine. External website and email actions occur only when you click the provided contact buttons.",
  },
];

export default function HelpSupportTab() {
  const currentYear = new Date().getFullYear();

  function openExternal(url: string) {
    void invoke("open_external_url", { url });
  }

  return (
    <section className="module-stack">
      <div className="help-grid">
        <article className="summary-card help-card">
          <p className="section-title">Contact</p>
          <h4>Reach KapYah Industries</h4>
          <div className="help-action-list">
            <button className="secondary-button" type="button" onClick={() => openExternal("mailto:contact@kapyah.com")}>
              contact@kapyah.com
            </button>
            <button className="secondary-button" type="button" onClick={() => openExternal("https://www.kapyah.com/")}>
              www.kapyah.com
            </button>
          </div>
        </article>

        <article className="summary-card help-card">
          <p className="section-title">Product</p>
          <h4>About This Application</h4>
          <p>
            KapYah LogMiner is a desktop app for telemetry review, route reconstruction, timeline analysis,
            message inspection, RC and system-health review, and structured report generation.
            It helps teams inspect mission behavior, operational health, event history, and export-ready findings in one workflow.
          </p>
        </article>
      </div>

      <article className="summary-card help-card">
        <p className="section-title">Documentation</p>
        <h4>Operational guidance</h4>
        <div className="help-doc-list">
          {DOC_SECTIONS.map((section) => (
            <div key={section.title} className="help-doc-item">
              <h5>{section.title}</h5>
              <p>{section.body}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="summary-card help-card">
        <p className="section-title">Frequently Asked Questions</p>
        <h4>Common operator and client questions</h4>
        <div className="help-faq-list">
          {FAQ_ITEMS.map((item) => (
            <div key={item.question} className="help-faq-item">
              <h5>{item.question}</h5>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
        <p className="help-copyright">{"\u00A9"} {currentYear} KapYah Industries Pvt. Ltd. All rights reserved.</p>
      </article>
    </section>
  );
}
