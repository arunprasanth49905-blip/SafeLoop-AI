import React, { useCallback, useEffect, useState } from 'react';
import {
  GitBranch,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Play,
  RotateCcw,
  Check,
  Sparkles,
  Layers,
  Clock,
  History,
  Loader2,
  Inbox,
  Filter,
} from 'lucide-react';
import { apiService, ApiError } from '../services/api';
import {
  AgentConfiguration,
  AuditLogRecord,
  ImprovementStats,
  ProposalRecord,
  ProposalStatus,
} from '../types';

export const ImprovementPage: React.FC = () => {
  const [stats, setStats] = useState<ImprovementStats | null>(null);
  const [activeConfig, setActiveConfig] = useState<AgentConfiguration | null>(null);
  const [proposals, setProposals] = useState<ProposalRecord[]>([]);
  const [totalProposals, setTotalProposals] = useState<number>(0);
  const [configs, setConfigs] = useState<AgentConfiguration[]>([]);
  const [audits, setAudits] = useState<AuditLogRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeView, setActiveView] = useState<'proposals' | 'versions' | 'audits'>('proposals');

  // Loading & Action states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [actionInProgress, setActionInProgress] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Proposal Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [customHint, setCustomHint] = useState<string>('');
  const [feedbackIdsInput, setFeedbackIdsInput] = useState<string>('');
  const [isCreatingProposal, setIsCreatingProposal] = useState<boolean>(false);

  // Rollback Modal State
  const [showRollbackModal, setShowRollbackModal] = useState<boolean>(false);
  const [rollbackTarget, setRollbackTarget] = useState<string>('');
  const [rollbackReason, setRollbackReason] = useState<string>('');
  const [isRollingBack, setIsRollingBack] = useState<boolean>(false);

  // Fetch all Phase 5 Continuous Improvement data
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const [statsData, activeCfg, proposalList, configList, auditList] = await Promise.all([
        apiService.getImprovementStats(),
        apiService.getActiveConfiguration(),
        apiService.getProposalList({
          limit: 20,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        }),
        apiService.getConfigurationList({ limit: 10 }),
        apiService.getImprovementAudits({ limit: 15 }),
      ]);

      setStats(statsData);
      setActiveConfig(activeCfg);
      setProposals(Array.isArray(proposalList) ? proposalList : (proposalList?.items ?? []));
      setTotalProposals(typeof proposalList?.total === 'number' ? proposalList.total : (Array.isArray(proposalList) ? proposalList.length : (proposalList?.items?.length ?? 0)));
      setConfigs(Array.isArray(configList) ? configList : (configList?.items ?? []));
      setAudits(Array.isArray(auditList) ? auditList : (auditList?.items ?? []));
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to connect to Continuous Improvement backend.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Testing Proposal
  const handleTestProposal = async (proposalId: string) => {
    setActionInProgress((prev) => ({ ...prev, [proposalId]: true }));
    setStatusMessage(null);
    try {
      const updated = await apiService.testProposal(proposalId);
      setProposals((prev) => prev.map((p) => (p.id === proposalId ? updated : p)));
      const updatedStats = await apiService.getImprovementStats();
      setStats(updatedStats);
      setStatusMessage({
        type: 'success',
        text: `Proposal ${proposalId} tested: ${updated.regression_passed ? 'Regression benchmark PASSED (100%)' : 'Regression benchmark FAILED'}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to run regression tests.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setActionInProgress((prev) => ({ ...prev, [proposalId]: false }));
    }
  };

  // Handle Approving Proposal
  const handleApproveProposal = async (proposalId: string) => {
    setActionInProgress((prev) => ({ ...prev, [proposalId]: true }));
    setStatusMessage(null);
    try {
      const updated = await apiService.approveProposal(proposalId, {
        reason: 'Approved after verification of safety & regression checks.',
      });
      setProposals((prev) => prev.map((p) => (p.id === proposalId ? updated : p)));
      const updatedStats = await apiService.getImprovementStats();
      setStats(updatedStats);
      setStatusMessage({
        type: 'success',
        text: `Proposal ${proposalId} approved. Eligible for controlled activation.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to approve proposal.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setActionInProgress((prev) => ({ ...prev, [proposalId]: false }));
    }
  };

  // Handle Rejecting Proposal
  const handleRejectProposal = async (proposalId: string) => {
    setActionInProgress((prev) => ({ ...prev, [proposalId]: true }));
    setStatusMessage(null);
    try {
      const updated = await apiService.rejectProposal(proposalId, {
        reason: 'Rejected by operator.',
      });
      setProposals((prev) => prev.map((p) => (p.id === proposalId ? updated : p)));
      const updatedStats = await apiService.getImprovementStats();
      setStats(updatedStats);
      setStatusMessage({
        type: 'success',
        text: `Proposal ${proposalId} rejected.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to reject proposal.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setActionInProgress((prev) => ({ ...prev, [proposalId]: false }));
    }
  };

  // Handle Activating Proposal
  const handleActivateProposal = async (proposalId: string) => {
    if (!window.confirm('Activate this approved proposal? This will atomically update the active agent behavioral configuration.')) {
      return;
    }
    setActionInProgress((prev) => ({ ...prev, [proposalId]: true }));
    setStatusMessage(null);
    try {
      const newConfig = await apiService.activateProposal(proposalId, {
        reason: 'Controlled activation via Continuous Improvement dashboard.',
      });

      // Reload proposal list, config, and stats
      const [proposalList, newStats, newConfigs, newAudits] = await Promise.all([
        apiService.getProposalList({
          limit: 20,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        }),
        apiService.getImprovementStats(),
        apiService.getConfigurationList({ limit: 10 }),
        apiService.getImprovementAudits({ limit: 15 }),
      ]);
      setProposals(Array.isArray(proposalList) ? proposalList : (proposalList?.items ?? []));
      setActiveConfig(newConfig);
      setStats(newStats);
      setConfigs(Array.isArray(newConfigs) ? newConfigs : (newConfigs?.items ?? []));
      setAudits(Array.isArray(newAudits) ? newAudits : (newAudits?.items ?? []));

      setStatusMessage({
        type: 'success',
        text: `Proposal ${proposalId} activated successfully! Current agent configuration is now ${newConfig.version}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to activate proposal.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setActionInProgress((prev) => ({ ...prev, [proposalId]: false }));
    }
  };

  // Handle Manual Proposal Creation
  const handleCreateProposalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingProposal(true);
    setStatusMessage(null);

    const ids = feedbackIdsInput
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);

    if (ids.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Please enter at least one approved feedback ID (e.g. 1).',
      });
      setIsCreatingProposal(false);
      return;
    }

    try {
      const newProposal = await apiService.generateProposal({
        feedback_ids: ids,
        custom_instruction_hint: customHint.trim() || undefined,
      });

      setShowCreateModal(false);
      setCustomHint('');
      setFeedbackIdsInput('');
      await loadData(true);
      setStatusMessage({
        type: 'success',
        text: `Proposal ${newProposal.id} generated successfully! Safety check: ${
          newProposal.safety_validation_passed ? 'PASSED' : 'FLAGGED'
        }.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to generate proposal.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsCreatingProposal(false);
    }
  };

  // Handle Configuration Rollback
  const handleRollbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRollingBack(true);
    setStatusMessage(null);

    try {
      const rolledBack = await apiService.rollbackConfiguration({
        target_version: rollbackTarget.trim() || undefined,
        reason: rollbackReason.trim() || 'Manual rollback via Continuous Improvement dashboard',
      });

      setShowRollbackModal(false);
      setRollbackTarget('');
      setRollbackReason('');
      await loadData(true);
      setStatusMessage({
        type: 'success',
        text: `Active configuration successfully rolled back to ${rolledBack.version}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to rollback configuration.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsRollingBack(false);
    }
  };

  const getStatusBadge = (status: ProposalStatus) => {
    switch (status) {
      case 'activated':
        return (
          <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <CheckCircle2 size={12} /> Activated
          </span>
        );
      case 'approved':
        return (
          <span className="badge badge-cyan" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <Check size={12} /> Approved
          </span>
        );
      case 'tested':
        return (
          <span className="badge badge-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <Sparkles size={12} /> Tested
          </span>
        );
      case 'rejected':
        return (
          <span className="badge badge-rose" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <XCircle size={12} /> Rejected
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="badge" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
            <Clock size={12} /> Draft
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.35rem', color: 'var(--text-primary)', margin: 0, fontWeight: 700 }}>
                Controlled Continuous Improvement
              </h1>
              <span className="brand-badge">Phase 5</span>
              {activeConfig && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.2rem 0.6rem',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    color: 'var(--status-emerald)',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}
                >
                  <Layers size={13} /> Active: {activeConfig.version}
                </span>
              )}
            </div>
            <p className="card-description" style={{ margin: 0 }}>
              Convert approved human feedback into versioned, testable behavioral improvements with automated safety gates and regression suites.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              style={{ fontSize: '0.8125rem', padding: '0.45rem 0.85rem' }}
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowRollbackModal(true)}
              style={{ fontSize: '0.8125rem', padding: '0.45rem 0.85rem' }}
            >
              <RotateCcw size={14} />
              <span>Rollback Version</span>
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
              style={{ fontSize: '0.8125rem', padding: '0.45rem 0.85rem' }}
            >
              <Sparkles size={14} />
              <span>Propose Improvement</span>
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {statusMessage && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              fontSize: '0.8125rem',
              backgroundColor: statusMessage.type === 'success' ? 'var(--status-emerald-bg)' : 'var(--status-rose-bg)',
              color: statusMessage.type === 'success' ? 'var(--status-emerald)' : 'var(--status-rose)',
              border: `1px solid ${statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
            }}
          >
            {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Active Version</span>
            <Layers size={16} style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <div className="metric-value">{stats?.active_version || 'v1.0.0'}</div>
          <div className="metric-subtext">Immutable active configuration</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Pending / Draft</span>
            <Clock size={16} style={{ color: 'var(--text-secondary)' }} />
          </div>
          <div className="metric-value">{stats?.draft_proposals ?? 0}</div>
          <div className="metric-subtext">Awaiting regression testing</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Tested & Ready</span>
            <Sparkles size={16} style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <div className="metric-value">{stats?.tested_proposals ?? 0}</div>
          <div className="metric-subtext">Passed regression benchmark</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Approved</span>
            <Check size={16} style={{ color: 'var(--status-emerald)' }} />
          </div>
          <div className="metric-value">{stats?.approved_proposals ?? 0}</div>
          <div className="metric-subtext">Eligible for controlled activation</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Activated</span>
            <CheckCircle2 size={16} style={{ color: 'var(--status-emerald)' }} />
          </div>
          <div className="metric-value">{stats?.activated_proposals ?? 0}</div>
          <div className="metric-subtext">Live in active agent runtime</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Rejected</span>
            <XCircle size={16} style={{ color: 'var(--status-rose)' }} />
          </div>
          <div className="metric-value">{stats?.rejected_proposals ?? 0}</div>
          <div className="metric-subtext">Unsafe or failed regression</div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={`btn ${activeView === 'proposals' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveView('proposals')}
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.9rem' }}
        >
          <GitBranch size={14} />
          <span>Improvement Proposals ({totalProposals})</span>
        </button>

        <button
          type="button"
          className={`btn ${activeView === 'versions' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveView('versions')}
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.9rem' }}
        >
          <Layers size={14} />
          <span>Configuration History ({(configs || []).length})</span>
        </button>

        <button
          type="button"
          className={`btn ${activeView === 'audits' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveView('audits')}
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.9rem' }}
        >
          <History size={14} />
          <span>Audit Log ({(audits || []).length})</span>
        </button>
      </div>

      {/* VIEW 1: PROPOSALS */}
      {activeView === 'proposals' && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', margin: 0 }}>
                Continuous Improvement Pipeline
              </h2>
              <p className="card-description" style={{ margin: 0 }}>
                Proposals progress through candidate selection → safety gate → regression testing → review approval → activation.
              </p>
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Filter size={14} style={{ color: 'var(--text-muted)' }} />
              {['all', 'draft', 'tested', 'approved', 'activated', 'rejected'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.25rem 0.55rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: statusFilter === st ? 'var(--accent-cyan)' : 'var(--bg-input)',
                    color: statusFilter === st ? '#000' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: statusFilter === st ? 600 : 400,
                    textTransform: 'capitalize',
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
              <p style={{ fontSize: '0.875rem' }}>Loading improvement proposals...</p>
            </div>
          ) : (proposals || []).length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Inbox size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <p style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                No improvement proposals found
              </p>
              <p style={{ fontSize: '0.8125rem', maxWidth: '440px', margin: '0.25rem auto 1rem' }}>
                Proposals are generated from approved feedback records (Phase 4). Click "Propose Improvement" to create one.
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateModal(true)}
                style={{ fontSize: '0.8125rem' }}
              >
                <Sparkles size={14} />
                <span>Create First Proposal</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 1.25rem' }}>
              {proposals.map((proposal) => {
                const isWorking = actionInProgress[proposal.id] || false;
                const safetyOk = proposal.safety_validation_passed;
                const regression = proposal.regression_results;

                return (
                  <div
                    key={proposal.id}
                    style={{
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.85rem',
                    }}
                  >
                    {/* Proposal Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {proposal.id}
                        </span>
                        {getStatusBadge(proposal.status)}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Base: {proposal.base_version}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Sources: #{proposal.source_feedback_ids.join(', #')}
                        </span>
                      </div>

                      {/* Action Buttons with Strict Lifecycle Gates */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {/* Stage 1: DRAFT -> Test */}
                        {proposal.status === 'draft' && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleTestProposal(proposal.id)}
                            disabled={isWorking}
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                            title="Run automated regression test suite"
                          >
                            {isWorking ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                            <span>Run Regression Tests</span>
                          </button>
                        )}

                        {/* Stage 2: TESTED -> Approve or Reject */}
                        {proposal.status === 'tested' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleApproveProposal(proposal.id)}
                              disabled={isWorking || !proposal.regression_passed}
                              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                              title={proposal.regression_passed ? 'Approve for controlled activation' : 'Cannot approve failing regression'}
                            >
                              {isWorking ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                              <span>Approve</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleRejectProposal(proposal.id)}
                              disabled={isWorking}
                              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', color: 'var(--status-rose)' }}
                            >
                              <XCircle size={12} />
                              <span>Reject</span>
                            </button>
                          </>
                        )}

                        {/* Stage 3: APPROVED -> Activate */}
                        {proposal.status === 'approved' && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleActivateProposal(proposal.id)}
                            disabled={isWorking}
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.35rem 0.85rem',
                              backgroundColor: 'var(--status-emerald)',
                              borderColor: 'var(--status-emerald)',
                              color: '#000',
                              fontWeight: 600,
                            }}
                          >
                            {isWorking ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                            <span>Activate Version</span>
                          </button>
                        )}

                        {/* Activated Indicator */}
                        {proposal.status === 'activated' && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--status-emerald)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <CheckCircle2 size={14} /> Activated as {proposal.activated_version || 'active version'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Proposed Instruction Box */}
                    <div
                      style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: 'var(--bg-card)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        borderLeft: '3px solid var(--accent-cyan)',
                      }}
                    >
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
                        Proposed Behavioral Instruction ({proposal.target_rule_category})
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        {proposal.proposed_instruction}
                      </div>
                    </div>

                    {/* Problem Statement & Expected Benefit */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', fontSize: '0.8125rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Problem: </span>
                        <span style={{ color: 'var(--text-secondary)' }}>{proposal.problem_statement}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Expected Benefit: </span>
                        <span style={{ color: 'var(--text-secondary)' }}>{proposal.expected_benefit}</span>
                      </div>
                    </div>

                    {/* Verification Badges (Safety + Regression) */}
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingTop: '0.4rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.75rem' }}>
                      {/* Safety Gate Indicator */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {safetyOk ? (
                          <>
                            <ShieldCheck size={14} style={{ color: 'var(--status-emerald)' }} />
                            <span style={{ color: 'var(--status-emerald)', fontWeight: 500 }}>Safety Gate: Clean</span>
                          </>
                        ) : (
                          <>
                            <ShieldAlert size={14} style={{ color: 'var(--status-rose)' }} />
                            <span style={{ color: 'var(--status-rose)', fontWeight: 600 }}>
                              Safety Failed: {proposal.safety_flags?.join(', ') || 'Unsafe'}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Regression Suite Results */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {regression ? (
                          proposal.regression_passed ? (
                            <>
                              <CheckCircle2 size={14} style={{ color: 'var(--status-emerald)' }} />
                              <span style={{ color: 'var(--status-emerald)', fontWeight: 500 }}>
                                Regression Suite: {regression.passed_tests}/{regression.total_tests} Passed (100%)
                              </span>
                            </>
                          ) : (
                            <>
                              <XCircle size={14} style={{ color: 'var(--status-rose)' }} />
                              <span style={{ color: 'var(--status-rose)', fontWeight: 600 }}>
                                Regression Suite: {regression.passed_tests}/{regression.total_tests} Passed (Regression Detected)
                              </span>
                            </>
                          )
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>
                            Regression Suite: Not Tested Yet
                          </span>
                        )}
                      </div>

                      {/* Rejection reason if any */}
                      {proposal.rejection_reason && (
                        <div style={{ color: 'var(--status-rose)', fontStyle: 'italic' }}>
                          Rejection: {proposal.rejection_reason}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: ACTIVE & HISTORICAL CONFIGURATIONS */}
      {activeView === 'versions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Active Configuration Card */}
          {activeConfig && (
            <div className="card">
              <div className="card-header">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h2 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', margin: 0 }}>
                      Active Configuration: {activeConfig.version}
                    </h2>
                    <span className="badge badge-emerald">Live In Agent Runtime</span>
                  </div>
                  <p className="card-description" style={{ margin: '0.25rem 0 0' }}>
                    Activated:{' '}
                    {activeConfig.activated_at ? new Date(activeConfig.activated_at).toLocaleString() : 'Baseline'}
                  </p>
                </div>
              </div>

              <div style={{ padding: '0 1.25rem 1.25rem' }}>
                <h4 style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Enforced Behavioral Instructions ({(activeConfig.instructions || []).length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {(activeConfig.instructions || []).map((ins, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '0.65rem 0.85rem',
                        backgroundColor: 'var(--bg-input)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '0.8125rem',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {idx + 1}. {ins}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Version History Table */}
          <div className="card">
            <div className="card-header">
              <h2 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', margin: 0 }}>
                Immutable Configuration Versions
              </h2>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Instructions Count</th>
                    <th>Created From</th>
                    <th>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {(configs || []).map((cfg) => (
                    <tr key={cfg.version}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {cfg.version}
                      </td>
                      <td>
                        {cfg.is_active ? (
                          <span className="badge badge-emerald">Active</span>
                        ) : (
                          <span className="badge" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}>
                            Archived
                          </span>
                        )}
                      </td>
                      <td>{(cfg.instructions || []).length} rules</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {cfg.proposal_id || 'Baseline Genesis'}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(cfg.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: AUDIT TRAIL */}
      {activeView === 'audits' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', margin: 0 }}>
                Continuous Improvement Audit History
              </h2>
              <p className="card-description" style={{ margin: 0 }}>
                Complete verifiable trail of proposal creation, safety checks, test executions, review approvals, and version activations.
              </p>
            </div>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Proposal / Version</th>
                  <th>Audit Details</th>
                </tr>
              </thead>
              <tbody>
                {(audits || []).map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontFamily: 'var(--font-mono)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor:
                            item.action.includes('ACTIVATED')
                              ? 'var(--status-emerald-bg)'
                              : item.action.includes('REJECTED')
                              ? 'var(--status-rose-bg)'
                              : 'var(--bg-input)',
                          color:
                            item.action.includes('ACTIVATED')
                              ? 'var(--status-emerald)'
                              : item.action.includes('REJECTED')
                              ? 'var(--status-rose)'
                              : 'var(--text-secondary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {item.action}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {item.proposal_id || item.version || 'System'}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {item.details || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: CREATE PROPOSAL */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div className="card-header">
              <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-primary)' }}>
                Generate Safe Improvement Proposal
              </h3>
            </div>

            <form onSubmit={handleCreateProposalSubmit} style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Source Feedback ID(s) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1 or 1, 2"
                  value={feedbackIdsInput}
                  onChange={(e) => setFeedbackIdsInput(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                  }}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Only feedback approved by Phase 4 Evaluation will be accepted by the pipeline.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Custom Instruction Hint (Optional, max 400 chars)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. When asked for algorithm complexity, state Best, Worst, and Average case clearly."
                  value={customHint}
                  onChange={(e) => setCustomHint(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8125rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreatingProposal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isCreatingProposal}
                >
                  {isCreatingProposal ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  <span>Generate Proposal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ROLLBACK CONFIGURATION */}
      {showRollbackModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '480px',
              width: '100%',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div className="card-header">
              <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-primary)' }}>
                Rollback Agent Configuration
              </h3>
            </div>

            <form onSubmit={handleRollbackSubmit} style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
                Restore the previous known-good configuration or specify a target version (e.g. <code>v1.0.0</code>).
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Target Version (Leave empty for parent version)
                </label>
                <input
                  type="text"
                  placeholder="e.g. v1.0.0"
                  value={rollbackTarget}
                  onChange={(e) => setRollbackTarget(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Reason for Rollback *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Regressed on edge-case parsing"
                  value={rollbackReason}
                  onChange={(e) => setRollbackReason(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8125rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowRollbackModal(false)}
                  disabled={isRollingBack}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isRollingBack}
                  style={{ backgroundColor: 'var(--status-amber)', borderColor: 'var(--status-amber)', color: '#000' }}
                >
                  {isRollingBack ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  <span>Confirm Rollback</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
