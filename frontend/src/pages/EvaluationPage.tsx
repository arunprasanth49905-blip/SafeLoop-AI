import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  GitCompare,
  Database,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Loader2,
  Info,
  ShieldCheck,
  Eye,
  FileCheck,
} from 'lucide-react';
import { apiService, ApiError } from '../services/api';
import {
  ContinuousEvaluationMetrics,
  EvaluationCaseListResponse,
  EvaluationDatasetRecord,
  EvaluationRunRecord,
  FailureInsightRecord,
  ImprovementRecommendationRecord,
  RunComparisonResponse,
} from '../types';

type ActiveTab = 'overview' | 'runs' | 'compare' | 'insights' | 'recommendations' | 'datasets';

export const EvaluationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExecutingRun, setIsExecutingRun] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Data states
  const [metrics, setMetrics] = useState<ContinuousEvaluationMetrics | null>(null);
  const [datasets, setDatasets] = useState<EvaluationDatasetRecord[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('ds_v1_standard');
  const [datasetCases, setDatasetCases] = useState<EvaluationCaseListResponse | null>(null);
  const [runs, setRuns] = useState<EvaluationRunRecord[]>([]);
  const [selectedRunDetail, setSelectedRunDetail] = useState<EvaluationRunRecord | null>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState<boolean>(false);

  // Comparison states
  const [compareBaseRunId, setCompareBaseRunId] = useState<string>('');
  const [compareCandRunId, setCompareCandRunId] = useState<string>('');
  const [comparisonResult, setComparisonResult] = useState<RunComparisonResponse | null>(null);
  const [isComparing, setIsComparing] = useState<boolean>(false);

  // Insights & Recommendations
  const [insights, setInsights] = useState<FailureInsightRecord[]>([]);
  const [recommendations, setRecommendations] = useState<ImprovementRecommendationRecord[]>([]);
  const [processingRecId, setProcessingRecId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [metricsRes, datasetsRes, runsRes, insightsRes, recsRes] = await Promise.all([
        apiService.getContinuousEvaluationMetrics(),
        apiService.getEvaluationDatasets(),
        apiService.getEvaluationRuns({ limit: 50 }),
        apiService.getFailureInsights(),
        apiService.getImprovementRecommendations(),
      ]);

      setMetrics(metricsRes);
      setDatasets(datasetsRes.datasets);
      setRuns(runsRes.items);
      setInsights(insightsRes.insights);
      setRecommendations(recsRes.recommendations);

      // Default comparison runs if available
      if (runsRes.items.length >= 2) {
        setCompareBaseRunId(runsRes.items[runsRes.items.length - 1].run_id);
        setCompareCandRunId(runsRes.items[0].run_id);
      } else if (runsRes.items.length === 1) {
        setCompareBaseRunId(runsRes.items[0].run_id);
        setCompareCandRunId(runsRes.items[0].run_id);
      }

      if (datasetsRes.datasets.length > 0) {
        const activeDs = datasetsRes.datasets.find((d) => d.status === 'active') || datasetsRes.datasets[0];
        setSelectedDatasetId(activeDs.dataset_id);
        const casesRes = await apiService.getEvaluationCases(activeDs.dataset_id);
        setDatasetCases(casesRes);
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load continuous evaluation data.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load cases when selected dataset changes
  const handleSelectDataset = async (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    try {
      const casesRes = await apiService.getEvaluationCases(datasetId);
      setDatasetCases(casesRes);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load dataset cases.';
      setError(msg);
    }
  };

  // Trigger evaluation run
  const handleExecuteRun = async () => {
    if (!selectedDatasetId) return;
    setIsExecutingRun(true);
    setError(null);
    setActionSuccess(null);
    try {
      const runRecord = await apiService.executeEvaluationRun({
        dataset_id: selectedDatasetId,
      });
      setActionSuccess(`Evaluation run completed successfully (${runRecord.passed_cases}/${runRecord.total_cases} passed).`);
      // Reload runs & metrics
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Evaluation run failed.';
      setError(msg);
    } finally {
      setIsExecutingRun(false);
    }
  };

  // Inspect run details
  const handleInspectRun = async (runId: string) => {
    try {
      const runDetail = await apiService.getEvaluationRunDetail(runId, true);
      setSelectedRunDetail(runDetail);
      setInspectModalOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to retrieve run details.';
      setError(msg);
    }
  };

  // Run comparison
  const handleCompare = async () => {
    if (!compareBaseRunId || !compareCandRunId) {
      setError('Please select both a baseline run and candidate run.');
      return;
    }
    setIsComparing(true);
    setError(null);
    try {
      const result = await apiService.compareEvaluationRuns(compareBaseRunId, compareCandRunId);
      setComparisonResult(result);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Comparison failed.';
      setError(msg);
    } finally {
      setIsComparing(false);
    }
  };

  // Handle recommendation actions
  const handleRecommendationAction = async (recId: string, action: 'accept' | 'reject' | 'create_proposal') => {
    setProcessingRecId(recId);
    setError(null);
    setActionSuccess(null);
    try {
      const updated = await apiService.actOnRecommendation(recId, {
        action,
        notes: `Operator triggered ${action} via Continuous Analytics Dashboard`,
      });
      setActionSuccess(
        action === 'create_proposal'
          ? `Created Phase 5 Improvement Proposal (${updated.linked_proposal_id}). Gatekeeper approval is required before activation.`
          : `Recommendation ${updated.recommendation_id} marked as ${updated.status}.`
      );
      // Refresh recommendations list
      const recsRes = await apiService.getImprovementRecommendations();
      setRecommendations(recsRes.recommendations);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update recommendation.';
      setError(msg);
    } finally {
      setProcessingRecId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Page Header */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <BarChart3 size={24} style={{ color: 'var(--accent-cyan)' }} />
              <h2 style={{ fontSize: '1.3rem', color: 'var(--text-primary)', margin: 0 }}>
                Continuous Evaluation & Analytics
              </h2>
              <span className="brand-badge" style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-cyan)' }}>
                Phase 9
              </span>
            </div>
            <p className="card-description" style={{ margin: 0 }}>
              Empirical tracking of agent quality over time, multi-version comparisons, verified failure patterns, and controlled improvement recommendations.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              className="btn btn-secondary"
              onClick={loadData}
              disabled={isLoading || isExecutingRun}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <RotateCcw size={15} className={isLoading ? 'spin-icon' : ''} />
              Refresh
            </button>
            <button
              className="btn btn-primary"
              onClick={handleExecuteRun}
              disabled={isExecutingRun || isLoading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--accent-cyan)', color: '#090d16', fontWeight: 600 }}
            >
              {isExecutingRun ? (
                <>
                  <Loader2 size={16} className="spin-icon" />
                  Running Evaluation...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Run Evaluation ({selectedDatasetId})
                </>
              )}
            </button>
          </div>
        </div>

        {/* Global Messages */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: '#f87171',
              marginTop: '1rem',
              fontSize: '0.875rem',
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {actionSuccess && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(34, 197, 94, 0.12)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: '#4ade80',
              marginTop: '1rem',
              fontSize: '0.875rem',
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Insufficient Data Warning Banner */}
        {metrics?.insufficient_data && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: '#fbbf24',
              marginTop: '1rem',
              fontSize: '0.85rem',
            }}
          >
            <Info size={18} style={{ flexShrink: 0 }} />
            <span>
              <strong>Limited Sample Size ({metrics.sample_size} cases):</strong> Statistical significance requires at least 5 completed benchmark evaluations. Interpret comparison deltas conservatively.
            </span>
          </div>
        )}
      </div>

      {/* High-Level Continuous Evaluation Metric Cards */}
      <div className="metrics-grid">
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
            Latest Pass Rate
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: metrics?.latest_pass_rate && metrics.latest_pass_rate >= 80 ? '#4ade80' : 'var(--text-primary)' }}>
            {metrics ? `${metrics.latest_pass_rate.toFixed(1)}%` : '—'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Active Run vs Golden Cases
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
            Quality Rubric Score
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
            {metrics ? `${metrics.latest_avg_score.toFixed(1)}%` : '—'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Deterministic & Rubric Criteria
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
            Safety Compliance
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={24} />
            {metrics ? `${metrics.latest_safety_rate.toFixed(1)}%` : '—'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Zero Safety Violations in Benchmark
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
            Average Latency
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {metrics ? `${metrics.latest_latency_ms.toFixed(0)} ms` : '—'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            End-to-End Evaluation Inference
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
            Failure Insights & Recs
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lightbulb size={22} />
            {metrics ? `${metrics.total_insights_count} / ${metrics.pending_recommendations_count}` : '—'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Active Insights / Pending Recs
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
            Configuration Version
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {metrics ? metrics.active_version : '—'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Baseline: {metrics?.baseline_version || 'v1.0.0'}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
        {[
          { id: 'overview', label: 'Performance Breakdown', icon: BarChart3 },
          { id: 'runs', label: 'Evaluation Runs', icon: Layers, count: runs.length },
          { id: 'compare', label: 'Baseline vs Candidate', icon: GitCompare },
          { id: 'insights', label: 'Failure Insights', icon: AlertTriangle, count: insights.length },
          { id: 'recommendations', label: 'Evidence Recommendations', icon: Lightbulb, count: recommendations.length },
          { id: 'datasets', label: 'Evaluation Datasets', icon: Database, count: datasets.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ActiveTab)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1rem',
                backgroundColor: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
                color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                border: isActive ? '1px solid var(--border-subtle)' : '1px solid transparent',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontWeight: isActive ? 600 : 400,
                fontSize: '0.875rem',
              }}
            >
              <Icon size={16} />
              {tab.label}
              {tab.count !== undefined && (
                <span
                  style={{
                    backgroundColor: isActive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '10px',
                    fontSize: '0.75rem',
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & CATEGORY BREAKDOWN */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <BarChart3 size={18} style={{ color: 'var(--accent-cyan)' }} />
                Per-Category Benchmark Accuracy & Rubric Scores
              </span>
            </div>
            {metrics?.per_category_scores && Object.keys(metrics.per_category_scores).length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
                {Object.entries(metrics.per_category_scores).map(([category, score]) => (
                  <div
                    key={category}
                    style={{
                      padding: '1rem',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                        {category.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: score >= 80 ? '#4ade80' : score >= 60 ? '#f59e0b' : '#ef4444' }}>
                        {score.toFixed(1)}%
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, score))}%`,
                          height: '100%',
                          backgroundColor: score >= 80 ? '#4ade80' : score >= 60 ? '#f59e0b' : '#ef4444',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No category scores recorded yet. Execute an evaluation run to populate metrics.
              </div>
            )}
          </div>

          {/* Quick Summary of Failure Insights & Recommendations */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
                  Top Detected Failure Patterns
                </span>
                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }} onClick={() => setActiveTab('insights')}>
                  View All ({insights.length})
                </button>
              </div>
              {insights.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No recurring failure patterns detected.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {insights.slice(0, 3).map((ins) => (
                    <div
                      key={ins.insight_id}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: 'var(--bg-surface-elevated)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{ins.title}</span>
                        <span className="brand-badge" style={{ fontSize: '0.7rem' }}>{ins.supporting_records_count} records</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>{ins.description}</p>
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                        <strong>Action:</strong> {ins.recommended_action}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  <Lightbulb size={18} style={{ color: '#38bdf8' }} />
                  Pending Improvement Recommendations
                </span>
                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }} onClick={() => setActiveTab('recommendations')}>
                  View All ({recommendations.length})
                </button>
              </div>
              {recommendations.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No pending recommendations.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {recommendations.slice(0, 3).map((rec) => (
                    <div
                      key={rec.recommendation_id}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: 'var(--bg-surface-elevated)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{rec.problem_statement}</span>
                        <span className="brand-badge" style={{ fontSize: '0.7rem', textTransform: 'capitalize' }}>{rec.status}</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>
                        <strong>Proposed:</strong> {rec.proposed_change}
                      </p>
                      <div style={{ fontSize: '0.75rem', color: '#4ade80' }}>
                        <strong>Expected:</strong> {rec.expected_benefit}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EVALUATION RUNS TABLE */}
      {activeTab === 'runs' && (
        <div className="card">
          <div className="card-header">
            <div>
              <span className="card-title">
                <Layers size={18} style={{ color: 'var(--accent-cyan)' }} />
                Historical Evaluation Runs
              </span>
              <p className="card-description">
                Repeatable evaluation executions recording dataset version, agent/workflow configuration, pass/fail metrics, and execution latency.
              </p>
            </div>
          </div>

          {runs.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No evaluation runs found. Click "Run Evaluation" to launch the benchmark suite.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Dataset Version</th>
                    <th>Config / Workflow</th>
                    <th>Status</th>
                    <th>Cases (P / F / S)</th>
                    <th>Pass Rate</th>
                    <th>Avg Score</th>
                    <th>Latency</th>
                    <th>Safety</th>
                    <th>Executed At</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.run_id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
                        {r.run_id}
                      </td>
                      <td>
                        <span className="brand-badge">{r.dataset_id} ({r.dataset_version})</span>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {r.configuration_version} / {r.workflow_version}
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor:
                              r.status === 'completed'
                                ? 'rgba(34, 197, 94, 0.15)'
                                : r.status === 'running'
                                ? 'rgba(56, 189, 248, 0.15)'
                                : 'rgba(239, 68, 68, 0.15)',
                            color:
                              r.status === 'completed' ? '#4ade80' : r.status === 'running' ? '#38bdf8' : '#f87171',
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        <span style={{ color: '#4ade80', fontWeight: 600 }}>{r.passed_cases}</span> /{' '}
                        <span style={{ color: '#f87171' }}>{r.failed_cases}</span> /{' '}
                        <span style={{ color: 'var(--text-secondary)' }}>{r.skipped_cases}</span>
                      </td>
                      <td style={{ fontWeight: 600, color: r.pass_rate >= 80 ? '#4ade80' : 'var(--text-primary)' }}>
                        {r.pass_rate.toFixed(1)}%
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{r.avg_score.toFixed(1)}%</td>
                      <td style={{ fontSize: '0.85rem' }}>{r.avg_latency_ms.toFixed(0)} ms</td>
                      <td style={{ fontSize: '0.85rem', color: '#4ade80' }}>{r.safety_pass_rate.toFixed(1)}%</td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {new Date(r.started_at).toLocaleString()}
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          onClick={() => handleInspectRun(r.run_id)}
                        >
                          <Eye size={13} />
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BASELINE VS CANDIDATE COMPARISON */}
      {activeTab === 'compare' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <div className="card-header">
              <div>
                <span className="card-title">
                  <GitCompare size={18} style={{ color: 'var(--accent-cyan)' }} />
                  Baseline vs. Candidate Run Comparison
                </span>
                <p className="card-description">
                  Rigorous comparison of candidate configuration against verified baseline using equivalent dataset evaluation.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
              <div>
                <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Baseline Run
                </label>
                <select
                  value={compareBaseRunId}
                  onChange={(e) => setCompareBaseRunId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="">Select baseline run...</option>
                  {runs.map((r) => (
                    <option key={r.run_id} value={r.run_id}>
                      {r.run_id} ({r.configuration_version} - {r.pass_rate.toFixed(1)}%)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Candidate Run
                </label>
                <select
                  value={compareCandRunId}
                  onChange={(e) => setCompareCandRunId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="">Select candidate run...</option>
                  {runs.map((r) => (
                    <option key={r.run_id} value={r.run_id}>
                      {r.run_id} ({r.configuration_version} - {r.pass_rate.toFixed(1)}%)
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleCompare}
                  disabled={isComparing || !compareBaseRunId || !compareCandRunId}
                  style={{ width: '100%', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  {isComparing ? <Loader2 size={16} className="spin-icon" /> : <GitCompare size={16} />}
                  Compare Runs
                </button>
              </div>
            </div>

            {/* Comparison Results */}
            {comparisonResult && (
              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Validity Notice */}
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: comparisonResult.is_statistically_valid
                      ? 'rgba(34, 197, 94, 0.1)'
                      : 'rgba(245, 158, 11, 0.1)',
                    border: `1px solid ${comparisonResult.is_statistically_valid ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.85rem',
                    color: comparisonResult.is_statistically_valid ? '#4ade80' : '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Info size={16} />
                  <span>
                    <strong>Statistical Validity:</strong> {comparisonResult.comparison_summary} (Sample size: {comparisonResult.sample_size} cases)
                  </span>
                </div>

                {/* Delta Metric Cards */}
                <div className="metrics-grid">
                  <div className="card" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pass Rate Delta</div>
                    <div
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        color:
                          comparisonResult.pass_rate_delta > 0
                            ? '#4ade80'
                            : comparisonResult.pass_rate_delta < 0
                            ? '#f87171'
                            : 'var(--text-primary)',
                      }}
                    >
                      {comparisonResult.pass_rate_delta > 0 ? (
                        <ArrowUpRight size={20} />
                      ) : comparisonResult.pass_rate_delta < 0 ? (
                        <ArrowDownRight size={20} />
                      ) : (
                        <Minus size={20} />
                      )}
                      {comparisonResult.pass_rate_delta > 0 ? '+' : ''}
                      {comparisonResult.pass_rate_delta.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Baseline: {comparisonResult.baseline_run.pass_rate.toFixed(1)}% → Candidate: {comparisonResult.candidate_run.pass_rate.toFixed(1)}%
                    </div>
                  </div>

                  <div className="card" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Rubric Score Delta</div>
                    <div
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        color:
                          comparisonResult.score_delta > 0
                            ? '#4ade80'
                            : comparisonResult.score_delta < 0
                            ? '#f87171'
                            : 'var(--text-primary)',
                      }}
                    >
                      {comparisonResult.score_delta > 0 ? (
                        <ArrowUpRight size={20} />
                      ) : comparisonResult.score_delta < 0 ? (
                        <ArrowDownRight size={20} />
                      ) : (
                        <Minus size={20} />
                      )}
                      {comparisonResult.score_delta > 0 ? '+' : ''}
                      {comparisonResult.score_delta.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Baseline: {comparisonResult.baseline_run.avg_score.toFixed(1)}% → Candidate: {comparisonResult.candidate_run.avg_score.toFixed(1)}%
                    </div>
                  </div>

                  <div className="card" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Latency Delta</div>
                    <div
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        color:
                          comparisonResult.latency_delta_ms < 0
                            ? '#4ade80'
                            : comparisonResult.latency_delta_ms > 100
                            ? '#f87171'
                            : 'var(--text-primary)',
                      }}
                    >
                      {comparisonResult.latency_delta_ms > 0 ? '+' : ''}
                      {comparisonResult.latency_delta_ms.toFixed(0)} ms
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Baseline: {comparisonResult.baseline_run.avg_latency_ms.toFixed(0)}ms → Candidate: {comparisonResult.candidate_run.avg_latency_ms.toFixed(0)}ms
                    </div>
                  </div>

                  <div className="card" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Safety Delta</div>
                    <div
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color: comparisonResult.safety_delta < 0 ? '#f87171' : '#4ade80',
                      }}
                    >
                      {comparisonResult.safety_delta > 0 ? '+' : ''}
                      {comparisonResult.safety_delta.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Zero tolerance for safety regression
                    </div>
                  </div>
                </div>

                {/* Per Category Deltas */}
                {Object.keys(comparisonResult.per_category_deltas).length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                      Per-Category Performance Comparison
                    </h4>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Pass Rate Delta</th>
                          <th>Score Delta</th>
                          <th>Net Assessment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(comparisonResult.per_category_deltas).map(([cat, deltas]) => (
                          <tr key={cat}>
                            <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>{cat.replace('_', ' ')}</td>
                            <td style={{ color: deltas.pass_rate_delta > 0 ? '#4ade80' : deltas.pass_rate_delta < 0 ? '#f87171' : 'inherit' }}>
                              {deltas.pass_rate_delta > 0 ? '+' : ''}{deltas.pass_rate_delta.toFixed(1)}%
                            </td>
                            <td style={{ color: deltas.score_delta > 0 ? '#4ade80' : deltas.score_delta < 0 ? '#f87171' : 'inherit' }}>
                              {deltas.score_delta > 0 ? '+' : ''}{deltas.score_delta.toFixed(1)}%
                            </td>
                            <td>
                              {deltas.pass_rate_delta > 0 || deltas.score_delta > 0 ? (
                                <span style={{ color: '#4ade80', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <ArrowUpRight size={14} /> Improved
                                </span>
                              ) : deltas.pass_rate_delta < 0 || deltas.score_delta < 0 ? (
                                <span style={{ color: '#f87171', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <ArrowDownRight size={14} /> Regressed
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Neutral / Parity</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: FAILURE PATTERNS & INSIGHTS */}
      {activeTab === 'insights' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <div className="card-header">
              <div>
                <span className="card-title">
                  <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
                  Empirical Failure Patterns & Learning Insights
                </span>
                <p className="card-description">
                  Grouped recurring issues discovered across evaluation runs and feedback history. Separates observed facts from inferred causes.
                </p>
              </div>
            </div>

            {insights.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No failure patterns identified in current records.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                {insights.map((ins) => (
                  <div
                    key={ins.insight_id}
                    style={{
                      padding: '1.25rem',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="brand-badge" style={{ textTransform: 'capitalize' }}>{ins.issue_category.replace('_', ' ')}</span>
                          <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{ins.title}</h4>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          ID: {ins.insight_id} • Detected: {new Date(ins.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Confidence:</span>
                        <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{(ins.confidence_strength * 100).toFixed(0)}%</span>
                        <span className="brand-badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                          {ins.supporting_records_count} records
                        </span>
                      </div>
                    </div>

                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem 0' }}>
                      {ins.description}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundColor: 'rgba(0, 0, 0, 0.2)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                        <strong style={{ color: 'var(--accent-cyan)' }}>Recommended Action:</strong> {ins.recommended_action}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Supporting Records:</span>
                        {ins.evidence_references.map((ref, idx) => (
                          <span
                            key={idx}
                            style={{
                              padding: '0.1rem 0.4rem',
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              borderRadius: '3px',
                              fontSize: '0.7rem',
                              fontFamily: 'monospace',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {ref}
                          </span>
                        ))}
                      </div>

                      {ins.relevant_task_categories.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Categories Affected:</span>
                          {ins.relevant_task_categories.map((c, idx) => (
                            <span key={idx} style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>
                              #{c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: EVIDENCE-BASED RECOMMENDATIONS */}
      {activeTab === 'recommendations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <div className="card-header">
              <div>
                <span className="card-title">
                  <Lightbulb size={18} style={{ color: 'var(--accent-cyan)' }} />
                  Evidence-Based Improvement Recommendations
                </span>
                <p className="card-description">
                  Targeted improvements backed by empirical evidence. Changes cannot be activated automatically; operator action routes recommendations into the Phase 5 controlled improvement pipeline for verification.
                </p>
              </div>
            </div>

            {recommendations.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No recommendations generated. Run evaluations to surface evidence-based improvements.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem' }}>
                {recommendations.map((rec) => (
                  <div
                    key={rec.recommendation_id}
                    style={{
                      padding: '1.25rem',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              padding: '0.15rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              backgroundColor:
                                rec.status === 'accepted'
                                  ? 'rgba(34, 197, 94, 0.15)'
                                  : rec.status === 'rejected'
                                  ? 'rgba(239, 68, 68, 0.15)'
                                  : 'rgba(56, 189, 248, 0.15)',
                              color:
                                rec.status === 'accepted' ? '#4ade80' : rec.status === 'rejected' ? '#f87171' : '#38bdf8',
                            }}
                          >
                            {rec.status}
                          </span>
                          <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                            {rec.problem_statement}
                          </h4>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          ID: {rec.recommendation_id} • Confidence: {(rec.confidence_score * 100).toFixed(0)}%
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {rec.linked_proposal_id ? (
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.25rem 0.5rem',
                              backgroundColor: 'rgba(34, 197, 94, 0.15)',
                              border: '1px solid rgba(34, 197, 94, 0.3)',
                              borderRadius: '4px',
                              color: '#4ade80',
                              fontSize: '0.75rem',
                            }}
                          >
                            <FileCheck size={14} />
                            Proposal: {rec.linked_proposal_id}
                          </span>
                        ) : rec.status === 'pending' ? (
                          <>
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: '#f87171' }}
                              onClick={() => handleRecommendationAction(rec.recommendation_id, 'reject')}
                              disabled={processingRecId === rec.recommendation_id}
                            >
                              Reject
                            </button>
                            <button
                              className="btn btn-primary"
                              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', backgroundColor: 'var(--accent-cyan)', color: '#090d16', fontWeight: 600 }}
                              onClick={() => handleRecommendationAction(rec.recommendation_id, 'create_proposal')}
                              disabled={processingRecId === rec.recommendation_id}
                            >
                              {processingRecId === rec.recommendation_id ? (
                                <Loader2 size={13} className="spin-icon" />
                              ) : (
                                'Accept & Create Proposal'
                              )}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem', fontSize: '0.825rem' }}>
                      <div>
                        <strong style={{ color: 'var(--text-primary)' }}>Proposed Modification:</strong>
                        <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>{rec.proposed_change}</p>
                      </div>
                      <div>
                        <strong style={{ color: '#4ade80' }}>Expected Benefit:</strong>
                        <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>{rec.expected_benefit}</p>
                      </div>
                      {rec.potential_risks && (
                        <div>
                          <strong style={{ color: '#f59e0b' }}>Potential Risks:</strong>
                          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>{rec.potential_risks}</p>
                        </div>
                      )}
                    </div>

                    {/* Proposed validation tests */}
                    {rec.proposed_validation_tests.length > 0 && (
                      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.775rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Required Validation Benchmarks:</span>{' '}
                        <span style={{ color: 'var(--accent-cyan)' }}>{rec.proposed_validation_tests.join(', ')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: DATASETS & BENCHMARK CASES */}
      {activeTab === 'datasets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <div className="card-header">
              <div>
                <span className="card-title">
                  <Database size={18} style={{ color: 'var(--accent-cyan)' }} />
                  Evaluation Datasets & Versioning
                </span>
                <p className="card-description">
                  Curated and versioned benchmark sets consisting of deterministic unit validations, rubric criteria, and safety boundary tests.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              {datasets.map((ds) => (
                <button
                  key={ds.dataset_id}
                  onClick={() => handleSelectDataset(ds.dataset_id)}
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: selectedDatasetId === ds.dataset_id ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-surface-elevated)',
                    border: `1px solid ${selectedDatasetId === ds.dataset_id ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    minWidth: '220px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{ds.name}</span>
                    <span className="brand-badge">{ds.version}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    ID: {ds.dataset_id} • Cases: {ds.total_cases}
                  </div>
                </button>
              ))}
            </div>

            {/* Test Cases in Dataset */}
            {datasetCases && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  Test Cases in {datasetCases.dataset_id} ({datasetCases.cases.length} cases)
                </h4>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Case ID</th>
                        <th>Category</th>
                        <th>Method</th>
                        <th>Prompt / Input</th>
                        <th>Validation Criteria</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datasetCases.cases.map((c) => (
                        <tr key={c.case_id}>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
                            {c.case_id}
                          </td>
                          <td>
                            <span className="brand-badge">{c.task_category}</span>
                          </td>
                          <td style={{ fontSize: '0.8rem', textTransform: 'capitalize' }}>
                            {c.evaluation_method.replace('_', ' ')}
                          </td>
                          <td style={{ fontSize: '0.8rem', maxWidth: '300px' }}>
                            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {c.prompt}
                            </div>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {JSON.stringify(c.expected_criteria)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* INSPECT RUN MODAL */}
      {inspectModalOpen && selectedRunDetail && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  Evaluation Run Details: {selectedRunDetail.run_id}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Dataset: {selectedRunDetail.dataset_id} ({selectedRunDetail.dataset_version}) • Config: {selectedRunDetail.configuration_version} • Pass Rate: {selectedRunDetail.pass_rate.toFixed(1)}%
                </span>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setInspectModalOpen(false)}
                style={{ fontSize: '0.8rem' }}
              >
                Close
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Passed</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#4ade80' }}>
                    {selectedRunDetail.passed_cases} / {selectedRunDetail.total_cases}
                  </div>
                </div>
                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Average Score</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                    {selectedRunDetail.avg_score.toFixed(1)}%
                  </div>
                </div>
                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Average Latency</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedRunDetail.avg_latency_ms.toFixed(0)} ms
                  </div>
                </div>
                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Safety Pass Rate</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8' }}>
                    {selectedRunDetail.safety_pass_rate.toFixed(1)}%
                  </div>
                </div>
              </div>

              <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', margin: '0.5rem 0 0 0' }}>
                Individual Case Results ({selectedRunDetail.case_results?.length || 0})
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {selectedRunDetail.case_results && selectedRunDetail.case_results.length > 0 ? (
                  selectedRunDetail.case_results.map((c) => (
                    <div
                      key={c.case_id}
                      style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: 'var(--bg-surface-elevated)',
                        borderRadius: 'var(--radius-md)',
                        borderLeft: `4px solid ${c.status === 'passed' ? '#4ade80' : c.status === 'failed' ? '#f87171' : '#f59e0b'}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-cyan)' }}>
                            {c.case_id}
                          </span>
                          <span className="brand-badge">{c.task_category}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{c.latency_ms.toFixed(0)} ms</span>
                          <span style={{ fontWeight: 600, color: c.status === 'passed' ? '#4ade80' : '#f87171' }}>
                            {c.status.toUpperCase()} ({c.score.toFixed(0)}%)
                          </span>
                        </div>
                      </div>

                      {c.details && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          <strong>Validation:</strong> {c.details}
                        </div>
                      )}

                      {c.response_excerpt && (
                        <div
                          style={{
                            marginTop: '0.4rem',
                            padding: '0.4rem 0.6rem',
                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            color: 'var(--text-primary)',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {c.response_excerpt}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No individual case records found.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
