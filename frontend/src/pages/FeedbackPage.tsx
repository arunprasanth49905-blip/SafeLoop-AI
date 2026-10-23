import React, { useCallback, useEffect, useState } from 'react';
import {
  MessageSquarePlus,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  RefreshCw,
  AlertCircle,
  Inbox,
  ChevronLeft,
  ChevronRight,
  Clock,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Award,
  Play,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { apiService, ApiError } from '../services/api';
import { FeedbackRecord, FeedbackStats, EvaluationStats, EvaluationDecision } from '../types';

export const FeedbackPage: React.FC = () => {
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [evalStats, setEvalStats] = useState<EvaluationStats | null>(null);
  const [records, setRecords] = useState<FeedbackRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [filterRating, setFilterRating] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [evaluatingIds, setEvaluatingIds] = useState<Record<number, boolean>>({});
  const [proposingIds, setProposingIds] = useState<Record<number, boolean>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [statsData, evalStatsData, listData] = await Promise.all([
        apiService.getFeedbackStats(),
        apiService.getEvaluationStats(),
        apiService.getFeedbackList({
          limit: pageSize,
          offset: (page - 1) * pageSize,
          rating: filterRating !== 'all' ? filterRating : undefined,
        }),
      ]);

      setStats(statsData);
      setEvalStats(evalStatsData);
      setRecords(listData.items);
      setTotalRecords(listData.total);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load feedback and evaluation records from the backend.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, filterRating]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilterChange = (newRating: string) => {
    setFilterRating(newRating);
    setPage(1);
  };

  const handleEvaluate = async (feedbackId: number) => {
    if (evaluatingIds[feedbackId]) return;
    setEvaluatingIds((prev) => ({ ...prev, [feedbackId]: true }));
    setActionMessage(null);
    setError(null);
    try {
      const evaluation = await apiService.evaluateFeedback(feedbackId);
      // Refresh record from backend to guarantee complete sync
      let updatedRecord: FeedbackRecord | null = null;
      try {
        updatedRecord = await apiService.getFeedbackById(feedbackId);
      } catch {
        // Fallback to evaluation response if getFeedbackById encounters network issue
      }

      setRecords((prev) =>
        prev.map((rec) => {
          if (rec.id !== feedbackId) return rec;
          if (updatedRecord) {
            return {
              ...updatedRecord,
              evaluation,
            };
          }
          return {
            ...rec,
            evaluation,
            evaluation_status: 'evaluated',
            decision: evaluation.decision,
            explanation: evaluation.explanation,
            quality_score: evaluation.quality_score,
            is_safe: evaluation.is_safe,
            relevance_score: evaluation.relevance_score,
            evidence_score: evaluation.evidence_score,
            specificity_score: evaluation.specificity_score,
            consistency_score: evaluation.consistency_score,
            non_duplication_score: evaluation.non_duplication_score,
            evaluated_at: evaluation.evaluated_at,
            evaluation_decision: evaluation.decision,
            reason: evaluation.explanation,
          };
        })
      );

      // Refresh evaluation stats and feedback stats
      try {
        const [updatedEvalStats, updatedStats] = await Promise.all([
          apiService.getEvaluationStats(),
          apiService.getFeedbackStats(),
        ]);
        setEvalStats(updatedEvalStats);
        setStats(updatedStats);
      } catch {
        // Ignore stats fetch failure
      }

      setActionMessage(
        `Feedback #${feedbackId} successfully evaluated: ${evaluation.decision.toUpperCase().replace('_', ' ')} (Score: ${evaluation.quality_score}/100).`
      );
      setTimeout(() => setActionMessage(null), 6000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(`Failed to evaluate feedback #${feedbackId}.`);
      }
    } finally {
      setEvaluatingIds((prev) => ({ ...prev, [feedbackId]: false }));
    }
  };

  const handleEvaluateAllPending = async () => {
    const unevaluated = records.filter(
      (r) => !(r.evaluation?.decision || r.decision || r.evaluation_decision)
    );
    if (unevaluated.length === 0) return;

    for (const r of unevaluated) {
      await handleEvaluate(r.id);
    }
  };

  const handleCreateProposal = async (feedbackId: number) => {
    if (proposingIds[feedbackId]) return;
    setProposingIds((prev) => ({ ...prev, [feedbackId]: true }));
    setActionMessage(null);
    setError(null);
    try {
      const proposal = await apiService.generateProposal({
        feedback_ids: [feedbackId],
      });
      setActionMessage(
        `Improvement proposal ${proposal.id} created for feedback #${feedbackId}! Check Continuous Improvement tab.`
      );
      setTimeout(() => setActionMessage(null), 8000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(`Failed to create proposal for feedback #${feedbackId}.`);
      }
    } finally {
      setProposingIds((prev) => ({ ...prev, [feedbackId]: false }));
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  const formatTimestamp = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const unevaluatedCount = records.filter(
    (r) => !(r.evaluation?.decision || r.decision || r.evaluation_decision)
  ).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header Card */}
      <div className="card">
        <div
          className="card-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}
        >
          <div>
            <h2 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageSquarePlus size={20} style={{ color: 'var(--accent-cyan)' }} />
              Feedback Evaluation & Quality Scoring Engine
            </h2>
            <p className="card-description" style={{ marginTop: '0.25rem' }}>
              Phase 4 continuous assessment repository evaluating human critique signals, calculating 0–100 quality scores, and enforcing hard safety gates without retraining.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {unevaluatedCount > 0 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleEvaluateAllPending}
                disabled={isLoading}
                style={{ fontSize: '0.8125rem', padding: '0.45rem 0.85rem' }}
                title="Evaluate all unassessed feedback records on current page"
              >
                <Play size={13} />
                <span>Evaluate Pending ({unevaluatedCount})</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={fetchData}
              disabled={isLoading}
              style={{ fontSize: '0.8125rem', padding: '0.45rem 0.85rem' }}
              title="Refresh feedback metrics and evaluations"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              <span>{isLoading ? 'Refreshing...' : 'Refresh Data'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          className="card"
          style={{
            borderLeft: '3px solid var(--status-emerald)',
            backgroundColor: 'var(--bg-surface)',
            padding: '0.75rem 1rem',
            fontSize: '0.8125rem',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircle2 size={16} style={{ color: 'var(--status-emerald)' }} />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Phase 4: Evaluation Summary Metric Cards */}
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
          Quality Evaluation & Safety Summary (Phase 4)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          {/* Total Evaluated */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Total Evaluated
              </span>
              <div
                style={{
                  padding: '0.35rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(56, 189, 248, 0.1)',
                  color: 'var(--accent-cyan)',
                }}
              >
                <Award size={16} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.5rem' }}>
              {evalStats ? evalStats.total_evaluated : '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Processed by {evalStats && evalStats.total_evaluated > 0 ? 'v1.0.0-rules' : 'rule engine'}
            </div>
          </div>

          {/* Approved */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Approved
              </span>
              <div
                style={{
                  padding: '0.35rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--status-emerald-bg)',
                  color: 'var(--status-emerald)',
                }}
              >
                <CheckCircle2 size={16} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--status-emerald)', marginTop: '0.5rem' }}>
              {evalStats ? evalStats.approved_count : '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Safe & well-supported
            </div>
          </div>

          {/* Needs Review */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Needs Review
              </span>
              <div
                style={{
                  padding: '0.35rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--status-amber-bg)',
                  color: 'var(--status-amber)',
                }}
              >
                <AlertTriangle size={16} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--status-amber)', marginTop: '0.5rem' }}>
              {evalStats ? evalStats.needs_review_count : '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Ambiguous / low evidence
            </div>
          </div>

          {/* Rejected */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Rejected
              </span>
              <div
                style={{
                  padding: '0.35rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--status-rose-bg)',
                  color: 'var(--status-rose)',
                }}
              >
                <XCircle size={16} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--status-rose)', marginTop: '0.5rem' }}>
              {evalStats ? evalStats.rejected_count : '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Unsafe or irrelevant
            </div>
          </div>

          {/* Average Quality Score */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Avg Quality Score
              </span>
              <div
                style={{
                  padding: '0.35rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(56, 189, 248, 0.1)',
                  color: 'var(--accent-cyan)',
                }}
              >
                <Award size={16} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-cyan)', marginTop: '0.5rem' }}>
              {evalStats ? `${evalStats.average_quality_score}` : '—'}
              <span style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--text-muted)' }}>/100</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Normalized quality
            </div>
          </div>
        </div>
      </div>

      {/* Raw Feedback Volume Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Submissions</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {stats ? stats.total_count : '—'}
          </div>
        </div>
        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Helpful Submissions</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--status-emerald)', marginTop: '0.25rem' }}>
            {stats ? stats.helpful_count : '—'}
          </div>
        </div>
        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Not Helpful Submissions</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--status-rose)', marginTop: '0.25rem' }}>
            {stats ? stats.not_helpful_count : '—'}
          </div>
        </div>
        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Correction Demonstrations</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-cyan)', marginTop: '0.25rem' }}>
            {stats ? stats.correction_count : '—'}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          className="card"
          style={{
            borderLeft: '3px solid var(--status-rose)',
            backgroundColor: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertCircle size={20} style={{ color: 'var(--status-rose)', flexShrink: 0 }} />
            <div>
              <h4 style={{ fontSize: '0.875rem', color: 'var(--status-rose)', fontWeight: 600 }}>
                Feedback Error
              </h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{error}</p>
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

      {/* Records Table and Filter */}
      <div className="card">
        <div
          className="card-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="card-title">Recorded Feedback Submissions & Quality Evaluations</span>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '0.15rem 0.5rem',
                backgroundColor: 'var(--border-subtle)',
                borderRadius: '10px',
                color: 'var(--text-secondary)',
              }}
            >
              {totalRecords}
            </span>
          </div>

          {/* Rating Filter Tabs */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn ${filterRating === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleFilterChange('all')}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
            >
              All ({stats?.total_count ?? 0})
            </button>
            <button
              type="button"
              className={`btn ${filterRating === 'helpful' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleFilterChange('helpful')}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
            >
              Helpful ({stats?.helpful_count ?? 0})
            </button>
            <button
              type="button"
              className={`btn ${filterRating === 'not_helpful' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleFilterChange('not_helpful')}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
            >
              Not Helpful ({stats?.not_helpful_count ?? 0})
            </button>
            <button
              type="button"
              className={`btn ${filterRating === 'correction' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleFilterChange('correction')}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
            >
              Corrections ({stats?.correction_count ?? 0})
            </button>
          </div>
        </div>

        {/* Content Area */}
        {isLoading && records.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: 'var(--accent-cyan)' }} />
            <p style={{ fontSize: '0.875rem' }}>Loading feedback submissions and evaluation records...</p>
          </div>
        ) : records.length === 0 ? (
          <div
            style={{
              padding: '3rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'rgba(56, 189, 248, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-cyan)',
              }}
            >
              <Inbox size={24} />
            </div>
            <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              No Feedback Records Found
            </h4>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.5 }}>
              {filterRating !== 'all'
                ? `There are no records matching the "${filterRating}" rating filter.`
                : 'No feedback submissions have been stored yet. Submit task feedback in the AI Playground to populate the database.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.8125rem',
                  textAlign: 'left',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      fontSize: '0.7rem',
                    }}
                  >
                    <th style={{ padding: '0.75rem 1rem', width: '120px' }}>Rating</th>
                    <th style={{ padding: '0.75rem 1rem', width: '130px' }}>Task ID</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Feedback Content</th>
                    <th style={{ padding: '0.75rem 1rem', width: '180px' }}>Quality & Safety</th>
                    <th style={{ padding: '0.75rem 1rem', width: '220px' }}>Decision & Explanation</th>
                    <th style={{ padding: '0.75rem 1rem', width: '120px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const isHelpful = record.rating === 'helpful';
                    const isNotHelpful = record.rating === 'not_helpful';
                    const isCorrection = record.rating === 'correction';
                    const isEvaluating = !!evaluatingIds[record.id];

                    // Robustly resolve evaluation values from nested object or top-level properties
                    const evalDecision: EvaluationDecision | undefined =
                      record.evaluation?.decision || record.decision || record.evaluation_decision || undefined;
                    const evalExplanation: string | undefined =
                      record.evaluation?.explanation || record.explanation || record.reason || undefined;
                    const evalQualityScore: number | null | undefined =
                      record.evaluation?.quality_score ?? record.quality_score;
                    const evalIsSafe: boolean | null | undefined =
                      record.evaluation?.is_safe ?? record.is_safe;
                    const safetyFlags: string[] =
                      record.evaluation?.safety_flags || record.safety_flags || [];
                    const safetyReason: string | null | undefined =
                      record.evaluation?.safety_reason ?? record.safety_reason;
                    const relevanceScore = record.evaluation?.relevance_score ?? record.relevance_score;
                    const evidenceScore = record.evaluation?.evidence_score ?? record.evidence_score;
                    const specificityScore = record.evaluation?.specificity_score ?? record.specificity_score;
                    const consistencyScore = record.evaluation?.consistency_score ?? record.consistency_score;
                    const nonDuplicationScore = record.evaluation?.non_duplication_score ?? record.non_duplication_score;

                    const isEvaluated = Boolean(
                      evalDecision ||
                      record.evaluation ||
                      record.evaluation_status === 'evaluated'
                    );

                    return (
                      <tr
                        key={record.id}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          transition: 'background-color 150ms ease',
                        }}
                      >
                        {/* Rating Badge */}
                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'top' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.25rem 0.55rem',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              backgroundColor: isHelpful
                                ? 'var(--status-emerald-bg)'
                                : isNotHelpful
                                ? 'var(--status-rose-bg)'
                                : 'rgba(56, 189, 248, 0.1)',
                              color: isHelpful
                                ? 'var(--status-emerald)'
                                : isNotHelpful
                                ? 'var(--status-rose)'
                                : 'var(--accent-cyan)',
                              border: `1px solid ${
                                isHelpful
                                  ? 'rgba(16, 185, 129, 0.25)'
                                  : isNotHelpful
                                  ? 'rgba(244, 63, 94, 0.25)'
                                  : 'rgba(56, 189, 248, 0.25)'
                              }`,
                            }}
                          >
                            {isHelpful && <ThumbsUp size={11} />}
                            {isNotHelpful && <ThumbsDown size={11} />}
                            {isCorrection && <Edit3 size={11} />}
                            <span>
                              {isHelpful ? 'Helpful' : isNotHelpful ? 'Not Helpful' : 'Correction'}
                            </span>
                          </span>
                        </td>

                        {/* Task ID */}
                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'top' }}>
                          {record.task_id ? (
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                padding: '0.2rem 0.4rem',
                                backgroundColor: 'var(--bg-input)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-subtle)',
                                display: 'inline-block',
                              }}
                            >
                              {record.task_id}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                          )}
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={11} />
                            <span>{formatTimestamp(record.created_at)}</span>
                          </div>
                        </td>

                        {/* Feedback Content */}
                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {record.comment && (
                              <p style={{ color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                                {record.comment}
                              </p>
                            )}

                            {record.correction && (
                              <div
                                style={{
                                  marginTop: record.comment ? '0.25rem' : 0,
                                  padding: '0.5rem 0.75rem',
                                  backgroundColor: 'rgba(56, 189, 248, 0.05)',
                                  borderRadius: 'var(--radius-sm)',
                                  borderLeft: '3px solid var(--accent-cyan)',
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '0.7rem',
                                    color: 'var(--accent-cyan)',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    display: 'block',
                                    marginBottom: '0.2rem',
                                  }}
                                >
                                  Suggested Correction:
                                </span>
                                <p
                                  style={{
                                    color: 'var(--text-primary)',
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '0.75rem',
                                    whiteSpace: 'pre-wrap',
                                    margin: 0,
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {record.correction}
                                </p>
                              </div>
                            )}

                            {!record.comment && !record.correction && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                Rating recorded without additional commentary.
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Quality Score & Safety (Phase 4) */}
                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'top' }}>
                          {isEvaluated && ((evalQualityScore !== null && evalQualityScore !== undefined) || (evalIsSafe !== null && evalIsSafe !== undefined)) ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              {/* Quality Score Badge - only when score exists */}
                              {evalQualityScore !== null && evalQualityScore !== undefined && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  <span
                                    style={{
                                      fontSize: '0.8125rem',
                                      fontWeight: 700,
                                      fontFamily: 'var(--font-mono)',
                                      color:
                                        evalQualityScore >= 70
                                          ? 'var(--status-emerald)'
                                          : evalQualityScore >= 40
                                          ? 'var(--status-amber)'
                                          : 'var(--status-rose)',
                                      padding: '0.15rem 0.4rem',
                                      backgroundColor: 'var(--bg-input)',
                                      borderRadius: 'var(--radius-sm)',
                                      border: '1px solid var(--border-subtle)',
                                    }}
                                  >
                                    {evalQualityScore}/100
                                  </span>
                                </div>
                              )}

                              {/* Safety Indicator - only when safety result exists */}
                              {evalIsSafe !== null && evalIsSafe !== undefined && (
                                <div>
                                  {evalIsSafe ? (
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        fontSize: '0.7rem',
                                        color: 'var(--status-emerald)',
                                      }}
                                    >
                                      <ShieldCheck size={12} />
                                      <span>Safe</span>
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        fontSize: '0.7rem',
                                        color: 'var(--status-rose)',
                                        fontWeight: 600,
                                      }}
                                    >
                                      <ShieldAlert size={12} />
                                      <span>Unsafe: {safetyFlags.length > 0 ? safetyFlags.join(', ') : safetyReason || 'Gate Failed'}</span>
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Score Breakdown (All 5 Authoritative Dimensions) */}
                              {relevanceScore !== undefined && (
                                <div
                                  style={{
                                    fontSize: '0.6875rem',
                                    color: 'var(--text-muted)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.15rem',
                                    marginTop: '0.2rem',
                                    lineHeight: 1.35,
                                  }}
                                  title={`Total Score: ${evalQualityScore}/100\nFormula: Relevance (${relevanceScore}/25) + Evidence (${evidenceScore ?? 0}/20) + Specificity (${specificityScore ?? 0}/20) + Consistency (${consistencyScore ?? 0}/20) + Non-Duplication (${nonDuplicationScore ?? 0}/15)`}
                                >
                                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    <span>Rel: <strong style={{ color: 'var(--text-secondary)' }}>{relevanceScore}</strong>/25</span>
                                    <span>·</span>
                                    <span>Ev: <strong style={{ color: 'var(--text-secondary)' }}>{evidenceScore ?? '—'}</strong>/20</span>
                                    <span>·</span>
                                    <span>Spec: <strong style={{ color: 'var(--text-secondary)' }}>{specificityScore ?? '—'}</strong>/20</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    <span>Cons: <strong style={{ color: 'var(--text-secondary)' }}>{consistencyScore ?? '—'}</strong>/20</span>
                                    <span>·</span>
                                    <span>Dup: <strong style={{ color: 'var(--text-secondary)' }}>{nonDuplicationScore ?? '—'}</strong>/15</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                fontStyle: 'italic',
                              }}
                            >
                              Pending Evaluation
                            </span>
                          )}
                        </td>

                        {/* Decision & Explanation (Phase 4) */}
                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'top', maxWidth: '300px', wordBreak: 'break-word' }}>
                          {isEvaluated && evalDecision ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              {/* Decision Badge */}
                              <div>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.03em',
                                    backgroundColor:
                                      evalDecision === 'approved'
                                        ? 'var(--status-emerald-bg)'
                                        : evalDecision === 'needs_review'
                                        ? 'var(--status-amber-bg)'
                                        : 'var(--status-rose-bg)',
                                    color:
                                      evalDecision === 'approved'
                                        ? 'var(--status-emerald)'
                                        : evalDecision === 'needs_review'
                                        ? 'var(--status-amber)'
                                        : 'var(--status-rose)',
                                    border: `1px solid ${
                                      evalDecision === 'approved'
                                        ? 'rgba(16, 185, 129, 0.3)'
                                        : evalDecision === 'needs_review'
                                        ? 'rgba(245, 158, 11, 0.3)'
                                        : 'rgba(244, 63, 94, 0.3)'
                                    }`,
                                  }}
                                >
                                  {evalDecision === 'approved' && <CheckCircle2 size={11} />}
                                  {evalDecision === 'needs_review' && <AlertTriangle size={11} />}
                                  {evalDecision === 'rejected' && <XCircle size={11} />}
                                  <span>{evalDecision.replace('_', ' ')}</span>
                                </span>
                              </div>

                              {/* Short Explanation */}
                              <p
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--text-secondary)',
                                  margin: 0,
                                  lineHeight: 1.45,
                                  wordBreak: 'break-word',
                                }}
                              >
                                {evalExplanation
                                  ? evalExplanation.replace(/^(Approved|Needs Review|Rejected)\s*\((.*)\)\.?$/i, '$2').trim() || evalExplanation
                                  : (evalDecision === 'approved'
                                      ? 'Meets the quality requirements and passed safety checks.'
                                      : evalDecision === 'needs_review'
                                      ? 'More evidence or clarification is needed before approval.'
                                      : 'Does not meet the configured safety or quality requirements.')}
                              </p>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <div>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '0.72rem',
                                    fontWeight: 500,
                                    backgroundColor: 'var(--bg-input)',
                                    color: 'var(--text-muted)',
                                    border: '1px solid var(--border-subtle)',
                                  }}
                                >
                                  Not Evaluated
                                </span>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                This feedback has not been evaluated yet.
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Action Column */}
                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'top', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleEvaluate(record.id)}
                            disabled={isEvaluating}
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.35rem 0.65rem',
                              whiteSpace: 'nowrap',
                            }}
                            title={isEvaluated ? 'Re-evaluate with latest rules' : 'Evaluate feedback quality and safety'}
                          >
                            {isEvaluating ? (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                <span>Evaluating...</span>
                              </>
                            ) : isEvaluated ? (
                              <>
                                <RefreshCw size={11} />
                                <span>Re-evaluate</span>
                              </>
                            ) : (
                              <>
                                <Play size={11} />
                                <span>Evaluate</span>
                              </>
                            )}
                          </button>

                          {evalDecision === 'approved' && (
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleCreateProposal(record.id)}
                              disabled={proposingIds[record.id]}
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.35rem 0.65rem',
                                whiteSpace: 'nowrap',
                                marginTop: '0.35rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}
                              title="Generate an improvement proposal from this approved feedback"
                            >
                              {proposingIds[record.id] ? (
                                <>
                                  <Loader2 size={11} className="animate-spin" />
                                  <span>Proposing...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles size={11} />
                                  <span>Propose</span>
                                </>
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderTop: '1px solid var(--border-subtle)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                }}
              >
                <span>
                  Showing page {page} of {totalPages} ({totalRecords} records)
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || isLoading}
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                  >
                    <ChevronLeft size={13} />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || isLoading}
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                  >
                    <span>Next</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
