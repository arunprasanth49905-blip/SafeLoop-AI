import React from 'react';
import { RefreshCw } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { SystemStatusState } from '../types';

interface HeaderProps {
  title: string;
  systemStatus: SystemStatusState;
}

export const Header: React.FC<HeaderProps> = ({ title, systemStatus }) => {
  const { health, isLoading, checkStatus, lastChecked } = systemStatus;

  let connectionStatus: 'connected' | 'disconnected' | 'pending' = 'pending';
  let badgeLabel = 'Checking...';

  if (!isLoading) {
    if (health && health.status === 'healthy') {
      connectionStatus = 'connected';
      badgeLabel = 'Backend Connected';
    } else {
      connectionStatus = 'disconnected';
      badgeLabel = 'Backend Disconnected';
    }
  }

  return (
    <header className="top-header">
      <div className="header-left">
        <h1 className="header-title">{title}</h1>
      </div>

      <div className="header-right">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <StatusBadge status={connectionStatus} label={badgeLabel} />
          {lastChecked && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        <button
          id="btn-refresh-status"
          type="button"
          className="btn btn-secondary"
          onClick={() => checkStatus()}
          disabled={isLoading}
          title="Refresh connection status"
          style={{ padding: '0.4rem 0.65rem' }}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>
    </header>
  );
};
