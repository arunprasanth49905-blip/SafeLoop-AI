import React from 'react';
import { Activity, Cpu, Server, Clock } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { MetricPlaceholder } from '../components/MetricPlaceholder';
import { EmptyState } from '../components/EmptyState';
import { SystemStatusState } from '../types';

interface OverviewPageProps {
  systemStatus: SystemStatusState;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ systemStatus }) => {
  const { health, agent, isLoading, error } = systemStatus;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Project Introduction Banner */}
      <div className="card" style={{ borderLeft: '3px solid var(--accent-cyan)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
              SafeLoop AI
            </h2>
            <p style={{ maxWidth: '780px', fontSize: '0.875rem' }}>
              Safe Feedback-Driven Continuous Improvement of Agentic AI Systems Without Model Retraining.
              Phase 1 provides the core system architecture, decoupled backend services, and verified health telemetry.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span className="brand-badge">Phase 2: Gemini Connected</span>
          </div>
        </div>
      </div>

      {/* Real Infrastructure Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        {/* Backend Process Health */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Server size={18} style={{ color: 'var(--accent-cyan)' }} />
              FastAPI Backend Telemetry
            </span>
            <StatusBadge
              status={
                isLoading
                  ? 'pending'
                  : health?.status === 'healthy'
                  ? 'healthy'
                  : 'error'
              }
              label={
                isLoading
                  ? 'Checking...'
                  : health?.status === 'healthy'
                  ? 'Healthy'
                  : 'Offline'
              }
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Service Identifier</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{health?.service || 'safeloop-backend'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Backend Version</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{health?.version || '0.1.0'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Health Check Endpoint</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>GET /health</span>
            </div>
            {error && (
              <div style={{ marginTop: '0.5rem', color: 'var(--status-rose)', fontSize: '0.75rem' }}>
                {error}
              </div>
            )}
          </div>
        </div>

        {/* AI Provider Status */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Cpu size={18} style={{ color: 'var(--accent-cyan)' }} />
              AI Provider Integration
            </span>
            <StatusBadge
              status={agent?.configured ? 'healthy' : 'inactive'}
              label={
                agent?.configured
                  ? 'Active (Ready)'
                  : health?.status === 'healthy'
                  ? 'Provider Unconfigured'
                  : 'Offline'
              }
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Provider Name</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{agent?.provider || 'google-gemini'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Target Model</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {agent?.model || (health?.status === 'healthy' ? 'Awaiting Provider Setup' : 'Offline')}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Activation Status</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {agent?.status_message || (health?.status === 'healthy' ? 'Provider credentials required in backend/.env' : 'Backend offline')}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* System Metrics (Phase 1: Real Empty States / Em Dashes - Never Invent Fake Metrics) */}
      <div>
        <h3 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Continuous Improvement Metrics
        </h3>
        <div className="metrics-grid">
          <MetricPlaceholder
            label="Total Tasks Executed"
            subtext="No tasks executed yet (Phase 1)"
          />
          <MetricPlaceholder
            label="Feedback Received"
            subtext="Awaiting Phase 3 collector"
          />
          <MetricPlaceholder
            label="Approved Learning Changes"
            subtext="Awaiting Phase 4-5 validation"
          />
          <MetricPlaceholder
            label="Safety Verification Status"
            subtext="Engine offline (Phase 5)"
          />
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Activity size={18} style={{ color: 'var(--accent-cyan)' }} />
            Recent Activity Log
          </span>
        </div>
        <EmptyState
          icon={Clock}
          title="No Activity Recorded"
          description="System events, agent invocations, and feedback learning loops will appear here once agent execution is connected in Phase 2 and feedback processing is enabled in Phase 3."
          phaseBadge="Activity Stream Offline"
        />
      </div>
    </div>
  );
};
