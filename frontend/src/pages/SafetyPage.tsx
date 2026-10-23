import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  RefreshCw,
  Loader2,
  Clock,
  Activity,
  History,
  Layers,
  Info,
} from 'lucide-react';
import { apiService, ApiError } from '../services/api';
import {
  AlertSeverity,
  AlertStatus,
  BaselineComparisonResponse,
  MonitoringAlertRecord,
  MonitoringMetrics,
  RecoveryEventRecord,
  RegressionBenchmarkResponse,
  SystemHealth,
} from '../types';

export const SafetyPage: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [metrics, setMetrics] = useState<MonitoringMetrics | null>(null);
  const [baselineComparison, setBaselineComparison] = useState<BaselineComparisonResponse | null>(null);
  const [alerts, setAlerts] = useState<MonitoringAlertRecord[]>([]);
  const [recoveryEvents, setRecoveryEvents] = useState<RecoveryEventRecord[]>([]);
  const [latestBenchmark, setLatestBenchmark] = useState<RegressionBenchmarkResponse | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRunningTest, setIsRunningTest] = useState<boolean>(false);
  const [isRollingBack, setIsRollingBack] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters for alerts
  const [alertStatusFilter, setAlertStatusFilter] = useState<AlertStatus | 'all'>('active');
  const [alertSeverityFilter, setAlertSeverityFilter] = useState<AlertSeverity | 'all'>('all');

  // Rollback form state
  const [rollbackTarget, setRollbackTarget] = useState<string>('v1.0.0');
  const [rollbackReason, setRollbackReason] = useState<string>('Rollback to verified baseline due to regression detection');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [healthData, metricsData, baselineData, alertsData, recoveryData] = await Promise.all([
        apiService.getMonitoringHealth(),
        apiService.getMonitoringMetrics(),
        apiService.getBaselineComparison(),
        apiService.getMonitoringAlerts({ limit: 50 }),
        apiService.getRecoveryHistory({ limit: 20 }),
      ]);

      setHealth(healthData);
      setMetrics(metricsData);
      setBaselineComparison(baselineData);
      setAlerts(alertsData.items);
      setRecoveryEvents(recoveryData.events);

      if (baselineData.candidate_benchmark) {
        setLatestBenchmark(baselineData.candidate_benchmark);
      } else if (baselineData.baseline_benchmark) {
        setLatestBenchmark(baselineData.baseline_benchmark);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to connect to regression monitoring service.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Run Regression Suite
  const handleRunRegressionTest = async () => {
    setIsRunningTest(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const runResult = await apiService.runRegressionTest({
        benchmark_name: 'SafeLoop Phase 8 Continuous Regression Suite',
      });
      setLatestBenchmark(runResult);
      setSuccessMessage(
        `Regression Suite executed for ${runResult.version}: ${runResult.pass_rate}% pass rate, ${runResult.safety_violations} safety violations.`
      );
      // Refresh monitoring status and alerts
      await loadData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Regression test run failed.';
      setError(msg);
    } finally {
      setIsRunningTest(false);
    }
  };

  // Acknowledge Alert
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await apiService.acknowledgeAlert(alertId, { operator: 'security_operator' });
      setSuccessMessage(`Alert ${alertId} marked as acknowledged.`);
      await loadData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to acknowledge alert.';
      setError(msg);
    }
  };

  // Resolve Alert
  const handleResolveAlert = async (alertId: string) => {
    const notes = prompt('Enter resolution notes for this regression alert:', 'Verified fix and passed regression suite');
    if (!notes) return;

    try {
      await apiService.resolveAlert(alertId, { operator: 'security_operator', notes });
      setSuccessMessage(`Alert ${alertId} resolved.`);
      await loadData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to resolve alert.';
      setError(msg);
    }
  };

  // Atomic Rollback
  const handleTriggerRollback = async () => {
    if (!rollbackTarget || !rollbackReason) {
      setError('Please provide target version and justification for rollback.');
      return;
    }

    if (!confirm(`Confirm atomic rollback to verified version '${rollbackTarget}'?\nReason: ${rollbackReason}`)) {
      return;
    }

    setIsRollingBack(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await apiService.rollbackKnownGood({
        target_version: rollbackTarget,
        reason: rollbackReason,
        operator: 'authorized_security_lead',
      });
      setSuccessMessage(res.message);
      await loadData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Rollback rejected by safety guardrail.';
      setError(msg);
    } finally {
      setIsRollingBack(false);
    }
  };

  const filteredAlerts = alerts.filter((alt) => {
    if (alertStatusFilter !== 'all' && alt.status !== alertStatusFilter) return false;
    if (alertSeverityFilter !== 'all' && alt.severity !== alertSeverityFilter) return false;
    return true;
  });

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'healthy':
        return (
          <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '0.3rem 0.8rem', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
            <CheckCircle2 size={14} /> System Healthy
          </span>
        );
      case 'degraded':
        return (
          <span style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '0.3rem 0.8rem', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
            <AlertTriangle size={14} /> Degraded Performance
          </span>
        );
      case 'critical':
      case 'regression_detected':
        return (
          <span style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '0.3rem 0.8rem', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
            <ShieldAlert size={14} /> Critical Regression Detected
          </span>
        );
      case 'insufficient_data':
      default:
        return (
          <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', padding: '0.3rem 0.8rem', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
            <Info size={14} /> Insufficient Sample Data
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: 'var(--text-primary)' }}>
      {/* Header Panel */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                <ShieldCheck size={22} />
              </div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>
                Continuous Regression Monitoring & Safety Guardrails
              </h1>
            </div>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', maxWidth: '820px' }}>
              Real-time monitoring perimeter tracking task success, regression test suites, tool allowlists,
              and fail-closed safety guardrails without fine-tuning model weights.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <button
              onClick={loadData}
              disabled={isLoading}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <RefreshCw size={15} className={isLoading ? 'spin-icon' : ''} />
              Refresh Telemetry
            </button>

            <button
              onClick={handleRunRegressionTest}
              disabled={isRunningTest}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#3b82f6', borderColor: '#3b82f6' }}
            >
              {isRunningTest ? <Loader2 size={15} className="spin-icon" /> : <Play size={15} />}
              Run Regression Suite
            </button>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        {metrics?.insufficient_data && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '6px', backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
            <Info size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Sample Limitation Notice:</strong> Only {metrics.sample_size_labeled} verified evaluation sample(s) available (minimum 5 required). Conclusions are treated as provisional to avoid drawing unsupported statistical conclusions.
            </div>
          </div>
        )}
      </div>

      {/* System Health & Version Status Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.5rem' }}>
            Overall System Health
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            {getStatusBadge(health?.overall_status)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Active Critical Alerts: <strong>{String(health?.checks?.active_critical_alerts ?? 0)}</strong>
          </div>

        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.5rem' }}>
            Version Perimeter
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {health?.active_version || 'v1.0.0'}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              (Active)
            </span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Baseline Anchor: <strong>{health?.baseline_version || 'v1.0.0'}</strong>
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.5rem' }}>
            Regression Test Pass Rate
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: (metrics?.regression_pass_rate ?? 100) >= 90 ? '#10b981' : '#ef4444', marginBottom: '0.25rem' }}>
            {metrics?.regression_pass_rate.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {latestBenchmark ? `${latestBenchmark.passed_cases}/${latestBenchmark.total_cases} cases passed` : 'Pending benchmark'}
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.5rem' }}>
            Candidate Activation Gate
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            {health?.can_activate_candidate ? (
              <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600, fontSize: '0.9rem' }}>
                <CheckCircle2 size={16} /> Activation Permitted
              </span>
            ) : (
              <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600, fontSize: '0.9rem' }}>
                <XCircle size={16} /> Blocked by Guardrail
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Safety violations: <strong>{metrics?.safety_validation_failures ?? 0}</strong>
          </div>
        </div>
      </div>

      {/* Real-time Telemetry & Metrics Section */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Activity size={18} color="#3b82f6" />
          Monitored Operational Metrics
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Workflow Success Rate</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0.2rem 0' }}>
              {metrics?.task_success_rate.toFixed(1)}%
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Error rate: {metrics?.workflow_error_rate.toFixed(1)}%
            </div>
          </div>

          <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Workflow Fallback Rate</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0.2rem 0' }}>
              {metrics?.workflow_fallback_rate.toFixed(1)}%
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Threshold max: 35.0%
            </div>
          </div>

          <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Average Latency</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0.2rem 0' }}>
              {metrics?.avg_response_latency_ms.toFixed(0)} ms
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Timeout rate: 0.0%
            </div>
          </div>

          <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Average Evaluation Score</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0.2rem 0' }}>
              {metrics?.avg_evaluation_score.toFixed(1)} / 100
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Labeled samples: {metrics?.sample_size_labeled ?? 0}
            </div>
          </div>

          <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Safety Violations Blocked</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0.2rem 0', color: (metrics?.safety_validation_failures ?? 0) > 0 ? '#ef4444' : '#10b981' }}>
              {metrics?.safety_validation_failures ?? 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Enforced fail-closed
            </div>
          </div>

          <div style={{ padding: '1rem', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Unlabeled Executions</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0.2rem 0' }}>
              {metrics?.sample_size_unlabeled ?? 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Separated from ground truth
            </div>
          </div>
        </div>
      </div>

      {/* Baseline vs Candidate Comparison & Latest Benchmark Results */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={18} color="#3b82f6" />
              Baseline vs Candidate Evaluation ({baselineComparison?.baseline_version} vs {baselineComparison?.candidate_version})
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {baselineComparison?.evaluation_coverage}
            </p>
          </div>
          <div>
            {getStatusBadge(baselineComparison?.status)}
          </div>
        </div>

        {/* Delta Indicators */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Pass Rate Delta</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: (baselineComparison?.pass_rate_delta ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
              {(baselineComparison?.pass_rate_delta ?? 0) >= 0 ? '+' : ''}{baselineComparison?.pass_rate_delta}%
            </div>
          </div>

          <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Safety Delta</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: (baselineComparison?.safety_delta ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
              {(baselineComparison?.safety_delta ?? 0) >= 0 ? '+' : ''}{baselineComparison?.safety_delta}%
            </div>
          </div>

          <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Score Delta</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: (baselineComparison?.quality_score_delta ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
              {(baselineComparison?.quality_score_delta ?? 0) >= 0 ? '+' : ''}{baselineComparison?.quality_score_delta} pts
            </div>
          </div>

          <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Latency Delta</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
              {(baselineComparison?.latency_delta_ms ?? 0) >= 0 ? '+' : ''}{baselineComparison?.latency_delta_ms} ms
            </div>
          </div>
        </div>

        {/* Regression Reasons if detected */}
        {baselineComparison?.regression_detected && (
          <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444' }}>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.25rem' }}>Active Regressions Triggered:</div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.84rem' }}>
              {baselineComparison.regression_reasons.map((r, idx) => (
                <li key={idx}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Individual Benchmark Cases Table */}
        {latestBenchmark?.results_summary && latestBenchmark.results_summary.length > 0 && (
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Deterministic Test Case Results ({latestBenchmark.benchmark_name}):
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.5rem' }}>Case ID</th>
                    <th style={{ padding: '0.5rem' }}>Test Case Name</th>
                    <th style={{ padding: '0.5rem' }}>Result</th>
                    <th style={{ padding: '0.5rem' }}>Quality Score</th>
                    <th style={{ padding: '0.5rem' }}>Latency</th>
                    <th style={{ padding: '0.5rem' }}>Diagnostic Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {latestBenchmark.results_summary.map((c) => (
                    <tr key={c.task_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '0.5rem', fontFamily: 'monospace', color: '#60a5fa' }}>{c.task_id}</td>
                      <td style={{ padding: '0.5rem' }}>{c.name}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {c.passed ? (
                          <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                            <CheckCircle2 size={13} /> Passed
                          </span>
                        ) : (
                          <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                            <XCircle size={13} /> Failed
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem' }}>{c.quality_score}</td>
                      <td style={{ padding: '0.5rem' }}>{c.latency_ms} ms</td>
                      <td style={{ padding: '0.5rem', color: c.details ? '#f87171' : 'var(--text-secondary)' }}>
                        {c.details || 'Assertion criteria satisfied.'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Deduplicated Regression Alerts Center */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldAlert size={18} color="#f59e0b" />
              Monitoring Alerts & Deduplication Queue ({filteredAlerts.length})
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Alerts are automatically deduplicated by rule and version to prevent alert flooding.
            </p>
          </div>

          {/* Alert Filters */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select
              value={alertStatusFilter}
              onChange={(e) => setAlertStatusFilter(e.target.value as any)}
              className="form-control"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>

            <select
              value={alertSeverityFilter}
              onChange={(e) => setAlertSeverityFilter(e.target.value as any)}
              className="form-control"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
        </div>

        {filteredAlerts.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'rgba(255, 255, 255, 0.01)', borderRadius: '8px' }}>
            <CheckCircle2 size={24} style={{ color: '#10b981', marginBottom: '0.5rem' }} />
            <div style={{ fontWeight: 600 }}>No alerts matching the selected filters.</div>
            <div style={{ fontSize: '0.82rem' }}>All monitored metrics are operating within allowed tolerance thresholds.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredAlerts.map((alt) => {
              const isCrit = alt.severity === 'critical';
              const isWarn = alt.severity === 'warning';
              return (
                <div
                  key={alt.alert_id}
                  style={{
                    padding: '1rem',
                    borderRadius: '8px',
                    border: `1px solid ${isCrit ? 'rgba(239, 68, 68, 0.3)' : isWarn ? 'rgba(245, 158, 11, 0.3)' : 'var(--border-color)'}`,
                    backgroundColor: isCrit ? 'rgba(239, 68, 68, 0.04)' : isWarn ? 'rgba(245, 158, 11, 0.04)' : 'rgba(255, 255, 255, 0.01)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          backgroundColor: isCrit ? 'rgba(239, 68, 68, 0.2)' : isWarn ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                          color: isCrit ? '#ef4444' : isWarn ? '#f59e0b' : '#3b82f6',
                        }}
                      >
                        {alt.severity}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{alt.rule_id}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>({alt.alert_id})</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        <Clock size={12} /> {new Date(alt.created_at).toLocaleTimeString()}
                      </span>
                      <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)' }}>
                        Status: <strong>{alt.status}</strong>
                      </span>
                    </div>
                  </div>

                  <p style={{ margin: '0.3rem 0 0.5rem 0', fontSize: '0.85rem' }}>
                    {alt.explanation}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '0.5rem' }}>
                    <div>
                      Observed: <strong>{alt.observed_value}</strong> | Threshold: <strong>{alt.threshold_value}</strong> | Version: <strong>{alt.related_version}</strong> | Samples: <strong>{alt.sample_size}</strong>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {alt.status === 'active' && (
                        <button
                          onClick={() => handleAcknowledgeAlert(alt.alert_id)}
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                        >
                          Acknowledge
                        </button>
                      )}
                      {alt.status !== 'resolved' && (
                        <button
                          onClick={() => handleResolveAlert(alt.alert_id)}
                          className="btn btn-primary"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', backgroundColor: '#10b981', borderColor: '#10b981' }}
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conservative Automatic Safeguards & Atomic Rollback */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <RotateCcw size={18} color="#3b82f6" />
          Conservative Atomic Rollback & Safeguard Recovery
        </h2>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
          Rollback transitions are strictly atomic and restricted to verified known-good versions. Failing candidates and unverified configurations are rejected.
        </p>

        {/* Rollback Trigger Form */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem', padding: '1rem', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              Target Verified Version:
            </label>
            <input
              type="text"
              value={rollbackTarget}
              onChange={(e) => setRollbackTarget(e.target.value)}
              className="form-control"
              placeholder="e.g. v1.0.0"
              style={{ fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              Auditable Justification:
            </label>
            <input
              type="text"
              value={rollbackReason}
              onChange={(e) => setRollbackReason(e.target.value)}
              className="form-control"
              placeholder="Reason for safeguard activation"
              style={{ fontSize: '0.85rem' }}
            />
          </div>

          <button
            onClick={handleTriggerRollback}
            disabled={isRollingBack}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
          >
            {isRollingBack ? <Loader2 size={15} className="spin-icon" /> : <RotateCcw size={15} />}
            Trigger Rollback
          </button>
        </div>

        {/* Auditable Recovery Event History */}
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <History size={14} />
            Auditable Safeguard & Rollback History ({recoveryEvents.length} events):
          </div>

          {recoveryEvents.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.5rem 0' }}>
              No automated or manual safeguard recoveries have been triggered yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.5rem' }}>Event ID</th>
                    <th style={{ padding: '0.5rem' }}>Action</th>
                    <th style={{ padding: '0.5rem' }}>Transition</th>
                    <th style={{ padding: '0.5rem' }}>Status</th>
                    <th style={{ padding: '0.5rem' }}>Reason</th>
                    <th style={{ padding: '0.5rem' }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {recoveryEvents.map((ev) => (
                    <tr key={ev.event_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '0.5rem', fontFamily: 'monospace', color: '#60a5fa' }}>{ev.event_id}</td>
                      <td style={{ padding: '0.5rem', fontWeight: 600, textTransform: 'capitalize' }}>{ev.action}</td>
                      <td style={{ padding: '0.5rem' }}>{ev.from_version} &rarr; {ev.to_version}</td>
                      <td style={{ padding: '0.5rem' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            backgroundColor: ev.status === 'completed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: ev.status === 'completed' ? '#10b981' : '#ef4444',
                            fontWeight: 600,
                          }}
                        >
                          {ev.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem' }}>{ev.reason}</td>
                      <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{new Date(ev.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
