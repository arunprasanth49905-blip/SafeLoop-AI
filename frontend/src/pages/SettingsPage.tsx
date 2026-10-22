import React from 'react';
import { Settings, ShieldCheck, CheckCircle2, Lock } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { apiService } from '../services/api';
import { SystemStatusState } from '../types';

interface SettingsPageProps {
  systemStatus: SystemStatusState;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ systemStatus }) => {
  const { health, agent, isLoading } = systemStatus;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header card */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              System Configuration & Environment
            </h2>
            <p className="card-description">
              Verified operational parameters and architectural settings. Secrets and credentials are never exposed to the frontend.
            </p>
          </div>
          <StatusBadge
            status={health?.status === 'healthy' ? 'healthy' : 'inactive'}
            label={health?.status === 'healthy' ? 'System Operational' : 'Offline'}
          />
        </div>
      </div>

      {/* Configuration Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {/* Backend Connectivity */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Settings size={18} style={{ color: 'var(--accent-cyan)' }} />
              API & Backend Connection
            </span>
          </div>

          <table className="data-table">
            <tbody>
              <tr>
                <td style={{ fontWeight: 500, width: '45%' }}>Backend Base URL</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{apiService.getBaseUrl()}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500 }}>Health Check Status</td>
                <td>
                  <StatusBadge
                    status={isLoading ? 'pending' : health?.status === 'healthy' ? 'healthy' : 'error'}
                    label={isLoading ? 'Checking' : health?.status === 'healthy' ? 'HTTP 200 OK' : 'Unavailable'}
                  />
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500 }}>Backend Service Name</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{health?.service || 'safeloop-backend'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500 }}>Backend Version</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{health?.version || '0.1.0'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500 }}>Application Environment</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>development</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* AI Provider Settings */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <ShieldCheck size={18} style={{ color: 'var(--accent-cyan)' }} />
              AI Agent Provider Status
            </span>
          </div>

          <table className="data-table">
            <tbody>
              <tr>
                <td style={{ fontWeight: 500, width: '45%' }}>Provider Identifier</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{agent?.provider || 'google-gemini'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500 }}>Configured Model</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{agent?.model || 'gemini-1.5-flash'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500 }}>Credentials Status</td>
                <td>
                  <span style={{ color: agent?.configured ? 'var(--status-emerald)' : 'var(--text-muted)' }}>
                    {agent?.configured ? 'Present in Backend Environment' : 'Not Configured (Phase 1 Default)'}
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500 }}>Integration State</td>
                <td>
                  <span className="brand-badge">Phase 2 Scheduled</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Architecture Box */}
      <div
        className="card"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderLeft: '3px solid var(--status-emerald)',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <Lock size={20} style={{ color: 'var(--status-emerald)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
              Security & Credential Isolation Policy
            </h4>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              In accordance with SafeLoop AI security principles, all provider credentials (including <code>GEMINI_API_KEY</code>)
              remain strictly isolated in the backend server environment. The frontend client has zero access to private keys or tokens.
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle2 size={13} style={{ color: 'var(--status-emerald)' }} /> No API keys in browser bundle
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle2 size={13} style={{ color: 'var(--status-emerald)' }} /> Strict CORS origin restrictions
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle2 size={13} style={{ color: 'var(--status-emerald)' }} /> Type-safe schema validation
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
