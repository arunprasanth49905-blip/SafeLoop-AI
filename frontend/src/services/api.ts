/**
 * SafeLoop AI API Client
 * Provides typed methods for contacting the FastAPI backend services.
 */

import {
  AgentConfiguration,
  AgentStatusResponse,
  AuditListResponse,
  ChatRequest,
  ChatResponse,
  ConfigurationComparison,
  EvaluationListResponse,
  EvaluationRecord,
  EvaluationStats,
  FeedbackCreateRequest,
  FeedbackListResponse,
  FeedbackRecord,
  FeedbackStats,
  HealthResponse,
  ImprovementStats,
  MemoryCandidateCreateRequest,
  MemoryListResponse,
  MemoryRecord,
  MemoryRetrievalConfig,
  MemoryRetrievalTestRequest,
  MemoryRetrievalTestResponse,
  MemoryStats,
  ProposalActionRequest,
  ProposalCreateRequest,
  ProposalListResponse,
  ProposalRecord,
  AlertActionRequest,
  AlertListResponse,
  BaselineComparisonResponse,
  MonitoringAlertRecord,
  MonitoringMetrics,
  RecoveryHistoryResponse,
  RegressionBenchmarkResponse,
  RegressionTestRunRequest,
  RollbackRequest,
  SystemHealth,
  TaskClassificationResponse,
  ToolExecuteRequest,
  ToolExecuteResponse,
  WorkflowExecuteRequest,
  WorkflowExecuteResponse,
  WorkflowExecutionListResponse,
  WorkflowListResponse,
  WorkflowMetrics,
  WorkflowPreviewRequest,
  WorkflowPreviewResponse,
  WorkflowRecord,
  WorkflowToolsListResponse,
  ContinuousEvaluationMetrics,
  DatasetListResponse,
  EvaluationCaseCreateRequest,
  EvaluationCaseListResponse,
  EvaluationCaseRecord,
  EvaluationDatasetRecord,
  EvaluationRunListResponse,
  EvaluationRunRecord,
  EvaluationRunRequest,
  FailureInsightsListResponse,
  ImprovementRecommendationRecord,
  RecommendationActionRequest,
  RecommendationsListResponse,
  RunComparisonResponse,
} from '../types';


const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001'
).replace(/\/+$/, '');

