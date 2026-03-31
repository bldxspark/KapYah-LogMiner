// File purpose: Report export tab for combined Excel/PDF generation and recent report actions.
import MetricList from "../MetricList";
import { formatMissionMoment } from "../../utils/timeFormat";
import type { ReportSummary } from "../../types/analysis";

type RecentReportEntry = {
  folderName: string;
  folderPath: string;
  excelPath: string;
  pdfPath: string;
  createdAt: string;
};

function formatReportCreatedAt(createdAt: string) {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) {
    return createdAt;
  }

  return formatMissionMoment(0, new Date(parsed).toISOString());
}

type ReportsTabProps = ReportSummary & {
  exportFolder: string | null;
  isGeneratingReport: boolean;
  reportPath: string | null;
  pdfReportPath: string | null;
  recentReports: RecentReportEntry[];
  onGenerateReport: () => void;
  onSelectExportFolder: () => void;
  onOpenReportPath: (path: string) => void;
  onDeleteRecentReport: (folderPath: string) => void;
};

export default function ReportsTab({
  format,
  isReady,
  exportFolder,
  isGeneratingReport,
  reportPath,
  pdfReportPath,
  recentReports,
  onGenerateReport,
  onSelectExportFolder,
  onOpenReportPath,
  onDeleteRecentReport,
}: ReportsTabProps) {
  const savedFolderPath = reportPath
    ? reportPath.replace(/[\\/][^\\/]+$/, "")
    : (pdfReportPath ? pdfReportPath.replace(/[\\/][^\\/]+$/, "") : null);

  return (
    <section className="module-stack">
      <article className="summary-card">
        <p className="section-title">Reports</p>
        <h4>Combined Excel and PDF export</h4>
        <MetricList
          items={[
            { label: "Format", value: format.toUpperCase() },
            { label: "Report Ready", value: isReady ? "Yes" : "No" },
            { label: "Files Generated", value: "flight_data.xlsx + mission_report.pdf" },
            { label: "Save Location", value: exportFolder ?? "Unavailable" },
          ]}
        />
        <div className="report-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onSelectExportFolder}
            disabled={isGeneratingReport}
          >
            Choose Save Location
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={onGenerateReport}
            disabled={!isReady || isGeneratingReport}
          >
            {isGeneratingReport ? "Generating Report..." : "Generate Report"}
          </button>
        </div>
        {savedFolderPath ? <p>Report saved to folder: {savedFolderPath}</p> : null}
      </article>

      <article className="summary-card">
        <div className="chart-panel-header">
          <div>
            <p className="section-title">Recent Reports</p>
            <h4>Generated report folders</h4>
          </div>
        </div>
        {recentReports.length ? (
          <div className="report-history-list">
            {recentReports.map((entry) => (
              <article key={entry.folderPath} className="report-history-item">
                <div className="report-history-copy">
                  <h5>{entry.folderName} <span>{formatReportCreatedAt(entry.createdAt)}</span></h5>
                  <p>{entry.folderPath}</p>
                </div>
                <div className="report-history-actions">
                  <button className="report-history-button" type="button" onClick={() => onOpenReportPath(entry.folderPath)}>
                    Folder
                  </button>
                  <button className="report-history-button" type="button" onClick={() => onOpenReportPath(entry.excelPath)}>
                    Excel
                  </button>
                  <button className="report-history-button" type="button" onClick={() => onOpenReportPath(entry.pdfPath)}>
                    PDF
                  </button>
                  <button className="report-history-button report-history-button-danger" type="button" onClick={() => onDeleteRecentReport(entry.folderPath)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-support-text">Generated reports will appear here with their saved folder names and quick actions.</p>
        )}
      </article>
    </section>
  );
}
