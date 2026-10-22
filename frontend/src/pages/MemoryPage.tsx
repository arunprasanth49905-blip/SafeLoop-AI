import React from 'react';
import { BrainCircuit } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export const MemoryPage: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card">
        <div className="card-header">
          <div>
            <h2 style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              Persistent Learning Memory Store
            </h2>
            <p className="card-description">
              Verified memory index storing dynamically learned strategies, guidelines, and behavioral constraints.
            </p>
          </div>
        </div>

        <EmptyState
          icon={BrainCircuit}
          title="Learning Memory Pending Phase 4"
          description="In Phase 4, the persistent memory module will index validated behavioral adaptations and contextual memory stores, enabling agents to dynamically retrieve learnings at inference time without modifying underlying model weights."
          phaseBadge="Phase 4: Persistent Memory & Strategies"
        />
      </div>
    </div>
  );
};
