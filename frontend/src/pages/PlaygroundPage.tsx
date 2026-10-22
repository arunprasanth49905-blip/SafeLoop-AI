import React, { useState } from 'react';
import { Send, Bot, AlertCircle, Sparkles, Terminal } from 'lucide-react';
import { SystemStatusState } from '../types';

interface PlaygroundPageProps {
  systemStatus: SystemStatusState;
}

export const PlaygroundPage: React.FC<PlaygroundPageProps> = ({ systemStatus }) => {
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading] = useState<boolean>(false);
  const [error] = useState<string | null>(null);

  const { agent } = systemStatus;
  const isAgentConfigured = agent?.configured ?? false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Intentionally prevented in Phase 1 - never fabricate fake responses
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Informative Phase 2 Notice */}
      <div
        className="card"
        style={{
          borderLeft: '3px solid var(--status-amber)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <AlertCircle size={20} style={{ color: 'var(--status-amber)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
              Gemini Integration Scheduled for Phase 2
            </h4>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              The interactive agent execution loop is disabled in Phase 1. Real prompt processing,
              token streaming, and agentic tool-use will be connected directly to the Google Gemini API
              in Phase 2. No simulated or fake AI responses are generated.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.25rem' }}>
        {/* Prompt Input Form */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Terminal size={18} style={{ color: 'var(--accent-cyan)' }} />
              Agent Prompt Input
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Target: {agent?.model || 'gemini-1.5-flash'}
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="prompt-input" className="form-label">
                Task Instruction or Query
              </label>
              <textarea
                id="prompt-input"
                className="form-textarea"
                placeholder="Enter prompt instructions for the agentic loop (e.g., 'Analyze security logs for abnormal spikes')..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {isAgentConfigured
                  ? 'Key detected • Gemini execution activating in Phase 2'
                  : 'Awaiting Phase 2 Gemini connection'}
              </span>

              <button
                id="btn-send-prompt"
                type="submit"
                className="btn btn-primary"
                disabled={true}
                title="Gemini execution will be enabled in Phase 2"
              >
                <Send size={14} />
                <span>Send (Phase 2)</span>
              </button>
            </div>
          </form>
        </div>

        {/* Response Area */}
        <div className="card" style={{ minHeight: '260px', display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <span className="card-title">
              <Bot size={18} style={{ color: 'var(--accent-cyan)' }} />
              Agent Response
            </span>
            <span className="brand-badge">Awaiting Execution</span>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <span className="status-indicator-dot" style={{ width: '12px', height: '12px' }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Processing task...</span>
              </div>
            ) : error ? (
              <div style={{ color: 'var(--status-rose)', textAlign: 'center', padding: '1.5rem' }}>
                <AlertCircle size={24} style={{ margin: '0 auto 0.5rem auto' }} />
                <p>{error}</p>
              </div>
            ) : (
              <div className="empty-state-card" style={{ border: 'none', background: 'transparent' }}>
                <div className="empty-state-icon">
                  <Sparkles size={22} />
                </div>
                <h4 className="empty-state-title">No Response Generated</h4>
                <p className="empty-state-text">
                  This component is wired and ready for Phase 2. Once Gemini API integration is active,
                  responses, tool reasoning traces, and continuous feedback triggers will render here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
