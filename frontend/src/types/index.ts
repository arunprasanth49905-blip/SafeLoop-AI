/**
 * SafeLoop AI Frontend Types
 */

export type NavigationTab =
  | 'overview'
  | 'playground'
  | 'feedback'
  | 'improvement'
  | 'memory'
  | 'safety'
  | 'evaluation'
  | 'workflows'
  | 'settings';

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export interface AgentStatusResponse {
  provider: string;
  configured: boolean;
  model: string | null;
  status_message: string;
}

export interface ChatRequest {
  prompt: string;
  task_id?: string;
  system_instruction?: string;
}

export interface ChatResponse {
  text: string;
  model: string;
  task_id?: string;
  status: string;
  latency_ms: number;
  retrieved_memory_ids?: string[];
  memory_retrieval_applied?: boolean;
}

export interface SystemStatusState {
  health: HealthResponse | null;
  agent: AgentStatusResponse | null;
  isLoading: boolean;
  error: string | null;
  lastChecked: Date | null;
  checkStatus: () => Promise<void>;
}

export type FeedbackRating = 'helpful' | 'not_helpful' | 'correction';

export interface FeedbackCreateRequest {
  task_id?: string;
  rating: FeedbackRating;
  correction?: string;
  comment?: string;
}

export interface FeedbackRecord {
  id: number;
  task_id?: string | null;
  rating: FeedbackRating;
  correction?: string | null;
  comment?: string | null;
  created_at: string;
  evaluation_status?: 'evaluated' | 'unevaluated' | string;
  decision?: EvaluationDecision | null;
  explanation?: string | null;
  quality_score?: number | null;
  relevance_score?: number | null;
  specificity_score?: number | null;
  evidence_score?: number | null;
  consistency_score?: number | null;
  non_duplication_score?: number | null;
  is_safe?: boolean | null;
  safety_flags?: string[];
  safety_reason?: string | null;
  evaluated_at?: string | null;
  evaluation_decision?: EvaluationDecision | null;
  reason?: string | null;
  evaluation?: EvaluationRecord | null;
}

