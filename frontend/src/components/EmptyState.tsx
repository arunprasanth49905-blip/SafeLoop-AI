import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  phaseBadge?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  phaseBadge,
}) => {
  return (
    <div className="empty-state-card">
      <div className="empty-state-icon">
        <Icon size={24} />
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-text">{description}</p>
      {phaseBadge && <span className="empty-state-badge">{phaseBadge}</span>}
    </div>
  );
};
