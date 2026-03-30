// File purpose: Shared metric list renderer for dashboard-style summary cards.
import type { ReactNode } from "react";

type MetricItem = {
  label: string;
  value: ReactNode;
};

type MetricListProps = {
  items: MetricItem[];
};

export default function MetricList({ items }: MetricListProps) {
  return (
    <div className="metric-list">
      {items.map((item) => (
        <div key={item.label} className="metric-row">
          <span className="metric-label">{item.label}</span>
          <span className="metric-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