export interface FeedbackListResponse {
  items: FeedbackRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface FeedbackStats {
  total_count: number;
  helpful_count: number;
  not_helpful_count: number;
  correction_count: number;
  helpful_ratio: number;
}

export type EvaluationDecision = 'approved' | 'needs_review' | 'rejected';

export interface EvaluationRecord {
  id: number;
  feedback_id: number;
  quality_score: number;
  relevance_score: number;
  specificity_score: number;
  evidence_score: number;
  consistency_score: number;
  non_duplication_score: number;
  is_safe: boolean;
  safety_flags: string[];
  safety_reason?: string | null;
  decision: EvaluationDecision;
  explanation: string;
  evaluated_at: string;
  evaluator_version: string;
  has_context: boolean;
}

export interface EvaluationStats {
  total_evaluated: number;
  approved_count: number;
  needs_review_count: number;
  rejected_count: number;
  average_quality_score: number;
}

export interface EvaluationListResponse {
  items: EvaluationRecord[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Phase 5: Continuous Improvement Types
 */

export type ProposalStatus = 'draft' | 'tested' | 'approved' | 'rejected' | 'activated';

export interface ProposalRecord {
  id: string;
  source_feedback_ids: number[];
  target_rule_category: string;
  proposed_instruction: string;
  problem_statement: string;
  expected_benefit: string;
  potential_risks?: string | null;
  base_version: string;
  status: ProposalStatus;
  safety_validation_passed: boolean;
  safety_flags: string[];
  safety_notes?: string | null;
  regression_passed: boolean;
  regression_results?: {
    passed: boolean;
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    score_ratio: number;
    evaluated_at?: string;
    details?: Array<{
      task_id: string;
      category: string;
      passed: boolean;
      score: number;
      details: string;
      error?: string;
    }>;
  } | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
  activated_version?: string | null;
}

export interface ProposalListResponse {
  items: ProposalRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProposalCreateRequest {
  feedback_ids: number[];
  target_rule_category?: string;
  custom_instruction_hint?: string;
}

export interface ProposalActionRequest {
  reason?: string;
}

export interface AgentConfiguration {
  version: string;
  instructions: string[];
  system_prompt_template: string;
  proposal_id?: string | null;
  created_at: string;
  is_active: boolean;
  activation_reason?: string | null;
  activated_at?: string | null;
}

export interface ConfigurationComparison {
  version_a: string;
  version_b: string;
  added_instructions: string[];
  removed_instructions: string[];
  unchanged_instructions: string[];
  summary: string;
}

export interface AuditLogRecord {
  id: number;
  action: string;
  proposal_id?: string | null;
  version?: string | null;
  details?: string | null;
  timestamp: string;
}

export interface AuditListResponse {
  items: AuditLogRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface ImprovementStats {
  active_version: string;
  total_proposals: number;
  draft_proposals: number;
  tested_proposals: number;
  approved_proposals: number;
  rejected_proposals: number;
  activated_proposals: number;
  total_configurations: number;
}

/**
 * Phase 6: Persistent Adaptive Memory Types
 */

export type MemoryCategory =
  | 'formatting_preference'
  | 'workflow_correction'
  | 'domain_instruction'
  | 'error_prevention'
  | 'code_precision'
  | 'safety_boundary';

export type MemoryValidationStatus = 'candidate' | 'approved' | 'rejected';
export type MemoryStatus = 'candidate' | 'active' | 'archived' | 'rejected';

export interface MemoryProvenanceLog {
  id: number;
  memory_id: string;
  action: string;
  actor: string;
  details?: string | null;
  timestamp: string;
}

export interface MemoryRecord {
  id: string;
  title: string;
  lesson: string;
  category: MemoryCategory;
  source_feedback_id?: number | null;
  source_proposal_id?: string | null;
  task_domain: string;
  confidence_score: number;
  validation_status: MemoryValidationStatus;
  status: MemoryStatus;
  version: number;
  usage_count: number;
  last_used_at?: string | null;
  keywords: string[];
  privacy_safety_passed: boolean;
  safety_flags: string[];
  review_notes?: string | null;
  created_at: string;
  updated_at: string;
  provenance_logs?: MemoryProvenanceLog[] | null;
}

export interface MemoryListResponse {
  items: MemoryRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface MemoryStats {
  total_memories: number;
  active_memories: number;
  candidate_memories: number;
  archived_memories: number;
  rejected_memories: number;
  total_usage: number;
  average_confidence: number;
  retrieval_enabled: boolean;
}

export interface MemoryCandidateCreateRequest {
  title: string;
  lesson: string;
  category: MemoryCategory;
  task_domain?: string;
  source_type: 'feedback' | 'proposal' | 'verified_expert';
  source_feedback_id?: number;
  source_proposal_id?: string;
  confidence_score?: number;
}

export interface MemoryRetrievalConfig {
  enabled: boolean;
  max_retrieval_count: number;
  min_relevance_score: number;
}

export interface MemoryRetrievalItem {
  memory: MemoryRecord;
  relevance_score: number;
  matched_keywords: string[];
}

export interface MemoryRetrievalTestRequest {
  prompt: string;
  task_domain?: string;
  limit?: number;
}

export interface MemoryRetrievalTestResponse {
  retrieved: MemoryRetrievalItem[];
  count: number;
  prompt: string;
  retrieval_enabled: boolean;
}

/**
 * Phase 7: Context-Aware Workflow and Tool Optimization Types
 */

export type TaskCategory =
  | 'general_qa'
  | 'explanation_learning'
  | 'coding_debugging'
  | 'structured_writing'
  | 'data_analysis'
  | 'multi_step_reasoning'
  | 'ambiguous_unsupported';

export interface TaskClassificationResponse {
  category: TaskCategory;
  confidence: number;
  reasoning: string;
  detected_intents: string[];
  suggested_workflow_id: string;
  fallback_needed: boolean;
}

export interface WorkflowToolRecord {
  tool_id: string;
  name: string;
  description: string;
  is_available: boolean;
  status: 'available' | 'unavailable' | 'disabled';
  requires_authorization: boolean;
  safety_boundary: string;
}

export interface WorkflowRecord {
  workflow_id: string;
  version: string;
  name: string;
  description: string;
  supported_categories: TaskCategory[];
  required_inputs: string[];
  permitted_capabilities: string[];
  permitted_tools: string[];
  expected_output_format: string;
  safety_constraints: string[];
  timeout_seconds: number;
  max_retries: number;
  is_enabled: boolean;
  is_available: boolean;
}

export interface WorkflowListResponse {
  workflows: WorkflowRecord[];
  total: number;
}

export interface WorkflowToolsListResponse {
  tools: WorkflowToolRecord[];
  total: number;
}

export interface WorkflowPreviewRequest {
  prompt: string;
  requested_workflow_id?: string;
}

export interface WorkflowPreviewResponse {
  selected_workflow_id: string;
  workflow_version: string;
  workflow_name: string;
  task_category: TaskCategory;
  confidence: number;
  selection_reason: string;
  fallback_used: boolean;
  relevant_memory_ids: string[];
  permitted_tools: string[];
  alternatives_considered: string[];
}

export interface WorkflowExecuteRequest {
  prompt: string;
  task_id?: string;
  workflow_id_override?: string;
  timeout_seconds?: number;
}

export interface WorkflowExecutionRecord {
  id?: number;
  task_id: string;
  workflow_id: string;
  workflow_version: string;
  task_category: TaskCategory;
  confidence: number;
  selection_reason: string;
  fallback_used: boolean;
  memory_ids_used: string[];
  execution_status: 'success' | 'failure' | 'fallback';
  latency_ms: number;
  error_category?: string | null;
  validation_passed: boolean;
  created_at: string;
}

export interface WorkflowExecuteResponse {
  task_id: string;
  workflow_id: string;
  workflow_version: string;
  task_category: TaskCategory;
  confidence: number;
  selection_reason: string;
  fallback_used: boolean;
  memory_ids_used: string[];
  response_text: string;
  latency_ms: number;
  status: 'success' | 'failure' | 'fallback';
}

export interface WorkflowExecutionListResponse {
  items: WorkflowExecutionRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface WorkflowMetrics {
  total_executions: number;
  success_rate: number;
  fallback_rate: number;
  average_latency_ms: number;
  executions_by_category: Record<string, number>;
  executions_by_workflow: Record<string, number>;
}

export interface ToolExecuteRequest {
  tool_id: string;
  parameters?: Record<string, unknown>;
}

export interface ToolExecuteResponse {
  tool_id: string;
  success: boolean;
  output: unknown;
  latency_ms: number;
}

/**
 * Phase 8: Continuous Regression Monitoring and Safety Guardrails Types
 */

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';
export type RecoveryAction = 'rollback' | 'quarantine' | 'manual_restore' | 'prevent_activation';
export type RecoveryStatus = 'completed' | 'failed' | 'blocked';

export interface MonitoringAlertRecord {
  id?: number;
  alert_id: string;
  rule_id: string;
  metric_name: string;
  observed_value: number;
  threshold_value: number;
  sample_size: number;
  severity: AlertSeverity;
  related_version: string;
  explanation: string;
  status: AlertStatus;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertListResponse {
  items: MonitoringAlertRecord[];
  total: number;
  active_count: number;
  critical_count: number;
  warning_count: number;
  limit: number;
  offset: number;
}

export interface AlertActionRequest {
  operator?: string;
  notes?: string;
}

export interface BenchmarkCaseResult {
  task_id: string;
  name: string;
  passed: boolean;
  latency_ms: number;
  quality_score: number;
  safety_violation: boolean;
  details?: string | null;
}

export interface RegressionBenchmarkResponse {
  benchmark_id: string;
  version: string;
  benchmark_name: string;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  pass_rate: number;
  safety_pass_rate: number;
  avg_latency_ms: number;
  avg_quality_score: number;
  safety_violations: number;
  is_baseline: boolean;
  results_summary: BenchmarkCaseResult[];
  created_at: string;
}

export interface RegressionTestRunRequest {
  candidate_version?: string;
  benchmark_name?: string;
}

export interface BaselineComparisonResponse {
  baseline_version: string;
  candidate_version: string;
  baseline_benchmark?: RegressionBenchmarkResponse | null;
  candidate_benchmark?: RegressionBenchmarkResponse | null;
  pass_rate_delta: number;
  safety_delta: number;
  quality_score_delta: number;
  latency_delta_ms: number;
  regression_detected: boolean;
  regression_reasons: string[];
  sample_size: number;
  evaluation_coverage: string;
  insufficient_data: boolean;
  status: 'healthy' | 'regression_detected' | 'insufficient_data';
}

export interface RecoveryEventRecord {
  id?: number;
  event_id: string;
  action: RecoveryAction;
  from_version: string;
  to_version: string;
  trigger_alert_id?: string | null;
  reason: string;
  status: RecoveryStatus;
  details?: Record<string, unknown> | null;
  created_at: string;
}

export interface RecoveryHistoryResponse {
  events: RecoveryEventRecord[];
  total: number;
}

export interface RollbackRequest {
  target_version: string;
  reason: string;
  operator?: string;
}

export interface MonitoringMetrics {
  active_version: string;
  baseline_version: string;
  total_tasks_executed: number;
  task_success_rate: number;
  regression_pass_rate: number;
  avg_evaluation_score: number;
  safety_validation_failures: number;
  workflow_error_rate: number;
  workflow_fallback_rate: number;
  avg_response_latency_ms: number;
  timeout_rate: number;
  active_critical_alerts: number;
  active_warning_alerts: number;
  sample_size_labeled: number;
  sample_size_unlabeled: number;
  insufficient_data: boolean;
}

export interface SystemHealth {
  overall_status: 'healthy' | 'degraded' | 'critical' | 'insufficient_data';
  active_version: string;
  baseline_version: string;
  checks: Record<string, unknown>;
  active_alerts_count: number;
  last_regression_run_at?: string | null;
  can_activate_candidate: boolean;
  timestamp: string;
}

/**
 * Phase 9: Continuous Evaluation, Performance Analytics, and Learning Insights Types
 */

export type EvaluationMethod = 'deterministic' | 'rubric_criteria' | 'safety_boundary';
export type RunStatus = 'running' | 'completed' | 'failed' | 'partial';
export type CaseResultStatus = 'passed' | 'failed' | 'skipped' | 'error';
export type RecommendationStatus = 'pending' | 'accepted' | 'rejected' | 'implemented';

export interface EvaluationDatasetRecord {
  id?: number;
  dataset_id: string;
  version: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  total_cases: number;
  created_at: string;
  updated_at: string;
}

export interface DatasetListResponse {
  datasets: EvaluationDatasetRecord[];
  total: number;
}

export interface EvaluationCaseRecord {
  id?: number;
  case_id: string;
  dataset_id: string;
  task_category: string;
  prompt: string;
  expected_criteria: Record<string, unknown>;
  evaluation_method: EvaluationMethod;
  is_active: boolean;
  created_at: string;
}

export interface EvaluationCaseListResponse {
  cases: EvaluationCaseRecord[];
  total: number;
  dataset_id: string;
}

export interface EvaluationCaseCreateRequest {
  case_id?: string;
  task_category: string;
  prompt: string;
  expected_criteria: Record<string, unknown>;
  evaluation_method?: EvaluationMethod;
}

export interface EvaluationRunRequest {
  dataset_id?: string;
  configuration_version?: string;
  workflow_version?: string;
  max_cases?: number;
}

export interface EvaluationCaseResultRecord {
  id?: number;
  run_id: string;
  case_id: string;
  task_category: string;
  status: CaseResultStatus;
  score: number;
  latency_ms: number;
  safety_passed: boolean;
  details?: string | null;
  response_excerpt?: string | null;
  evaluated_at: string;
}

export interface EvaluationRunRecord {
  id?: number;
  run_id: string;
  dataset_id: string;
  dataset_version: string;
  configuration_version: string;
  workflow_version: string;
  status: RunStatus;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  skipped_cases: number;
  error_cases: number;
  pass_rate: number;
  avg_score: number;
  avg_latency_ms: number;
  safety_pass_rate: number;
  metrics_summary?: Record<string, unknown> | null;
  error_details?: string | null;
  started_at: string;
  completed_at?: string | null;
  case_results?: EvaluationCaseResultRecord[] | null;
}

export interface EvaluationRunListResponse {
  items: EvaluationRunRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface RunComparisonResponse {
  baseline_run: EvaluationRunRecord;
  candidate_run: EvaluationRunRecord;
  pass_rate_delta: number;
  score_delta: number;
  latency_delta_ms: number;
  safety_delta: number;
  per_category_deltas: Record<string, { pass_rate_delta: number; score_delta: number }>;
  is_statistically_valid: boolean;
  sample_size: number;
  comparison_summary: string;
}

export interface FailureInsightRecord {
  id?: number;
  insight_id: string;
  issue_category: string;
  title: string;
  description: string;
  supporting_records_count: number;
  relevant_task_categories: string[];
  confidence_strength: number;
  evidence_references: string[];
  recommended_action: string;
  created_at: string;
}

export interface FailureInsightsListResponse {
  insights: FailureInsightRecord[];
  total: number;
}

export interface ImprovementRecommendationRecord {
  id?: number;
  recommendation_id: string;
  insight_id?: string | null;
  problem_statement: string;
  proposed_change: string;
  supporting_metrics: Record<string, unknown>;
  evidence_references: string[];
  expected_benefit: string;
  potential_risks?: string | null;
  proposed_validation_tests: string[];
  confidence_score: number;
  status: RecommendationStatus;
  linked_proposal_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecommendationsListResponse {
  recommendations: ImprovementRecommendationRecord[];
  total: number;
}

export interface RecommendationActionRequest {
  action: 'accept' | 'reject' | 'create_proposal';
  notes?: string;
}

export interface ContinuousEvaluationMetrics {
  active_version: string;
  baseline_version: string;
  total_evaluation_runs: number;
  latest_pass_rate: number;
  latest_avg_score: number;
  latest_safety_rate: number;
  latest_latency_ms: number;
  per_category_scores: Record<string, number>;
  total_insights_count: number;
  pending_recommendations_count: number;
  insufficient_data: boolean;
  sample_size: number;
}




