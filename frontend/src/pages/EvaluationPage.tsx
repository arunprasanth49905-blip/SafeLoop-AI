import React from 'react';
import { BarChart3, Info } from 'lucide-react';
import { MetricPlaceholder } from '../components/MetricPlaceholder';

export const EvaluationPage: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Information Header */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              Continuous Evaluation Benchmarks
            </h2>
            <p className="card-description">
              Empirical tracking of agent performance, regression resistance, and alignment metrics across learning cycles.
            </p>
          </div>
          <span className="brand-badge">Phase 7 Roadmap</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--bg-surface-elevated)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            marginTop: '0.5rem',
          }}
        >
          <Info size={18} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            No benchmark runs have been executed. In Phase 7, the evaluation suite will execute continuous regression tests, latency profiling, and accuracy benchmarks against baseline datasets.
          </p>
        </div>
      </div>

      {/* Benchmark Metric Placeholders */}
      <div>
        <h3 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Benchmark Metrics (Awaiting Phase 7 Benchmark Suite)
        </h3>
        <div className="metrics-grid">
          <MetricPlaceholder
            label="Task Success Rate"
            subtext="No benchmark runs recorded"
          />
          <MetricPlaceholder
            label="Accuracy"
            subtext="Baseline not yet established"
          />
          <MetricPlaceholder
            label="User Satisfaction"
            subtext="Awaiting feedback signals"
          />
          <MetricPlaceholder
            label="Latency"
            subtext="Awaiting inference profiling"
          />
          <MetricPlaceholder
            label="Consistency"
            subtext="Requires multi-turn test sets"
          />
          <MetricPlaceholder
            label="Regression Rate"
            subtext="Zero regressions recorded"
          />
        </div>
      </div>

      {/* Benchmark Summary Table Placeholder */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <BarChart3 size={18} style={{ color: 'var(--accent-cyan)' }} />
            Benchmark Suites
          </span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Suite Name</th>
              <th>Target Domain</th>
              <th>Test Cases</th>
              <th>Status</th>
              <th>Last Run</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Core Reasoning & Instructions</td>
              <td>General Agent Tasks</td>
              <td>—</td>
              <td><span className="brand-badge">Scheduled (Phase 7)</span></td>
              <td>—</td>
            </tr>
            <tr>
              <td>Safety & Guardrail Compliance</td>
              <td>Adversarial Defenses</td>
              <td>—</td>
              <td><span className="brand-badge">Scheduled (Phase 7)</span></td>
              <td>—</td>
            </tr>
            <tr>
              <td>Memory Retention & Transfer</td>
              <td>Continuous Adaptation</td>
              <td>—</td>
              <td><span className="brand-badge">Scheduled (Phase 7)</span></td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
