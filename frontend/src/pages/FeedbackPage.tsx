import React from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export const FeedbackPage: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card">
        <div className="card-header">
          <div>
            <h2 style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              Human & Automated Feedback Engine
            </h2>
            <p className="card-description">
              Continuous loop ingestion of user corrections, ratings, critique signals, and automated evaluations.
            </p>
          </div>
        </div>

        <EmptyState
          icon={MessageSquarePlus}
          title="Feedback Collection Pending Phase 3"
          description="In Phase 3, SafeLoop AI will introduce structured feedback capture (thumbs up/down, precision rubric ratings, and corrective text demonstrations) to power safe continuous adaptation without model retraining."
          phaseBadge="Phase 3: Feedback Collection"
        />
      </div>
    </div>
  );
};
