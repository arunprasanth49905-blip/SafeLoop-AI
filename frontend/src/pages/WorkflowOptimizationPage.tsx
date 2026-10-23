import React, { useCallback, useEffect, useState } from 'react';
import {
  Network,
  Cpu,
  ShieldCheck,
  ShieldAlert,
  Play,
  Eye,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Code2,
  BookOpen,
  HelpCircle,
  Clock,
  Sparkles,
  Inbox,
} from 'lucide-react';
import { apiService, ApiError } from '../services/api';
import {
  TaskCategory,
  WorkflowExecutionRecord,
  WorkflowMetrics,
  WorkflowPreviewResponse,
  WorkflowRecord,
  WorkflowToolRecord,
  WorkflowExecuteResponse,
} from '../types';

export const WorkflowOptimizationPage: React.FC = () => {
  const [metrics, setMetrics] = useState<WorkflowMetrics | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [tools, setTools] = useState<WorkflowToolRecord[]>([]);
  const [executions, setExecutions] = useState<WorkflowExecutionRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Interactive Prompt Explorer state
  const [testPrompt, setTestPrompt] = useState<string>('Write a Python function to implement the quicksort algorithm with type hints and test cases.');
  const [requestedOverride, setRequestedOverride] = useState<string>('');
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [previewResult, setPreviewResult] = useState<WorkflowPreviewResponse | null>(null);
  const [executionResult, setExecutionResult] = useState<WorkflowExecuteResponse | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Load backend data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [workflowsData, toolsData, metricsData, executionsData] = await Promise.all([
        apiService.getWorkflows(),
        apiService.getWorkflowTools(),
        apiService.getWorkflowMetrics(),
        apiService.getWorkflowExecutions({ limit: 20 }),
      ]);
      setWorkflows(workflowsData.workflows);
      setTools(toolsData.tools);
      setMetrics(metricsData);
      setExecutions(executionsData.items);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to connect to workflow optimization service.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Preview
  const handlePreview = async () => {
    if (!testPrompt.trim()) return;
    setIsPreviewing(true);
    setPreviewResult(null);
    setError(null);
    try {
      const res = await apiService.previewWorkflow({
        prompt: testPrompt,
        requested_workflow_id: requestedOverride || undefined,
      });
      setPreviewResult(res);
      setActionMessage(`Task successfully classified as ${res.task_category.toUpperCase()} (${Math.round(res.confidence * 100)}% confidence).`);
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to preview workflow selection.');
      }
    } finally {
      setIsPreviewing(false);
    }
  };

  // Handle Execute
  const handleExecute = async () => {
    if (!testPrompt.trim()) return;
    setIsExecuting(true);
    setExecutionResult(null);
    setError(null);
    try {
      const res = await apiService.executeWorkflow({
        prompt: testPrompt,
        workflow_id_override: requestedOverride || undefined,
      });
      setExecutionResult(res);
      setActionMessage(`Workflow '${res.workflow_id}' executed in ${res.latency_ms}ms.`);
      setTimeout(() => setActionMessage(null), 6000);
      // Refresh executions history and metrics
      const [updatedMetrics, updatedExecutions] = await Promise.all([
        apiService.getWorkflowMetrics(),
        apiService.getWorkflowExecutions({ limit: 20 }),
      ]);
      setMetrics(updatedMetrics);
      setExecutions(updatedExecutions.items);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to execute workflow.');
      }
    } finally {
      setIsExecuting(false);
    }
  };

  // Preset buttons
  const setPreset = (promptText: string, override: string = '') => {
    setTestPrompt(promptText);
    setRequestedOverride(override);
    setPreviewResult(null);
    setExecutionResult(null);
  };

  const getCategoryBadgeColor = (category: TaskCategory) => {
    switch (category) {
      case 'coding_debugging':
        return { bg: 'rgba(56, 189, 248, 0.12)', text: 'var(--accent-cyan)', border: 'rgba(56, 189, 248, 0.3)' };
      case 'explanation_learning':
        return { bg: 'rgba(168, 85, 247, 0.12)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' };
      case 'multi_step_reasoning':
        return { bg: 'rgba(245, 158, 11, 0.12)', text: 'var(--status-amber)', border: 'rgba(245, 158, 11, 0.3)' };
      case 'structured_writing':
        return { bg: 'rgba(16, 185, 129, 0.12)', text: 'var(--status-emerald)', border: 'rgba(16, 185, 129, 0.3)' };
      case 'data_analysis':
        return { bg: 'rgba(14, 165, 233, 0.12)', text: '#38bdf8', border: 'rgba(14, 165, 233, 0.3)' };
      case 'ambiguous_unsupported':
        return { bg: 'rgba(244, 63, 94, 0.12)', text: 'var(--status-rose)', border: 'rgba(244, 63, 94, 0.3)' };
      default:
        return { bg: 'var(--bg-input)', text: 'var(--text-secondary)', border: 'var(--border-subtle)' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Card */}
      <div className="card">
        <div
          className="card-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Network size={22} style={{ color: 'var(--accent-cyan)' }} />
              <h2 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', margin: 0, fontWeight: 700 }}>
                Context-Aware Workflow & Tool Optimization
              </h2>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(56, 189, 248, 0.12)',
                  color: 'var(--accent-cyan)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}
              >
                Phase 7 Engine
              </span>
            </div>
            <p className="card-description" style={{ marginTop: '0.4rem', maxWidth: '780px' }}>
              Selects optimal execution strategies based on user task classification, capability permissions, and validated adaptive memories. Enforces strict tool authorization without executing arbitrary code or shell commands.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchData}
            disabled={isLoading}
            style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh Telemetry</span>
          </button>
        </div>
      </div>

      {/* Action Notification */}
      {actionMessage && (
        <div
          className="card"
          style={{
            borderLeft: '3px solid var(--status-emerald)',
            backgroundColor: 'var(--bg-surface)',
            padding: '0.75rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            color: 'var(--status-emerald)',
            fontSize: '0.825rem',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          className="card"
          style={{
            borderLeft: '3px solid var(--status-rose)',
            backgroundColor: 'var(--bg-surface)',
            padding: '0.85rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertCircle size={20} style={{ color: 'var(--status-rose)', flexShrink: 0 }} />
            <div>
              <h4 style={{ fontSize: '0.875rem', color: 'var(--status-rose)', fontWeight: 600, margin: 0 }}>
                Workflow Service Notice
              </h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>{error}</p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchData}
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Key Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
        }}
      >
        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Workflow Executions</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {metrics ? metrics.total_executions : '—'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Telemetry persisted across backend restarts
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Workflow Success Rate</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--status-emerald)', marginTop: '0.25rem' }}>
            {metrics ? `${metrics.success_rate}%` : '—'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Direct task resolution & validation passed
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Safe Fallback Rate</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--status-amber)', marginTop: '0.25rem' }}>
            {metrics ? `${metrics.fallback_rate}%` : '—'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Ambiguous or low-confidence prompts safely routed
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Average Latency</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-cyan)', marginTop: '0.25rem' }}>
            {metrics ? `${metrics.average_latency_ms}ms` : '—'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            End-to-end classification & synthesis time
          </div>
        </div>
      </div>

      {/* Interactive Workflow Explorer & Previewer */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={17} style={{ color: 'var(--accent-cyan)' }} />
              Context-Aware Strategy Selector & Task Playground
            </h3>
            <p className="card-description" style={{ marginTop: '0.2rem' }}>
              Submit a task prompt to test real-time classification, preview workflow routing, and execute under bounded permissions.
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div style={{ padding: '0 1.25rem 0.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '0.25rem' }}>
            Presets:
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPreset('Write a Python function to implement the quicksort algorithm with type hints and test cases.')}
            style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}
          >
            <Code2 size={12} />
            <span>Coding: Quicksort</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPreset('Explain the concept of quantum entanglement and superposition for an engineering student.')}
            style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}
          >
            <BookOpen size={12} />
            <span>Explanation: Quantum</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPreset('Solve this logic puzzle step by step: Three boxes are labeled Apples, Oranges, and Mixed. All labels are incorrect. You draw one fruit from the Mixed box. How do you correctly label all three?')}
            style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}
          >
            <Cpu size={12} />
            <span>Multi-Step: Logic Puzzle</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPreset('ml')}
            style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}
          >
            <HelpCircle size={12} />
            <span>Ambiguous: "ml"</span>
          </button>
        </div>

        <div style={{ padding: '0.5rem 1.25rem 1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <textarea
              className="form-control"
              rows={3}
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="Enter user task prompt to test workflow selection..."
              style={{
                fontFamily: 'inherit',
                fontSize: '0.85rem',
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
                resize: 'vertical',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Workflow Override (Optional):</span>
                <select
                  value={requestedOverride}
                  onChange={(e) => setRequestedOverride(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.75rem',
                  }}
                >
                  <option value="">Auto-Select (Context-Aware)</option>
                  {workflows.map((w) => (
                    <option key={w.workflow_id} value={w.workflow_id}>
                      {w.name} ({w.workflow_id})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handlePreview}
                  disabled={isPreviewing || isExecuting || !testPrompt.trim()}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {isPreviewing ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                  <span>Preview Strategy</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleExecute}
                  disabled={isPreviewing || isExecuting || !testPrompt.trim()}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {isExecuting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  <span>Execute Workflow</span>
                </button>
              </div>
            </div>
          </div>

          {/* Preview Results Panel */}
          {previewResult && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: 'rgba(0,0,0,0.2)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Classified Category:</span>
                  {(() => {
                    const badge = getCategoryBadgeColor(previewResult.task_category);
                    return (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.55rem',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: badge.bg,
                          color: badge.text,
                          border: `1px solid ${badge.border}`,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                        }}
                      >
                        {previewResult.task_category.replace('_', ' ')}
                      </span>
                    );
                  })()}

                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono)',
                      padding: '0.2rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-input)',
                      color: previewResult.confidence >= 0.7 ? 'var(--status-emerald)' : 'var(--status-amber)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {Math.round(previewResult.confidence * 100)}% Confidence
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Routing:</span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: previewResult.fallback_used ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                      color: previewResult.fallback_used ? 'var(--status-amber)' : 'var(--status-emerald)',
                      border: `1px solid ${previewResult.fallback_used ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                    }}
                  >
                    {previewResult.fallback_used ? 'Safe Fallback Activated' : 'Specialized Workflow Selected'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>Target Workflow:</span>
                  <span style={{ color: 'var(--accent-cyan)' }}>{previewResult.workflow_name}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({previewResult.selected_workflow_id} @ {previewResult.workflow_version})</span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                  {previewResult.selection_reason}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <div>
                  <strong>Validated Memories Used:</strong>{' '}
                  {previewResult.relevant_memory_ids.length > 0
                    ? previewResult.relevant_memory_ids.join(', ')
                    : 'None active for this prompt'}
                </div>
                <div>
                  <strong>Permitted Tools:</strong>{' '}
                  {previewResult.permitted_tools.join(', ')}
                </div>
              </div>
            </div>
          )}

          {/* Execution Result Panel */}
          {executionResult && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: 'rgba(0,0,0,0.25)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={16} style={{ color: 'var(--status-emerald)' }} />
                  <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Workflow Execution Output ({executionResult.task_id})
                  </span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      padding: '0.15rem 0.4rem',
                      backgroundColor: 'var(--bg-input)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--accent-cyan)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {executionResult.latency_ms}ms
                  </span>
                </div>

                <span
                  style={{
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    padding: '0.15rem 0.45rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: executionResult.status === 'success' ? 'var(--status-emerald-bg)' : 'var(--status-amber-bg)',
                    color: executionResult.status === 'success' ? 'var(--status-emerald)' : 'var(--status-amber)',
                  }}
                >
                  {executionResult.status}
                </span>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--bg-input)',
                  padding: '0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  maxHeight: '380px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-subtle)',
                  fontFamily: executionResult.task_category === 'coding_debugging' ? 'var(--font-mono)' : 'inherit',
                }}
              >
                {executionResult.response_text}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Registered Workflows Grid */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Cpu size={17} style={{ color: 'var(--accent-cyan)' }} />
            Supported Workflows Registry ({workflows.length})
          </h3>
          <p className="card-description">
            Explicitly configured and registered task execution strategies available for context-aware dispatch.
          </p>
        </div>

        <div
          style={{
            padding: '1.25rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1rem',
          }}
        >
          {workflows.map((wf) => (
            <div
              key={wf.workflow_id}
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>
                    {wf.name}
                  </h4>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontFamily: 'var(--font-mono)',
                      padding: '0.15rem 0.4rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'rgba(56, 189, 248, 0.1)',
                      color: 'var(--accent-cyan)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                    }}
                  >
                    {wf.version}
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0.6rem', lineHeight: 1.4 }}>
                  {wf.description}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.72rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Supported Categories: </span>
                    <span style={{ color: 'var(--accent-cyan)' }}>{wf.supported_categories.join(', ')}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Permitted Tools: </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{wf.permitted_tools.join(', ') || 'None'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Output Convention: </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{wf.expected_output_format}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Timeout: {wf.timeout_seconds}s · Retries: {wf.max_retries}
                </span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    padding: '0.15rem 0.45rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: wf.is_available ? 'var(--status-emerald-bg)' : 'var(--status-rose-bg)',
                    color: wf.is_available ? 'var(--status-emerald)' : 'var(--status-rose)',
                  }}
                >
                  {wf.is_available ? 'Active & Ready' : 'Unavailable'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tool Permission Boundaries Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={17} style={{ color: 'var(--status-emerald)' }} />
            Capability Tools & Authorization Boundaries ({tools.length})
          </h3>
          <p className="card-description">
            Strict allowlist of internal tools and explicit restriction boundaries rejecting unauthorized external execution.
          </p>
        </div>

        <div style={{ overflowX: 'auto', padding: '0 0.25rem 0.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.75rem 1rem', width: '180px' }}>Tool Identifier</th>
                <th style={{ padding: '0.75rem 1rem', width: '120px' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Description & Safety Boundary</th>
                <th style={{ padding: '0.75rem 1rem', width: '130px', textAlign: 'center' }}>Permission</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr key={t.tool_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.tool_id}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.45rem',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: t.is_available ? 'var(--status-emerald-bg)' : 'var(--status-rose-bg)',
                        color: t.is_available ? 'var(--status-emerald)' : 'var(--status-rose)',
                      }}
                    >
                      {t.is_available ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                      <span>{t.status.toUpperCase()}</span>
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>{t.description}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Safety Boundary: {t.safety_boundary}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', textAlign: 'center' }}>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontFamily: 'var(--font-mono)',
                        padding: '0.2rem 0.45rem',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-input)',
                        color: t.is_available ? 'var(--accent-cyan)' : 'var(--text-muted)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {t.is_available ? 'Authorized' : 'Disallowed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Execution Telemetry History Table */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={17} style={{ color: 'var(--accent-cyan)' }} />
              Workflow Execution Telemetry ({executions.length})
            </h3>
            <p className="card-description">
              Auditable records of workflow selections, latency metrics, and safe fallback invocations persisted in SQLite.
            </p>
          </div>
        </div>

        {executions.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Inbox size={28} style={{ margin: '0 auto 0.5rem', opacity: 0.6 }} />
            <p style={{ fontSize: '0.85rem' }}>No workflow executions recorded yet.</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Execute tasks via the Interactive Workflow Explorer above to generate execution records.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', padding: '0 0.25rem 0.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 1rem', width: '130px' }}>Task ID</th>
                  <th style={{ padding: '0.75rem 1rem', width: '160px' }}>Category</th>
                  <th style={{ padding: '0.75rem 1rem', width: '220px' }}>Selected Workflow</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Selection Reason</th>
                  <th style={{ padding: '0.75rem 1rem', width: '100px', textAlign: 'center' }}>Latency</th>
                  <th style={{ padding: '0.75rem 1rem', width: '100px', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((rec) => {
                  const badge = getCategoryBadgeColor(rec.task_category);
                  return (
                    <tr key={rec.id || rec.task_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                        {rec.task_id}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '0.15rem 0.45rem',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: badge.bg,
                            color: badge.text,
                            border: `1px solid ${badge.border}`,
                            textTransform: 'uppercase',
                          }}
                        >
                          {rec.task_category.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.78rem' }}>
                          {rec.workflow_id}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Version: {rec.workflow_version}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.75rem', lineHeight: 1.4 }}>
                          {rec.selection_reason}
                        </p>
                        {rec.fallback_used && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--status-amber)', fontWeight: 600, display: 'block', marginTop: '0.2rem' }}>
                            [Safe Fallback Engaged]
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                        {rec.latency_ms}ms
                      </td>
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            padding: '0.15rem 0.45rem',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: rec.execution_status === 'success' ? 'var(--status-emerald-bg)' : 'var(--status-amber-bg)',
                            color: rec.execution_status === 'success' ? 'var(--status-emerald)' : 'var(--status-amber)',
                          }}
                        >
                          {rec.execution_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
