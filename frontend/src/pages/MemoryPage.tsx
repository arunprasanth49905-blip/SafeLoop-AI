import React, { useEffect, useState, useCallback } from 'react';
import {
  Brain,
  BrainCircuit,
  CheckCircle2,
  Archive,
  Loader2,
  Search,
  RefreshCw,
  Play,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  Plus,
  Eye,
  Activity,
  Check,
  X,
  Zap,
} from 'lucide-react';
import { apiService, ApiError } from '../services/api';
import {
  AgentConfiguration,
  MemoryCandidateCreateRequest,
  MemoryCategory,
  MemoryRecord,
  MemoryRetrievalItem,
  MemoryStats,
} from '../types';

export const MemoryPage: React.FC = () => {
  // Navigation tabs within Memory page
  const [activeTab, setActiveTab] = useState<'active' | 'candidates' | 'archived' | 'inspector' | 'config'>('active');

  // Stats and retrieval toggle
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [retrievalEnabled, setRetrievalEnabled] = useState<boolean>(true);
  const [isTogglingRetrieval, setIsTogglingRetrieval] = useState<boolean>(false);

  // Memories list
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [domainFilter, setDomainFilter] = useState<string>('');

  // Selected memory for inspection modal
  const [selectedMemory, setSelectedMemory] = useState<MemoryRecord | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

  // Action modals / prompts
  const [actionMemoryId, setActionMemoryId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'archive' | null>(null);
  const [actionReason, setActionReason] = useState<string>('');
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);

  // Candidate creation modal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [candidateForm, setCandidateForm] = useState<MemoryCandidateCreateRequest>({
    title: '',
    lesson: '',
    category: 'domain_instruction',
    task_domain: 'general',
    source_type: 'verified_expert',
    confidence_score: 0.85,
  });
  const [isCreatingCandidate, setIsCreatingCandidate] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Live Retrieval Inspector state
  const [testPrompt, setTestPrompt] = useState<string>('How should Python function return types be annotated?');
  const [testDomain, setTestDomain] = useState<string>('python');
  const [isTestingRetrieval, setIsTestingRetrieval] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<MemoryRetrievalItem[] | null>(null);

  // Phase 5 Active Configuration preserved view
  const [activeConfig, setActiveConfig] = useState<AgentConfiguration | null>(null);

  // Auto-clear success notification
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Load stats and config
  const fetchStatsAndConfig = useCallback(async () => {
    try {
      const [statsData, retConfig, configData] = await Promise.all([
        apiService.getMemoryStats(),
        apiService.getMemoryRetrievalConfig(),
        apiService.getActiveConfiguration().catch(() => null),
      ]);
      setStats(statsData);
      setRetrievalEnabled(retConfig.enabled);
      if (configData) setActiveConfig(configData);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load memory stats';
      setError(msg);
    }
  }, []);

  // Load memories based on active view and filters
  const fetchMemories = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let statusParam: string | undefined;
      let validationParam: string | undefined;

      if (activeTab === 'active') {
        statusParam = 'active';
        validationParam = 'approved';
      } else if (activeTab === 'candidates') {
        statusParam = 'candidate';
      } else if (activeTab === 'archived') {
        statusParam = 'archived';
      }

      const res = await apiService.listMemories({
        status: statusParam,
        validation_status: validationParam,
        category: categoryFilter || undefined,
        task_domain: domainFilter || undefined,
        search: searchQuery.trim() || undefined,
        limit: 50,
      });

      setMemories(res.items);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load memory index';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, categoryFilter, domainFilter, searchQuery]);

  useEffect(() => {
    fetchStatsAndConfig();
  }, [fetchStatsAndConfig]);

  useEffect(() => {
    if (activeTab !== 'inspector' && activeTab !== 'config') {
      fetchMemories();
    }
  }, [fetchMemories, activeTab]);

  // Toggle dynamic retrieval
  const handleToggleRetrieval = async () => {
    try {
      setIsTogglingRetrieval(true);
      const updated = await apiService.setMemoryRetrievalConfig(!retrievalEnabled);
      setRetrievalEnabled(updated.enabled);
      setSuccessMessage(
        updated.enabled
          ? 'Adaptive memory retrieval enabled in agent chat.'
          : 'Adaptive memory retrieval disabled. Agent operates on base model rules.'
      );
      fetchStatsAndConfig();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to toggle retrieval configuration';
      setError(msg);
    } finally {
      setIsTogglingRetrieval(false);
    }
  };

  // Inspect Memory Details (fetch full provenance)
  const handleInspectMemory = async (mem: MemoryRecord) => {
    try {
      setIsLoadingDetails(true);
      const detailed = await apiService.getMemoryDetails(mem.id);
      setSelectedMemory(detailed);
    } catch {
      setSelectedMemory(mem);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Lifecycle action handler (approve / reject / archive)
  const handleConfirmAction = async () => {
    if (!actionMemoryId || !actionType) return;
    try {
      setIsSubmittingAction(true);
      setError(null);

      if (actionType === 'approve') {
        await apiService.approveMemory(actionMemoryId, actionReason);
        setSuccessMessage(`Memory candidate ${actionMemoryId} approved and activated.`);
      } else if (actionType === 'reject') {
        await apiService.rejectMemory(actionMemoryId, actionReason);
        setSuccessMessage(`Memory candidate ${actionMemoryId} rejected.`);
      } else if (actionType === 'archive') {
        await apiService.archiveMemory(actionMemoryId, actionReason);
        setSuccessMessage(`Memory ${actionMemoryId} archived.`);
      }

      setActionMemoryId(null);
      setActionType(null);
      setActionReason('');
      if (selectedMemory && selectedMemory.id === actionMemoryId) {
        setSelectedMemory(null);
      }
      fetchStatsAndConfig();
      fetchMemories();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Lifecycle transition failed';
      setError(msg);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Create candidate handler
  const handleCreateCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCreatingCandidate(true);
      setCreateError(null);

      const created = await apiService.createMemoryCandidate(candidateForm);
      setShowCreateModal(false);
      setCandidateForm({
        title: '',
        lesson: '',
        category: 'domain_instruction',
        task_domain: 'general',
        source_type: 'verified_expert',
        confidence_score: 0.85,
      });

      setSuccessMessage(
        created.status === 'rejected'
          ? `Memory screened and rejected by safety policy: ${created.review_notes || 'Safety rule'}`
          : `Memory candidate ${created.id} created successfully!`
      );

      fetchStatsAndConfig();
      fetchMemories();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create memory candidate';
      setCreateError(msg);
    } finally {
      setIsCreatingCandidate(false);
    }
  };

  // Test retrieval simulation
  const handleTestRetrieval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPrompt.trim()) return;
    try {
      setIsTestingRetrieval(true);
      setError(null);
      const res = await apiService.testMemoryRetrieval({
        prompt: testPrompt.trim(),
        task_domain: testDomain || undefined,
        limit: 3,
      });
      setTestResults(res.retrieved);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to execute memory retrieval test';
      setError(msg);
    } finally {
      setIsTestingRetrieval(false);
    }
  };

  const getCategoryBadgeClass = (cat: MemoryCategory) => {
    switch (cat) {
      case 'code_precision':
        return 'badge-cyan';
      case 'formatting_preference':
        return 'badge-violet';
      case 'domain_instruction':
        return 'badge-emerald';
      case 'workflow_correction':
        return 'badge-amber';
      case 'safety_boundary':
        return 'badge-rose';
      default:
        return 'badge-blue';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header and Retrieval Switch Card */}
      <div className="card" style={{ overflow: 'visible' }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(6, 182, 212, 0.15)',
                  color: 'var(--accent-cyan)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Brain size={18} />
              </div>
              <h2 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>
                Persistent Adaptive Memory
              </h2>
              <span className="brand-badge">Phase 6 Engine</span>
            </div>
            <p className="card-description" style={{ margin: 0 }}>
              Selective retrieval of validated lessons and verified operational rules across agent tasks without model retraining.
            </p>
          </div>

          {/* Right Action Bar: Global Retrieval Toggle & Create Candidate */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem' }}
            >
              <Plus size={14} /> New Candidate
            </button>

            <button
              onClick={handleToggleRetrieval}
              disabled={isTogglingRetrieval}
              className={`btn ${retrievalEnabled ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.8125rem',
                minWidth: '170px',
                justifyContent: 'center',
              }}
              title="Click to toggle dynamic memory injection into agent chat"
            >
              {isTogglingRetrieval ? (
                <Loader2 size={15} className="animate-spin" />
              ) : retrievalEnabled ? (
                <ToggleRight size={18} style={{ color: '#fff' }} />
              ) : (
                <ToggleLeft size={18} style={{ color: 'var(--text-muted)' }} />
              )}
              <span>Retrieval: {retrievalEnabled ? 'Active' : 'Disabled'}</span>
            </button>
          </div>
        </div>

        {/* Global Notifications */}
        {successMessage && (
          <div
            style={{
              margin: '0 1.25rem 1rem',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--status-emerald)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        {error && (
          <div
            style={{
              margin: '0 1.25rem 1rem',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: 'var(--status-rose)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Statistics Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
            padding: '1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-elevated)',
          }}
        >
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Total Stored</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {stats?.total_memories ?? 0}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>records</span>
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Active in Runtime</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--status-emerald)' }}>
                {stats?.active_memories ?? 0}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>verified</span>
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Pending Candidates</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--status-amber)' }}>
                {stats?.candidate_memories ?? 0}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>review</span>
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Archived Lessons</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                {stats?.archived_memories ?? 0}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>preserved</span>
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Cumulative Usage</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                {stats?.total_usage ?? 0}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>retrievals</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('active')}
          className={`btn ${activeTab === 'active' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.9rem' }}
        >
          <CheckCircle2 size={14} style={{ marginRight: '0.35rem' }} />
          Active Memories ({stats?.active_memories ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('candidates')}
          className={`btn ${activeTab === 'candidates' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.9rem' }}
        >
          <Activity size={14} style={{ marginRight: '0.35rem' }} />
          Candidates ({stats?.candidate_memories ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('inspector')}
          className={`btn ${activeTab === 'inspector' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.9rem' }}
        >
          <Zap size={14} style={{ marginRight: '0.35rem' }} />
          Live Retrieval Inspector
        </button>

        <button
          onClick={() => setActiveTab('archived')}
          className={`btn ${activeTab === 'archived' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.9rem' }}
        >
          <Archive size={14} style={{ marginRight: '0.35rem' }} />
          Archived ({stats?.archived_memories ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`btn ${activeTab === 'config' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.9rem' }}
        >
          <BrainCircuit size={14} style={{ marginRight: '0.35rem' }} />
          Baseline Guidelines (Phase 5)
        </button>
      </div>

      {/* Search and Filters Bar (for memory lists) */}
      {activeTab !== 'inspector' && activeTab !== 'config' && (
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search title, lesson, or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field"
              style={{ paddingLeft: '2.2rem', fontSize: '0.8125rem', width: '100%' }}
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input-field"
            style={{ width: 'auto', minWidth: '160px', fontSize: '0.8125rem' }}
          >
            <option value="">All Categories</option>
            <option value="domain_instruction">Domain Instruction</option>
            <option value="code_precision">Code Precision</option>
            <option value="formatting_preference">Formatting Preference</option>
            <option value="workflow_correction">Workflow Correction</option>
            <option value="error_prevention">Error Prevention</option>
            <option value="safety_boundary">Safety Boundary</option>
          </select>

          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="input-field"
            style={{ width: 'auto', minWidth: '140px', fontSize: '0.8125rem' }}
          >
            <option value="">All Domains</option>
            <option value="general">General</option>
            <option value="python">Python</option>
            <option value="algorithms">Algorithms</option>
            <option value="formatting">Formatting</option>
            <option value="security">Security</option>
          </select>

          <button
            onClick={fetchMemories}
            className="btn btn-secondary"
            title="Refresh list"
            style={{ padding: '0.5rem 0.75rem' }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      )}

      {/* Main Content Areas */}
      {activeTab === 'inspector' ? (
        /* ================= Live Retrieval Inspector ================= */
        <div className="card">
          <div className="card-header">
            <div>
              <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>
                Dynamic Memory Retrieval Inspector
              </h3>
              <p className="card-description" style={{ margin: 0 }}>
                Test how the task prompt retrieves top active memories, computes relevance scores, and formats supporting context without calling Gemini.
              </p>
            </div>
            <span className={`badge ${retrievalEnabled ? 'badge-emerald' : 'badge-amber'}`}>
              Retrieval {retrievalEnabled ? 'Active' : 'Disabled'}
            </span>
          </div>

          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <form onSubmit={handleTestRetrieval} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Simulated Task Prompt
                </label>
                <textarea
                  rows={3}
                  className="input-field"
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  placeholder="Enter a task prompt to test memory relevance..."
                  style={{ width: '100%', resize: 'vertical', fontSize: '0.85rem' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ flex: '1', maxWidth: '240px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                    Domain Hint (Optional)
                  </label>
                  <select
                    value={testDomain}
                    onChange={(e) => setTestDomain(e.target.value)}
                    className="input-field"
                    style={{ fontSize: '0.8125rem' }}
                  >
                    <option value="">Auto-Detect</option>
                    <option value="python">Python</option>
                    <option value="algorithms">Algorithms</option>
                    <option value="formatting">Formatting</option>
                    <option value="security">Security</option>
                    <option value="general">General</option>
                  </select>
                </div>

                <div style={{ alignSelf: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={isTestingRetrieval}
                    className="btn btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem' }}
                  >
                    {isTestingRetrieval ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Play size={14} />
                    )}
                    <span>Simulate Retrieval</span>
                  </button>
                </div>
              </div>
            </form>

            {/* Test Results */}
            {testResults !== null && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Matched Adaptive Memories ({testResults.length})
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Max 3 injected per task (threshold: &ge; 0.25)
                  </span>
                </div>

                {testResults.length === 0 ? (
                  <div
                    style={{
                      padding: '2rem',
                      textAlign: 'center',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px dashed var(--border-subtle)',
                      color: 'var(--text-muted)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <p style={{ margin: 0, fontWeight: 500 }}>No relevant memories matched this prompt above the relevance threshold.</p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>
                      Agent will safely execute normal inference without extra context injection.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {testResults.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '1rem',
                          backgroundColor: 'var(--bg-surface-elevated)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-subtle)',
                          borderLeft: '4px solid var(--accent-cyan)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                              #{idx + 1} {item.memory.title}
                            </span>
                            <span className={`badge ${getCategoryBadgeClass(item.memory.category)}`}>
                              {item.memory.category}
                            </span>
                          </div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--status-emerald)', fontWeight: 600 }}>
                            Score: {item.relevance_score.toFixed(3)}
                          </span>
                        </div>

                        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-primary)', lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>
                          {item.memory.lesson}
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span>Matched Tokens:</span>
                          {item.matched_keywords.map((kw, ki) => (
                            <span
                              key={ki}
                              style={{
                                padding: '0.1rem 0.4rem',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'rgba(6, 182, 212, 0.12)',
                                color: 'var(--accent-cyan)',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Simulated Prompt Context Preview */}
                    <div style={{ marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                        Simulated Injected Prompt Context:
                      </span>
                      <pre
                        style={{
                          margin: 0,
                          padding: '0.85rem',
                          backgroundColor: 'var(--bg-input)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '0.75rem',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
{`=== RELEVANT VALIDATED LESSONS (Supporting Context) ===
${testResults.map((r, i) => `[${i + 1}] (${r.memory.category} / ${r.memory.task_domain}): ${r.memory.lesson}`).join('\n')}
NOTE: These lessons are supporting context. User instructions and system safety policies take precedence.
=== END SUPPORTING CONTEXT ===

User Request:
${testPrompt}`}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'config' ? (
        /* ================= Phase 5 Baseline Configuration View ================= */
        <div className="card">
          <div className="card-header">
            <div>
              <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>
                Active Baseline System Configuration (Phase 5)
              </h3>
              <p className="card-description" style={{ margin: 0 }}>
                Static versioned behavioral guidelines from the Phase 5 controlled continuous improvement pipeline.
              </p>
            </div>
            {activeConfig && (
              <span className="badge badge-emerald">
                Active: {activeConfig.version}
              </span>
            )}
          </div>

          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {activeConfig ? (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Version</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{activeConfig.version}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Activated At</span>
                    <span style={{ fontSize: '0.8125rem' }}>
                      {activeConfig.activated_at ? new Date(activeConfig.activated_at).toLocaleString() : 'Baseline'}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Proposal ID</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{activeConfig.proposal_id || 'Initial Genesis'}</span>
                  </div>
                </div>

                <div>
                  <h4 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Active Behavioral Guidelines ({activeConfig.instructions.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {activeConfig.instructions.map((inst, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.75rem 1rem',
                          backgroundColor: 'var(--bg-input)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '0.8125rem',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <span style={{ color: 'var(--accent-cyan)', marginRight: '0.5rem' }}>#{idx + 1}</span>
                        {inst}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading active configuration...</p>
            )}
          </div>
        </div>
      ) : (
        /* ================= Memory Record Cards List (Active, Candidates, Archived) ================= */
        <div>
          {isLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
              <p style={{ fontSize: '0.875rem' }}>Loading persistent memory records...</p>
            </div>
          ) : memories.length === 0 ? (
            <div
              style={{
                padding: '3rem',
                textAlign: 'center',
                backgroundColor: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--border-subtle)',
              }}
            >
              <Brain size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 0.75rem' }} />
              <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', margin: '0 0 0.25rem' }}>
                No {activeTab} memories found
              </h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0 0 1rem' }}>
                {activeTab === 'candidates'
                  ? 'No pending candidates awaiting review.'
                  : activeTab === 'archived'
                  ? 'No archived memories in the repository.'
                  : 'No active memories match the current filters.'}
              </p>
              {activeTab === 'candidates' && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem' }}
                >
                  <Plus size={14} /> Create a Candidate
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {memories.map((mem) => (
                <div
                  key={mem.id}
                  className="card"
                  style={{
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {mem.id}
                      </span>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        {mem.title}
                      </h4>
                      <span className={`badge ${getCategoryBadgeClass(mem.category)}`}>
                        {mem.category}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-surface-elevated)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        Domain: {mem.task_domain}
                      </span>
                    </div>

                    {/* Action buttons on card */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleInspectMemory(mem)}
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                        title="View details and provenance logs"
                      >
                        <Eye size={13} /> Inspect
                      </button>

                      {mem.status === 'candidate' && (
                        <>
                          <button
                            onClick={() => {
                              setActionMemoryId(mem.id);
                              setActionType('approve');
                              setActionReason('');
                            }}
                            className="btn btn-primary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                          >
                            <Check size={13} /> Approve
                          </button>
                          <button
                            onClick={() => {
                              setActionMemoryId(mem.id);
                              setActionType('reject');
                              setActionReason('');
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--status-rose)' }}
                          >
                            <X size={13} /> Reject
                          </button>
                        </>
                      )}

                      {mem.status === 'active' && (
                        <button
                          onClick={() => {
                            setActionMemoryId(mem.id);
                            setActionType('archive');
                            setActionReason('');
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                          title="Deactivate and archive memory"
                        >
                          <Archive size={13} /> Archive
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Lesson Rule Text */}
                  <div
                    style={{
                      padding: '0.85rem 1rem',
                      backgroundColor: 'var(--bg-input)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      borderLeft: `3px solid ${mem.status === 'active' ? 'var(--status-emerald)' : 'var(--status-amber)'}`,
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8125rem',
                      color: 'var(--text-primary)',
                      lineHeight: 1.5,
                    }}
                  >
                    {mem.lesson}
                  </div>

                  {/* Card Meta Footer */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      paddingTop: '0.25rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <span>
                        Confidence: <strong style={{ color: 'var(--text-secondary)' }}>{(mem.confidence_score * 100).toFixed(0)}%</strong>
                      </span>
                      <span>
                        Usage Count: <strong style={{ color: 'var(--accent-cyan)' }}>{mem.usage_count}</strong>
                      </span>
                      <span>
                        Last Used: {mem.last_used_at ? new Date(mem.last_used_at).toLocaleDateString() : 'Never'}
                      </span>
                      <span>
                        Source:{' '}
                        {mem.source_feedback_id ? (
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Feedback #{mem.source_feedback_id}</span>
                        ) : mem.source_proposal_id ? (
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Proposal {mem.source_proposal_id}</span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>Verified Expert</span>
                        )}
                      </span>
                    </div>

                    <div>
                      Created: {new Date(mem.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Review Notes / Contradiction warning if present */}
                  {mem.review_notes && mem.status === 'candidate' && (
                    <div
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        color: 'var(--status-amber)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <AlertTriangle size={14} />
                      <span>{mem.review_notes}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= Candidate Creation Modal ================= */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(3px)',
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
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div className="card-header">
              <h3 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', margin: 0 }}>
                Create Memory Candidate
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCandidate} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {createError && (
                <div
                  style={{
                    padding: '0.75rem',
                    backgroundColor: 'rgba(244, 63, 94, 0.12)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    color: 'var(--status-rose)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8125rem',
                  }}
                >
                  {createError}
                </div>
              )}

              <div>
                <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                  Short Title *
                </label>
                <input
                  type="text"
                  required
                  className="input-field"
                  placeholder="e.g. Modern Python Type Hinting Standard"
                  value={candidateForm.title}
                  onChange={(e) => setCandidateForm({ ...candidateForm, title: e.target.value })}
                  style={{ width: '100%', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                  Reusable Lesson or Rule *
                </label>
                <textarea
                  rows={4}
                  required
                  className="input-field"
                  placeholder="Provide the concise, reusable operational rule (max 1500 chars)..."
                  value={candidateForm.lesson}
                  onChange={(e) => setCandidateForm({ ...candidateForm, lesson: e.target.value })}
                  style={{ width: '100%', fontSize: '0.85rem', resize: 'vertical' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Credentials & secrets will be automatically detected and redacted.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                    Category *
                  </label>
                  <select
                    value={candidateForm.category}
                    onChange={(e) => setCandidateForm({ ...candidateForm, category: e.target.value as MemoryCategory })}
                    className="input-field"
                    style={{ width: '100%', fontSize: '0.8125rem' }}
                  >
                    <option value="domain_instruction">Domain Instruction</option>
                    <option value="code_precision">Code Precision</option>
                    <option value="formatting_preference">Formatting Preference</option>
                    <option value="workflow_correction">Workflow Correction</option>
                    <option value="error_prevention">Error Prevention</option>
                    <option value="safety_boundary">Safety Boundary</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                    Task Domain
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. python, algorithms"
                    value={candidateForm.task_domain}
                    onChange={(e) => setCandidateForm({ ...candidateForm, task_domain: e.target.value })}
                    style={{ width: '100%', fontSize: '0.8125rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                  Source Provenance Type *
                </label>
                <select
                  value={candidateForm.source_type}
                  onChange={(e) => setCandidateForm({ ...candidateForm, source_type: e.target.value as any })}
                  className="input-field"
                  style={{ width: '100%', fontSize: '0.8125rem' }}
                >
                  <option value="verified_expert">Verified Expert Knowledge (Manual Verification)</option>
                  <option value="feedback">Approved Feedback Record (Phase 4 Evaluated)</option>
                  <option value="proposal">Approved Improvement Proposal (Phase 5 Regressed)</option>
                </select>
              </div>

              {candidateForm.source_type === 'feedback' && (
                <div>
                  <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                    Source Feedback ID *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    className="input-field"
                    placeholder="e.g. 1"
                    value={candidateForm.source_feedback_id || ''}
                    onChange={(e) => setCandidateForm({ ...candidateForm, source_feedback_id: parseInt(e.target.value) || undefined })}
                    style={{ width: '100%', fontSize: '0.8125rem' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Must be evaluated as "approved" in Phase 4.
                  </span>
                </div>
              )}

              {candidateForm.source_type === 'proposal' && (
                <div>
                  <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                    Source Proposal ID *
                  </label>
                  <input
                    type="text"
                    required
                    className="input-field"
                    placeholder="e.g. prop_abcd1234"
                    value={candidateForm.source_proposal_id || ''}
                    onChange={(e) => setCandidateForm({ ...candidateForm, source_proposal_id: e.target.value })}
                    style={{ width: '100%', fontSize: '0.8125rem' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8125rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingCandidate}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem' }}
                >
                  {isCreatingCandidate ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  <span>Create Candidate</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= Lifecycle Action Reason Modal ================= */}
      {actionMemoryId && actionType && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '440px' }}>
            <div className="card-header">
              <h3 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', margin: 0 }}>
                {actionType === 'approve'
                  ? 'Approve Memory Candidate'
                  : actionType === 'reject'
                  ? 'Reject Memory Candidate'
                  : 'Archive Memory Record'}
              </h3>
              <button
                onClick={() => {
                  setActionMemoryId(null);
                  setActionType(null);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                {actionType === 'approve'
                  ? `Promoting candidate ${actionMemoryId} into active runtime memory. It will become retrievable for future tasks.`
                  : actionType === 'reject'
                  ? `Rejecting candidate ${actionMemoryId}. Please state the reason for rejection.`
                  : `Archiving memory ${actionMemoryId}. It will be deactivated from runtime retrieval while preserving history.`}
              </p>

              <div>
                <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                  Audit Reason / Notes
                </label>
                <textarea
                  rows={2}
                  className="input-field"
                  placeholder={
                    actionType === 'approve'
                      ? 'Verified for correctness and high domain utility.'
                      : actionType === 'reject'
                      ? 'Insufficient evidence or contradicted by safety policy.'
                      : 'Superseded by newer guideline or obsolete standard.'
                  }
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  style={{ width: '100%', fontSize: '0.8125rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setActionMemoryId(null);
                    setActionType(null);
                  }}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8125rem' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAction}
                  disabled={isSubmittingAction}
                  className={`btn ${
                    actionType === 'approve' ? 'btn-primary' : actionType === 'reject' ? 'btn-secondary' : 'btn-secondary'
                  }`}
                  style={{
                    fontSize: '0.8125rem',
                    color: actionType === 'reject' ? 'var(--status-rose)' : undefined,
                  }}
                >
                  {isSubmittingAction ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    `Confirm ${actionType.charAt(0).toUpperCase() + actionType.slice(1)}`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= Detailed Memory Inspector Drawer / Modal ================= */}
      {selectedMemory && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(3px)',
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
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Brain size={18} style={{ color: 'var(--accent-cyan)' }} />
                <h3 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', margin: 0 }}>
                  Memory Details & Provenance
                </h3>
              </div>
              <button
                onClick={() => setSelectedMemory(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>ID & Title</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--accent-cyan)' }}>
                    {selectedMemory.id}
                  </span>
                  <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{selectedMemory.title}</strong>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  Lesson / Behavioral Rule
                </span>
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--bg-input)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8125rem',
                    color: 'var(--text-primary)',
                    lineHeight: 1.5,
                  }}
                >
                  {selectedMemory.lesson}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.75rem',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  padding: '0.85rem',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Category</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{selectedMemory.category}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Task Domain</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{selectedMemory.task_domain}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Confidence</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    {(selectedMemory.confidence_score * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Status</span>
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: selectedMemory.status === 'active' ? 'var(--status-emerald)' : 'var(--status-amber)',
                    }}
                  >
                    {selectedMemory.status} ({selectedMemory.validation_status})
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Usage Count</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                    {selectedMemory.usage_count}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Safety Screening</span>
                  <span style={{ fontSize: '0.8125rem', color: selectedMemory.privacy_safety_passed ? 'var(--status-emerald)' : 'var(--status-rose)' }}>
                    {selectedMemory.privacy_safety_passed ? 'Passed Safe' : 'Flagged Unsafe'}
                  </span>
                </div>
              </div>

              {/* Keywords */}
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Indexed Matching Keywords ({selectedMemory.keywords.length})
                </span>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {selectedMemory.keywords.map((kw, i) => (
                    <span
                      key={i}
                      style={{
                        padding: '0.15rem 0.45rem',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '0.75rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              {/* Provenance Audit History */}
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Lifecycle Provenance & Audit Logs
                </span>
                {isLoadingDetails ? (
                  <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                    <Loader2 size={16} className="animate-spin" />
                  </div>
                ) : selectedMemory.provenance_logs && selectedMemory.provenance_logs.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {selectedMemory.provenance_logs.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          padding: '0.5rem 0.75rem',
                          backgroundColor: 'var(--bg-input)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 600,
                              color: 'var(--accent-cyan)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {log.action}
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>by {log.actor}</span>
                        </div>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>No provenance records.</p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button onClick={() => setSelectedMemory(null)} className="btn btn-secondary" style={{ fontSize: '0.8125rem' }}>
                  Close Inspector
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
