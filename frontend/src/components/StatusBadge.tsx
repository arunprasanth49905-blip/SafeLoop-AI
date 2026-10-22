import React from 'react';

interface StatusBadgeProps {
  status: 'connected' | 'disconnected' | 'healthy' | 'inactive' | 'pending' | 'error';
  label?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, className = '' }) => {
  const displayLabel = label || status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span className={`status-pill ${status} ${className}`}>
      <span className="status-indicator-dot" />
      <span>{displayLabel}</span>
    </span>
  );
};