export class ApiError extends Error {
  public status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {}),
      },
    });
    return response;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${timeoutMs}ms`, 504);
    }
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new ApiError(`Failed to connect to backend at ${API_BASE_URL}: ${message}`);
  } finally {
    clearTimeout(id);
  }
}

export const apiService = {
  getBaseUrl(): string {
    return API_BASE_URL;
  },

  /**
   * Fetches backend health status from GET /health
   */
  async getHealth(): Promise<HealthResponse> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/health`, {}, 5000);
    if (!response.ok) {
      throw new ApiError(`Health check returned status ${response.status}`, response.status);
    }
    return (await response.json()) as HealthResponse;
  },

  /**
   * Fetches AI Agent provider status from GET /api/agent/status
   */
  async getAgentStatus(): Promise<AgentStatusResponse> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/agent/status`, {}, 5000);
    if (!response.ok) {
      throw new ApiError(`Agent status check returned status ${response.status}`, response.status);
    }
    return (await response.json()) as AgentStatusResponse;
  },

  /**
   * Executes an AI task/chat prompt via POST /api/agent/chat
   */
  async executeChat(payload: ChatRequest): Promise<ChatResponse> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/agent/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      35000 // 35-second timeout for model inference
    );

    if (!response.ok) {
      let detailMsg = `Agent request failed with status ${response.status}`;
      try {
        const errorJson = await response.json();
        if (errorJson && typeof errorJson.detail === 'string') {
          detailMsg = errorJson.detail;
        } else if (errorJson && Array.isArray(errorJson.detail)) {
          // Pydantic validation errors
          detailMsg = errorJson.detail.map((d: { msg?: string }) => d.msg || 'Invalid field').join(', ');
        }
      } catch {
        // Fallback to text status
      }
      throw new ApiError(detailMsg, response.status);
    }

    return (await response.json()) as ChatResponse;
  },

  /**
   * Submits user feedback via POST /api/feedback
   */
  async submitFeedback(payload: FeedbackCreateRequest): Promise<FeedbackRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/feedback`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      8000
    );

    if (!response.ok) {
      let detailMsg = `Failed to submit feedback (${response.status})`;
      try {
        const errorJson = await response.json();
        if (errorJson && typeof errorJson.detail === 'string') {
          detailMsg = errorJson.detail;
        } else if (errorJson && Array.isArray(errorJson.detail)) {
          detailMsg = errorJson.detail.map((d: { msg?: string }) => d.msg || 'Invalid field').join(', ');
        }
      } catch {
        // Fallback to generic message
      }
      throw new ApiError(detailMsg, response.status);
    }

    return (await response.json()) as FeedbackRecord;
  },

  /**
   * Retrieves paginated feedback records via GET /api/feedback
   */
  async getFeedbackList(params: {
    limit?: number;
    offset?: number;
    task_id?: string;
    rating?: string;
  } = {}): Promise<FeedbackListResponse> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    if (params.task_id) query.set('task_id', params.task_id);
    if (params.rating) query.set('rating', params.rating);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/feedback${queryString}`, {}, 8000);

    if (!response.ok) {
      throw new ApiError(`Failed to fetch feedback records (${response.status})`, response.status);
    }

    return (await response.json()) as FeedbackListResponse;
  },

  /**
   * Retrieves aggregate feedback statistics via GET /api/feedback/stats
   */
  async getFeedbackStats(): Promise<FeedbackStats> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/feedback/stats`, {}, 8000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch feedback statistics (${response.status})`, response.status);
    }
    return (await response.json()) as FeedbackStats;
  },

  /**
   * Retrieves a single feedback record by ID via GET /api/feedback/{id}
   */
  async getFeedbackById(id: number): Promise<FeedbackRecord> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/feedback/${id}`, {}, 8000);
    if (!response.ok) {
      throw new ApiError(`Feedback record #${id} not found`, response.status);
    }
    return (await response.json()) as FeedbackRecord;
  },

  /**
   * Evaluates a feedback record via POST /api/evaluations/evaluate/{feedback_id} (Phase 4)
   */
  async evaluateFeedback(feedbackId: number): Promise<EvaluationRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/evaluations/evaluate/${feedbackId}`,
      { method: 'POST' },
      10000
    );

    if (!response.ok) {
      let detailMsg = `Failed to evaluate feedback #${feedbackId} (${response.status})`;
      try {
        const errorJson = await response.json();
        if (errorJson && typeof errorJson.detail === 'string') {
          detailMsg = errorJson.detail;
        }
      } catch {
        // Fallback
      }
      throw new ApiError(detailMsg, response.status);
    }

    return (await response.json()) as EvaluationRecord;
  },

  /**
   * Retrieves aggregate evaluation statistics via GET /api/evaluations/stats (Phase 4)
   */
  async getEvaluationStats(): Promise<EvaluationStats> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/evaluations/stats`, {}, 8000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch evaluation statistics (${response.status})`, response.status);
    }
    return (await response.json()) as EvaluationStats;
  },

  /**
   * Retrieves paginated evaluation records via GET /api/evaluations (Phase 4)
   */
  async getEvaluationList(params: {
    limit?: number;
    offset?: number;
    decision?: string;
  } = {}): Promise<EvaluationListResponse> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    if (params.decision) query.set('decision', params.decision);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/evaluations${queryString}`, {}, 8000);

    if (!response.ok) {
      throw new ApiError(`Failed to fetch evaluation records (${response.status})`, response.status);
    }

    return (await response.json()) as EvaluationListResponse;
  },

  /**
   * Retrieves evaluation for a specific feedback ID via GET /api/evaluations/feedback/{id}
   */
  async getEvaluationByFeedbackId(feedbackId: number): Promise<EvaluationRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/evaluations/feedback/${feedbackId}`,
      {},
      8000
    );
    if (!response.ok) {
      throw new ApiError(`No evaluation found for feedback #${feedbackId}`, response.status);
    }
    return (await response.json()) as EvaluationRecord;
  },

  /**
   * Phase 5: Continuous Improvement Endpoints
   */

  /**
   * Retrieves summary statistics for Continuous Improvement via GET /api/improvements/stats
   */
  async getImprovementStats(): Promise<ImprovementStats> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/improvements/stats`, {}, 8000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch improvement statistics (${response.status})`, response.status);
    }
    return (await response.json()) as ImprovementStats;
  },

  /**
   * Generates a new improvement proposal from approved feedback via POST /api/improvements/proposals/generate
   */
  async generateProposal(payload: ProposalCreateRequest): Promise<ProposalRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/improvements/proposals/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      15000
    );

    if (!response.ok) {
      let detailMsg = `Failed to generate proposal (${response.status})`;
      try {
        const errorJson = await response.json();
        if (errorJson && typeof errorJson.detail === 'string') {
          detailMsg = errorJson.detail;
        }
      } catch {
        // Fallback
      }
      throw new ApiError(detailMsg, response.status);
    }

    return (await response.json()) as ProposalRecord;
  },

  /**
   * Retrieves list of improvement proposals via GET /api/improvements/proposals
   */
  async getProposalList(params: {
    limit?: number;
    offset?: number;
    status?: string;
  } = {}): Promise<ProposalListResponse> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    if (params.status) query.set('status', params.status);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/improvements/proposals${queryString}`, {}, 8000);

    if (!response.ok) {
      throw new ApiError(`Failed to fetch improvement proposals (${response.status})`, response.status);
    }

    return (await response.json()) as ProposalListResponse;
  },

  /**
   * Retrieves a specific proposal by ID via GET /api/improvements/proposals/{proposal_id}
   */
  async getProposalById(proposalId: string): Promise<ProposalRecord> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/improvements/proposals/${proposalId}`, {}, 8000);
    if (!response.ok) {
      throw new ApiError(`Proposal ${proposalId} not found (${response.status})`, response.status);
    }
    return (await response.json()) as ProposalRecord;
  },

  /**
   * Runs regression benchmark tests on a proposal via POST /api/improvements/proposals/{proposal_id}/test
   */
  async testProposal(proposalId: string): Promise<ProposalRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/improvements/proposals/${proposalId}/test`,
      { method: 'POST' },
      20000
    );

    if (!response.ok) {
      let detailMsg = `Failed to test proposal ${proposalId} (${response.status})`;
      try {
        const errorJson = await response.json();
        if (errorJson && typeof errorJson.detail === 'string') {
          detailMsg = errorJson.detail;
        }
      } catch {
        // Fallback
      }
      throw new ApiError(detailMsg, response.status);
    }

    return (await response.json()) as ProposalRecord;
  },

  /**
   * Approves a tested proposal via POST /api/improvements/proposals/{proposal_id}/approve
   */
  async approveProposal(proposalId: string, payload?: ProposalActionRequest): Promise<ProposalRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/improvements/proposals/${proposalId}/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || { reason: 'Approved via UI review' }),
      },
      10000
    );

    if (!response.ok) {
      let detailMsg = `Failed to approve proposal ${proposalId} (${response.status})`;
      try {
        const errorJson = await response.json();
        if (errorJson && typeof errorJson.detail === 'string') {
          detailMsg = errorJson.detail;
        }
      } catch {
        // Fallback
      }
      throw new ApiError(detailMsg, response.status);
    }

    return (await response.json()) as ProposalRecord;
  },

  /**
   * Rejects a proposal via POST /api/improvements/proposals/{proposal_id}/reject
   */
  async rejectProposal(proposalId: string, payload?: ProposalActionRequest): Promise<ProposalRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/improvements/proposals/${proposalId}/reject`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || { reason: 'Rejected via UI' }),
      },
      10000
    );

    if (!response.ok) {
      let detailMsg = `Failed to reject proposal ${proposalId} (${response.status})`;
      try {
        const errorJson = await response.json();
        if (errorJson && typeof errorJson.detail === 'string') {
          detailMsg = errorJson.detail;
        }
      } catch {
        // Fallback
      }
      throw new ApiError(detailMsg, response.status);
    }

    return (await response.json()) as ProposalRecord;
  },

  /**
   * Activates an approved proposal into active configuration via POST /api/improvements/proposals/{proposal_id}/activate
   */
  async activateProposal(proposalId: string, payload?: ProposalActionRequest): Promise<AgentConfiguration> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/improvements/proposals/${proposalId}/activate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || { reason: 'Activated via UI' }),
      },
      15000
    );

    if (!response.ok) {
      let detailMsg = `Failed to activate proposal ${proposalId} (${response.status})`;
      try {
        const errorJson = await response.json();
        if (errorJson && typeof errorJson.detail === 'string') {
          detailMsg = errorJson.detail;
        }
      } catch {
        // Fallback
      }
      throw new ApiError(detailMsg, response.status);
    }

    return (await response.json()) as AgentConfiguration;
  },

  /**
   * Retrieves active configuration via GET /api/improvements/configurations/active
   */
  async getActiveConfiguration(): Promise<AgentConfiguration> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/improvements/configurations/active`, {}, 8000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch active configuration (${response.status})`, response.status);
    }
    return (await response.json()) as AgentConfiguration;
  },

  /**
   * Retrieves version history of configurations via GET /api/improvements/configurations
   */
  async getConfigurationList(params: {
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: AgentConfiguration[]; total: number; limit: number; offset: number }> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/improvements/configurations${queryString}`, {}, 8000);

    if (!response.ok) {
      throw new ApiError(`Failed to fetch configurations (${response.status})`, response.status);
    }

    const raw = await response.json();
    if (Array.isArray(raw)) {
      return {
        items: raw,
        total: raw.length,
        limit: params.limit ?? raw.length,
        offset: params.offset ?? 0,
      };
    }

    if (raw && Array.isArray(raw.items)) {
      return raw as { items: AgentConfiguration[]; total: number; limit: number; offset: number };
    }

    return {
      items: [],
      total: 0,
      limit: params.limit ?? 0,
      offset: params.offset ?? 0,
    };
  },

  /**
   * Compares two configuration versions via GET /api/improvements/configurations/compare
   */
  async compareConfigurations(versionA: string, versionB: string): Promise<ConfigurationComparison> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/improvements/configurations/compare?version_a=${encodeURIComponent(versionA)}&version_b=${encodeURIComponent(versionB)}`,
      {},
      8000
    );

    if (!response.ok) {
      throw new ApiError(`Failed to compare configurations (${response.status})`, response.status);
    }

    return (await response.json()) as ConfigurationComparison;
  },

  /**
   * Rolls back active configuration to target or previous version via POST /api/improvements/configurations/rollback
   */
  async rollbackConfiguration(payload: {
    target_version?: string;
    reason?: string;
  } = {}): Promise<AgentConfiguration> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/improvements/configurations/rollback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      12000
    );

    if (!response.ok) {
      let detailMsg = `Failed to rollback configuration (${response.status})`;
      try {
        const errorJson = await response.json();
        if (errorJson && typeof errorJson.detail === 'string') {
          detailMsg = errorJson.detail;
        }
      } catch {
        // Fallback
      }
      throw new ApiError(detailMsg, response.status);
    }

    return (await response.json()) as AgentConfiguration;
  },

  /**
   * Retrieves audit log history via GET /api/improvements/audit
   */
  async getImprovementAudits(params: {
    limit?: number;
    offset?: number;
    entity_type?: string;
  } = {}): Promise<AuditListResponse> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    if (params.entity_type) query.set('entity_type', params.entity_type);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/improvements/audit${queryString}`, {}, 8000);

    if (!response.ok) {
      throw new ApiError(`Failed to fetch audit log (${response.status})`, response.status);
    }

    return (await response.json()) as AuditListResponse;
  },

  /**
   * Phase 6: Persistent Adaptive Memory Methods
   */

  /**
   * Fetches memory stats from GET /api/memory/stats
   */
  async getMemoryStats(): Promise<MemoryStats> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/memory/stats`, {}, 5000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch memory stats (${response.status})`, response.status);
    }
    return (await response.json()) as MemoryStats;
  },

  /**
   * Lists memories with optional filters from GET /api/memory
   */
  async listMemories(params: {
    status?: string;
    validation_status?: string;
    category?: string;
    task_domain?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<MemoryListResponse> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.validation_status) query.set('validation_status', params.validation_status);
    if (params.category) query.set('category', params.category);
    if (params.task_domain) query.set('task_domain', params.task_domain);
    if (params.search) query.set('search', params.search);
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/memory${queryString}`, {}, 8000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch memories (${response.status})`, response.status);
    }
    return (await response.json()) as MemoryListResponse;
  },

  /**
   * Fetches an individual memory record with provenance history from GET /api/memory/{id}
   */
  async getMemoryDetails(memoryId: string): Promise<MemoryRecord> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/memory/${encodeURIComponent(memoryId)}`, {}, 6000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch memory ${memoryId} (${response.status})`, response.status);
    }
    return (await response.json()) as MemoryRecord;
  },

  /**
   * Creates a memory candidate from POST /api/memory/candidate
   */
  async createMemoryCandidate(payload: MemoryCandidateCreateRequest): Promise<MemoryRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/memory/candidate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      8000
    );

    if (!response.ok) {
      let detail = `Failed to create memory candidate (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as MemoryRecord;
  },

  /**
   * Approves a memory candidate from POST /api/memory/{id}/approve
   */
  async approveMemory(memoryId: string, reason?: string): Promise<MemoryRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/memory/${encodeURIComponent(memoryId)}/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Approved via dashboard' }),
      },
      8000
    );

    if (!response.ok) {
      let detail = `Failed to approve memory (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as MemoryRecord;
  },

  /**
   * Rejects a memory candidate from POST /api/memory/{id}/reject
   */
  async rejectMemory(memoryId: string, reason?: string): Promise<MemoryRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/memory/${encodeURIComponent(memoryId)}/reject`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Rejected via dashboard' }),
      },
      8000
    );

    if (!response.ok) {
      let detail = `Failed to reject memory (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as MemoryRecord;
  },

  /**
   * Archives an active memory from POST /api/memory/{id}/archive
   */
  async archiveMemory(memoryId: string, reason?: string): Promise<MemoryRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/memory/${encodeURIComponent(memoryId)}/archive`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Archived via dashboard' }),
      },
      8000
    );

    if (!response.ok) {
      let detail = `Failed to archive memory (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as MemoryRecord;
  },

  /**
   * Gets memory retrieval configuration from GET /api/memory/config/retrieval
   */
  async getMemoryRetrievalConfig(): Promise<MemoryRetrievalConfig> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/memory/config/retrieval`, {}, 5000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch retrieval config (${response.status})`, response.status);
    }
    return (await response.json()) as MemoryRetrievalConfig;
  },

  /**
   * Toggles memory retrieval configuration from POST /api/memory/config/retrieval
   */
  async setMemoryRetrievalConfig(enabled: boolean): Promise<MemoryRetrievalConfig> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/memory/config/retrieval`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      },
      5000
    );

    if (!response.ok) {
      throw new ApiError(`Failed to update retrieval config (${response.status})`, response.status);
    }

    return (await response.json()) as MemoryRetrievalConfig;
  },

  /**
   * Tests memory retrieval for a prompt from POST /api/memory/retrieve
   */
  async testMemoryRetrieval(payload: MemoryRetrievalTestRequest): Promise<MemoryRetrievalTestResponse> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/memory/retrieve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      8000
    );

    if (!response.ok) {
      let detail = `Failed to test retrieval (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as MemoryRetrievalTestResponse;
  },

  // =========================================================================
  // Phase 7: Context-Aware Workflow and Tool Optimization API Client
  // =========================================================================

  /**
   * Retrieves all registered workflows from GET /api/workflows
   */
  async getWorkflows(): Promise<WorkflowListResponse> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/workflows`, {}, 5000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch workflows (${response.status})`, response.status);
    }
    return (await response.json()) as WorkflowListResponse;
  },

  /**
   * Retrieves workflow details by ID from GET /api/workflows/{workflow_id}
   */
  async getWorkflowById(workflowId: string): Promise<WorkflowRecord> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/workflows/${workflowId}`, {}, 5000);
    if (!response.ok) {
      throw new ApiError(`Workflow '${workflowId}' not found`, response.status);
    }
    return (await response.json()) as WorkflowRecord;
  },

  /**
   * Retrieves capability tools and their statuses from GET /api/workflows/tools
   */
  async getWorkflowTools(): Promise<WorkflowToolsListResponse> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/workflows/tools`, {}, 5000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch workflow tools (${response.status})`, response.status);
    }
    return (await response.json()) as WorkflowToolsListResponse;
  },

  /**
   * Retrieves workflow aggregate metrics from GET /api/workflows/metrics
   */
  async getWorkflowMetrics(): Promise<WorkflowMetrics> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/workflows/metrics`, {}, 5000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch workflow metrics (${response.status})`, response.status);
    }
    return (await response.json()) as WorkflowMetrics;
  },

  /**
   * Retrieves recorded workflow executions from GET /api/workflows/executions
   */
  async getWorkflowExecutions(params: {
    limit?: number;
    offset?: number;
    workflow_id?: string;
    status?: string;
  } = {}): Promise<WorkflowExecutionListResponse> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    if (params.workflow_id) query.set('workflow_id', params.workflow_id);
    if (params.status) query.set('status', params.status);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/workflows/executions${queryString}`, {}, 8000);

    if (!response.ok) {
      throw new ApiError(`Failed to fetch workflow executions (${response.status})`, response.status);
    }
    return (await response.json()) as WorkflowExecutionListResponse;
  },

  /**
   * Classifies task prompt from POST /api/workflows/classify
   */
  async classifyTask(prompt: string): Promise<TaskClassificationResponse> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/workflows/classify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      },
      8000
    );

    if (!response.ok) {
      let detail = `Failed to classify task (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as TaskClassificationResponse;
  },

  /**
   * Previews workflow selection from POST /api/workflows/preview
   */
  async previewWorkflow(payload: WorkflowPreviewRequest): Promise<WorkflowPreviewResponse> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/workflows/preview`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      8000
    );

    if (!response.ok) {
      let detail = `Failed to preview workflow (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as WorkflowPreviewResponse;
  },

  /**
   * Executes task via workflow from POST /api/workflows/execute
   */
  async executeWorkflow(payload: WorkflowExecuteRequest): Promise<WorkflowExecuteResponse> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/workflows/execute`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      35000
    );

    if (!response.ok) {
      let detail = `Workflow execution failed (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as WorkflowExecuteResponse;
  },

  /**
   * Executes tool from POST /api/workflows/tools/execute
   */
  async executeTool(payload: ToolExecuteRequest): Promise<ToolExecuteResponse> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/workflows/tools/execute`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      10000
    );

    if (!response.ok) {
      let detail = `Tool execution failed (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as ToolExecuteResponse;
  },

  // =========================================================================
  // Phase 8: Continuous Regression Monitoring and Safety Guardrails API Client
  // =========================================================================

  /**
   * Retrieves overall system health and guardrail checks from GET /api/monitoring/health
   */
  async getMonitoringHealth(): Promise<SystemHealth> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/monitoring/health`, {}, 6000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch system health (${response.status})`, response.status);
    }
    return (await response.json()) as SystemHealth;
  },

  /**
   * Retrieves real continuous regression metrics from GET /api/monitoring/metrics
   */
  async getMonitoringMetrics(): Promise<MonitoringMetrics> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/monitoring/metrics`, {}, 6000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch monitoring metrics (${response.status})`, response.status);
    }
    return (await response.json()) as MonitoringMetrics;
  },

  /**
   * Lists monitoring alerts from GET /api/monitoring/alerts
   */
  async getMonitoringAlerts(params: {
    status?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<AlertListResponse> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.severity) query.set('severity', params.severity);
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/monitoring/alerts${queryString}`, {}, 6000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch alerts (${response.status})`, response.status);
    }
    return (await response.json()) as AlertListResponse;
  },

  /**
   * Acknowledges an active alert via POST /api/monitoring/alerts/{alert_id}/acknowledge
   */
  async acknowledgeAlert(alertId: string, payload?: AlertActionRequest): Promise<MonitoringAlertRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/monitoring/alerts/${encodeURIComponent(alertId)}/acknowledge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || { operator: 'admin' }),
      },
      8000
    );

    if (!response.ok) {
      let detail = `Failed to acknowledge alert (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as MonitoringAlertRecord;
  },

  /**
   * Resolves an alert via POST /api/monitoring/alerts/{alert_id}/resolve
   */
  async resolveAlert(alertId: string, payload?: AlertActionRequest): Promise<MonitoringAlertRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/monitoring/alerts/${encodeURIComponent(alertId)}/resolve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || { operator: 'admin', notes: 'Resolved via dashboard' }),
      },
      8000
    );

    if (!response.ok) {
      let detail = `Failed to resolve alert (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as MonitoringAlertRecord;
  },

  /**
   * Compares candidate version against baseline via GET /api/monitoring/baseline
   */
  async getBaselineComparison(candidateVersion?: string): Promise<BaselineComparisonResponse> {
    const query = candidateVersion ? `?candidate_version=${encodeURIComponent(candidateVersion)}` : '';
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/monitoring/baseline${query}`, {}, 8000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch baseline comparison (${response.status})`, response.status);
    }
    return (await response.json()) as BaselineComparisonResponse;
  },

  /**
   * Runs regression test suite via POST /api/monitoring/regression-test
   */
  async runRegressionTest(payload?: RegressionTestRunRequest): Promise<RegressionBenchmarkResponse> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/monitoring/regression-test`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      },
      25000
    );

    if (!response.ok) {
      let detail = `Failed to run regression test (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as RegressionBenchmarkResponse;
  },

  /**
   * Retrieves recovery and rollback audit history from GET /api/monitoring/recovery/history
   */
  async getRecoveryHistory(params: { limit?: number; offset?: number } = {}): Promise<RecoveryHistoryResponse> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/monitoring/recovery/history${queryString}`, {}, 6000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch recovery history (${response.status})`, response.status);
    }
    return (await response.json()) as RecoveryHistoryResponse;
  },

  /**
   * Safely rolls back configuration to a verified known-good version via POST /api/monitoring/recovery/rollback
   */
  async rollbackKnownGood(payload: RollbackRequest): Promise<{ success: boolean; message: string; event_id?: string; target_version: string }> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/monitoring/recovery/rollback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      12000
    );

    if (!response.ok) {
      let detail = `Rollback request failed (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as { success: boolean; message: string; event_id?: string; target_version: string };
  },

  // ---------------------------------------------------------------------------
  // Phase 9: Continuous Evaluation, Performance Analytics, and Learning Insights
  // ---------------------------------------------------------------------------

  /**
   * Fetches high-level continuous evaluation metrics from GET /api/analytics/metrics
   */
  async getContinuousEvaluationMetrics(): Promise<ContinuousEvaluationMetrics> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/analytics/metrics`, {}, 6000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch continuous evaluation metrics (${response.status})`, response.status);
    }
    return (await response.json()) as ContinuousEvaluationMetrics;
  },

  /**
   * Lists all versioned evaluation datasets from GET /api/analytics/datasets
   */
  async getEvaluationDatasets(): Promise<DatasetListResponse> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/analytics/datasets`, {}, 6000);
    if (!response.ok) {
      throw new ApiError(`Failed to list evaluation datasets (${response.status})`, response.status);
    }
    return (await response.json()) as DatasetListResponse;
  },

  /**
   * Retrieves single evaluation dataset from GET /api/analytics/datasets/:id
   */
  async getEvaluationDataset(datasetId: string): Promise<EvaluationDatasetRecord> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/analytics/datasets/${encodeURIComponent(datasetId)}`, {}, 6000);
    if (!response.ok) {
      throw new ApiError(`Failed to retrieve dataset ${datasetId} (${response.status})`, response.status);
    }
    return (await response.json()) as EvaluationDatasetRecord;
  },

  /**
   * Lists test cases for a dataset from GET /api/analytics/datasets/:id/cases
   */
  async getEvaluationCases(datasetId: string, activeOnly = true): Promise<EvaluationCaseListResponse> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/analytics/datasets/${encodeURIComponent(datasetId)}/cases?active_only=${activeOnly}`,
      {},
      6000
    );
    if (!response.ok) {
      throw new ApiError(`Failed to list evaluation cases for dataset ${datasetId} (${response.status})`, response.status);
    }
    return (await response.json()) as EvaluationCaseListResponse;
  },

  /**
   * Adds an evaluation case to a dataset from POST /api/analytics/datasets/:id/cases
   */
  async createEvaluationCase(datasetId: string, payload: EvaluationCaseCreateRequest): Promise<EvaluationCaseRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/analytics/datasets/${encodeURIComponent(datasetId)}/cases`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      8000
    );
    if (!response.ok) {
      let detail = `Failed to create evaluation case (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }
    return (await response.json()) as EvaluationCaseRecord;
  },

  /**
   * Triggers an evaluation run via POST /api/analytics/runs
   */
  async executeEvaluationRun(payload: EvaluationRunRequest): Promise<EvaluationRunRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/analytics/runs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      45000 // bounded timeout for run
    );
    if (!response.ok) {
      let detail = `Failed to execute evaluation run (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }
    return (await response.json()) as EvaluationRunRecord;
  },

  /**
   * Lists evaluation runs from GET /api/analytics/runs
   */
  async getEvaluationRuns(params: { datasetId?: string; configVersion?: string; limit?: number; offset?: number } = {}): Promise<EvaluationRunListResponse> {
    const query = new URLSearchParams();
    if (params.datasetId) query.set('dataset_id', params.datasetId);
    if (params.configVersion) query.set('configuration_version', params.configVersion);
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/analytics/runs${queryString}`, {}, 6000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch evaluation runs (${response.status})`, response.status);
    }
    return (await response.json()) as EvaluationRunListResponse;
  },

  /**
   * Retrieves single evaluation run with case results from GET /api/analytics/runs/:id
   */
  async getEvaluationRunDetail(runId: string, includeCases = true): Promise<EvaluationRunRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/analytics/runs/${encodeURIComponent(runId)}?include_cases=${includeCases}`,
      {},
      6000
    );
    if (!response.ok) {
      throw new ApiError(`Failed to fetch run ${runId} (${response.status})`, response.status);
    }
    return (await response.json()) as EvaluationRunRecord;
  },

  /**
   * Compares two evaluation runs from GET /api/analytics/compare
   */
  async compareEvaluationRuns(baselineRunId: string, candidateRunId: string): Promise<RunComparisonResponse> {
    const query = new URLSearchParams({
      baseline_run_id: baselineRunId,
      candidate_run_id: candidateRunId,
    });
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/analytics/compare?${query.toString()}`, {}, 6000);
    if (!response.ok) {
      let detail = `Failed to compare evaluation runs (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }
    return (await response.json()) as RunComparisonResponse;
  },

  /**
   * Retrieves failure pattern insights from GET /api/analytics/insights
   */
  async getFailureInsights(): Promise<FailureInsightsListResponse> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/analytics/insights`, {}, 6000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch failure insights (${response.status})`, response.status);
    }
    return (await response.json()) as FailureInsightsListResponse;
  },

  /**
   * Retrieves evidence-based recommendations from GET /api/analytics/recommendations
   */
  async getImprovementRecommendations(): Promise<RecommendationsListResponse> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/analytics/recommendations`, {}, 6000);
    if (!response.ok) {
      throw new ApiError(`Failed to fetch recommendations (${response.status})`, response.status);
    }
    return (await response.json()) as RecommendationsListResponse;
  },

  /**
   * Acts on recommendation (accept, reject, create_proposal) from POST /api/analytics/recommendations/:id/action
   */
  async actOnRecommendation(
    recommendationId: string,
    payload: RecommendationActionRequest
  ): Promise<ImprovementRecommendationRecord> {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/analytics/recommendations/${encodeURIComponent(recommendationId)}/action`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      8000
    );
    if (!response.ok) {
      let detail = `Failed to act on recommendation (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) detail = errJson.detail;
      } catch {}
      throw new ApiError(detail, response.status);
    }
    return (await response.json()) as ImprovementRecommendationRecord;
  },
};

