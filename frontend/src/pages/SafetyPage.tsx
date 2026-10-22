import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export const SafetyPage: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card">
        <div className="card-header">
          <div>
            <h2 style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              Safety & Regression Engine
            </h2>
            <p className="card-description">
              Verification perimeter enforcing feedback validation, safety policy adherence, and automated rollback.
            </p>
          </div>
        </div>

        <EmptyState
          icon={ShieldCheck}
          title="Safety Verification Pending Phase 5 & 6"
          description="In Phase 5 and Phase 6, SafeLoop AI will implement strict validation gates: automated feedback plausibility checks, adversarial poisoning defenses, safety guardrails, and regression rollback triggers before learned updates enter memory."
          phaseBadge="Phase 5 & 6: Safety Validation & Rollback"
        />
      </div>
    </div>
  );
};
