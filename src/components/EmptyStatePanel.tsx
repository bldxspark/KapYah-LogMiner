// File purpose: Reusable empty and loading state panel for workspace sections.
type EmptyStatePanelProps = {
  title: string;
  description: string;
};

export default function EmptyStatePanel({
  title,
  description,
}: EmptyStatePanelProps) {
  return (
    <article className="summary-card empty-panel">
      <p className="section-title">No Log Selected</p>
      <h4>{title}</h4>
      <p>{description}</p>
    </article>
  );
}
