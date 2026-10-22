import React from 'react';

interface MetricPlaceholderProps {
  label: string;
  subtext: string;
}

export const MetricPlaceholder: React.FC<MetricPlaceholderProps> = ({ label, subtext }) => {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className="metric-value">—</span>
      <span className="metric-subtext">{subtext}</span>
    </div>
  );
};
