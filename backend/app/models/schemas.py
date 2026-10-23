"""Pydantic schemas for request and response validation."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


class HealthResponse(BaseModel):
    """Schema for GET /health endpoint response."""

    status: str = Field(default="healthy", description="Current health status of the backend service")
    service: str = Field(default="safeloop-backend", description="Identifier of the backend service")
    version: str = Field(default="0.1.0", description="Semantic version of the backend service")

    model_config = {
        "json_schema_extra": {
            "example": {
                "status": "healthy",
                "service": "safeloop-backend",
                "version": "0.1.0",
            }
        }
    }


class KeyDiagnosticResponse(BaseModel):
    """Safe diagnostic schema reporting key presence and formatting characteristics.

    Never exposes the key, its prefix, or its contents.
    """

    key_exists: bool = Field(description="Whether an API key is detected in the configuration")
    character_count: int = Field(description="Total character count of the configured API key")
    has_surrounding_quotes: bool = Field(description="Whether surrounding quotation marks were present in the source")
    has_surrounding_whitespace: bool = Field(description="Whether surrounding whitespace was present in the source")
    env_file_loaded: bool = Field(description="Whether the backend/.env file was successfully resolved")
    model: str = Field(description="Configured Gemini model name")

    model_config = {
        "json_schema_extra": {
            "example": {
                "key_exists": True,
                "character_count": 53,
                "has_surrounding_quotes": True,
                "has_surrounding_whitespace": False,
                "env_file_loaded": True,
                "model": "gemini-2.5-flash",
            }
        }
    }


class AgentStatusResponse(BaseModel):
    """Schema for GET /api/agent/status endpoint response."""

    provider: str = Field(default="google-gemini", description="AI Provider identifier")
    configured: bool = Field(description="Whether the provider credentials are fully configured")
    model: Optional[str] = Field(default=None, description="Configured model name (if any)")
    status_message: str = Field(description="Human-readable status summary")
    diagnostic: Optional[KeyDiagnosticResponse] = Field(default=None, description="Safe key configuration diagnostic")

    model_config = {
        "json_schema_extra": {
            "example": {
                "provider": "google-gemini",
                "configured": True,
                "model": "gemini-1.5-flash",
                "status_message": "Google Gemini integration is active and ready.",
                "diagnostic": {
                    "key_exists": True,
                    "character_count": 39,
                    "has_surrounding_quotes": False,
                    "has_surrounding_whitespace": False,
                    "env_file_loaded": True,
                    "model": "gemini-1.5-flash",
                },
            }
        }
    }



class ChatRequest(BaseModel):
    """Schema for POST /api/agent/chat endpoint request."""

    prompt: str = Field(..., description="Prompt or task instruction for the AI agent")
    task_id: Optional[str] = Field(default=None, description="Optional unique task identifier")
    system_instruction: Optional[str] = Field(default=None, description="Optional system-level instructions")

    @field_validator("prompt")
    @classmethod
    def validate_prompt_not_empty(cls, value: str) -> str:
        """Validate that the prompt is not empty or pure whitespace."""
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Prompt cannot be empty or whitespace only.")
        return trimmed

    model_config = {
        "json_schema_extra": {
            "example": {
                "prompt": "Explain the concept of feedback loops in autonomous AI systems.",
                "task_id": "task_demo_101",
                "system_instruction": "You are SafeLoop AI, an expert agentic AI assistant.",
            }
        }
    }


class ChatResponse(BaseModel):
    """Schema for POST /api/agent/chat endpoint response."""

    text: str = Field(description="Generated text response from the Gemini model")
    model: str = Field(description="Model name that generated the response")
    task_id: Optional[str] = Field(default=None, description="Task ID associated with the execution")
    status: str = Field(default="success", description="Status of the generation process")
    latency_ms: float = Field(description="Execution latency in milliseconds")
    retrieved_memory_ids: List[str] = Field(default_factory=list, description="IDs of adaptive memories retrieved as supporting context")
    memory_retrieval_applied: bool = Field(default=False, description="Whether adaptive memory retrieval was applied")

    model_config = {
        "json_schema_extra": {
            "example": {
                "text": "Feedback loops allow autonomous AI systems to adapt behaviors safely...",
                "model": "gemini-1.5-flash",
                "task_id": "task_demo_101",
                "status": "success",
                "latency_ms": 642.5,
            }
        }
    }


class ErrorResponse(BaseModel):
    """Consistent error payload schema."""

    detail: str = Field(description="Description of the error condition")


class ModelTestResponse(BaseModel):
    """Schema for minimal integration diagnostic text-generation test.

    Tests one minimal generation request and reports structured telemetry
    without ever exposing the API key or secret contents.
    """

    model: str = Field(description="Gemini model identifier tested")
    success: bool = Field(description="Whether the generation request succeeded")
    status_code: int = Field(description="HTTP status or error code")
    latency_ms: Optional[float] = Field(default=None, description="Request latency in milliseconds")
    text_sample: Optional[str] = Field(default=None, description="Generated response text snippet on success")
    error: Optional[str] = Field(default=None, description="Sanitized error description on failure")

    model_config = {
        "json_schema_extra": {
            "example": {
                "model": "gemini-2.5-flash-lite",
                "success": True,
                "status_code": 200,
                "latency_ms": 482.1,
                "text_sample": "OK",
                "error": None,
            }
        }
    }


FeedbackRating = Literal["helpful", "not_helpful", "correction"]


class FeedbackCreateRequest(BaseModel):
    """Schema for POST /api/feedback request."""

    task_id: Optional[str] = Field(default=None, max_length=128, description="Associated AI task ID")
    rating: str = Field(..., description="Rating: helpful, not_helpful, or correction")
    correction: Optional[str] = Field(default=None, max_length=5000, description="Corrected response text")
    comment: Optional[str] = Field(default=None, max_length=2000, description="Optional explanatory feedback")

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, value: str) -> str:
        trimmed = value.strip().lower()
        if trimmed not in ("helpful", "not_helpful", "correction"):
            raise ValueError("Rating must be one of: 'helpful', 'not_helpful', 'correction'.")
        return trimmed

    @field_validator("task_id", "correction", "comment", mode="before")
    @classmethod
    def trim_text_fields(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = str(value).strip()
        return trimmed if trimmed else None

    @model_validator(mode="after")
    def validate_correction_required(self) -> "FeedbackCreateRequest":
        if self.rating == "correction":
            if not self.correction or not self.correction.strip():
                raise ValueError("Correction text is required when rating is 'correction'.")
        return self

    model_config = {
        "json_schema_extra": {
            "example": {
                "task_id": "task_demo_101",
                "rating": "helpful",
                "comment": "Accurate explanation of continuous learning.",
                "correction": None,
            }
        }
    }


EvaluationDecision = Literal["approved", "needs_review", "rejected"]


class EvaluationResponse(BaseModel):
    """Schema for feedback evaluation quality score and decision (Phase 4)."""

    id: int = Field(description="Unique evaluation identifier")
    feedback_id: int = Field(description="Associated feedback identifier")
    quality_score: float = Field(description="Normalized quality score (0 to 100)")
    relevance_score: float = Field(description="Relevance score (0 to 25)")
    specificity_score: float = Field(description="Specificity score (0 to 20)")
    evidence_score: float = Field(description="Evidence score (0 to 20)")
    consistency_score: float = Field(description="Consistency score (0 to 20)")
    non_duplication_score: float = Field(description="Non-duplication score (0 to 15)")
    is_safe: bool = Field(description="Whether the feedback passed the safety gate")
    safety_flags: List[str] = Field(default_factory=list, description="List of detected safety violation flags if any")
    safety_reason: Optional[str] = Field(default=None, description="Explanation of safety assessment")
    decision: EvaluationDecision = Field(
        description="Final decision: approved, needs_review, or rejected"
    )
    explanation: str = Field(description="Human-readable explanation of score and decision")
    evaluated_at: str = Field(description="ISO 8601 UTC timestamp of evaluation")
    evaluator_version: str = Field(default="v1.0.0-rules", description="Version of the evaluation engine")
    has_context: bool = Field(default=False, description="Whether original task prompt/response context was available")

    model_config = {
        "json_schema_extra": {
            "example": {
                "id": 1,
                "feedback_id": 12,
                "quality_score": 88.0,
                "relevance_score": 24.0,
                "specificity_score": 18.0,
                "evidence_score": 18.0,
                "consistency_score": 15.0,
                "non_duplication_score": 13.0,
                "is_safe": True,
                "safety_flags": [],
                "safety_reason": "No safety violations detected.",
                "decision": "approved",
                "explanation": "High relevance, actionable correction with concrete evidence.",
                "evaluated_at": "2026-10-22T21:30:00Z",
                "evaluator_version": "v1.0.0-rules",
                "has_context": True,
            }
        }
    }


class FeedbackResponse(BaseModel):
    """Schema for individual feedback record response."""

    id: int = Field(description="Unique feedback identifier")
    task_id: Optional[str] = Field(default=None, description="Associated AI task ID")
    rating: str = Field(description="Rating: helpful, not_helpful, or correction")
    correction: Optional[str] = Field(default=None, description="Correction text if provided")
    comment: Optional[str] = Field(default=None, description="User comment if provided")
    created_at: str = Field(description="ISO 8601 UTC creation timestamp")
    evaluation_status: str = Field(
        default="unevaluated",
        description="Status of evaluation: 'evaluated' or 'unevaluated'",
    )
    decision: Optional[EvaluationDecision] = Field(
        default=None,
        description="Stored evaluation decision: approved, needs_review, or rejected if evaluated",
    )
    explanation: Optional[str] = Field(
        default=None,
        description="Human-readable explanation of score and decision if evaluated",
    )
    quality_score: Optional[float] = Field(
        default=None,
        description="Normalized quality score (0 to 100) if evaluated",
    )
    relevance_score: Optional[float] = Field(
        default=None,
        description="Relevance score (0 to 25) if evaluated",
    )
    specificity_score: Optional[float] = Field(
        default=None,
        description="Specificity score (0 to 20) if evaluated",
    )
    evidence_score: Optional[float] = Field(
        default=None,
        description="Evidence score (0 to 20) if evaluated",
    )
    consistency_score: Optional[float] = Field(
        default=None,
        description="Consistency score (0 to 20) if evaluated",
    )
    non_duplication_score: Optional[float] = Field(
        default=None,
        description="Non-duplication score (0 to 15) if evaluated",
    )
    is_safe: Optional[bool] = Field(
        default=None,
        description="Whether feedback passed safety gate if evaluated",
    )
    safety_flags: List[str] = Field(
        default_factory=list,
        description="Detected safety violation flags if any",
    )
    safety_reason: Optional[str] = Field(
        default=None,
        description="Safety reasoning explanation",
    )
    evaluated_at: Optional[str] = Field(
        default=None,
        description="ISO 8601 UTC timestamp of evaluation if evaluated",
    )
    evaluator_version: Optional[str] = Field(
        default=None,
        description="Evaluator version",
    )
    has_context: Optional[bool] = Field(
        default=None,
        description="Whether task interaction context was available",
    )
    evaluation_decision: Optional[EvaluationDecision] = Field(
        default=None,
        description="Alias for decision",
    )
    reason: Optional[str] = Field(
        default=None,
        description="Alias for explanation",
    )
    evaluation: Optional[EvaluationResponse] = Field(
        default=None,
        description="Linked quality evaluation if evaluated (Phase 4)",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "id": 1,
                "task_id": "task_demo_101",
                "rating": "helpful",
                "correction": None,
                "comment": "Accurate explanation of continuous learning.",
                "created_at": "2026-10-22T21:00:00Z",
                "evaluation_status": "evaluated",
                "decision": "approved",
                "explanation": "High relevance, actionable correction with concrete evidence.",
                "quality_score": 88.0,
                "is_safe": True,
                "evaluated_at": "2026-10-22T21:30:00Z",
                "evaluation_decision": "approved",
                "reason": "High relevance, actionable correction with concrete evidence.",
                "evaluation": None,
            }
        }
    }


class FeedbackListResponse(BaseModel):
    """Schema for paginated GET /api/feedback response."""

    items: List[FeedbackResponse] = Field(description="List of feedback records")
    total: int = Field(description="Total matching feedback records")
    limit: int = Field(description="Page limit")
    offset: int = Field(description="Page offset")


class FeedbackStatsResponse(BaseModel):
    """Schema for GET /api/feedback/stats response."""

    total_count: int = Field(description="Total feedback submissions")
    helpful_count: int = Field(description="Count of 'helpful' submissions")
    not_helpful_count: int = Field(description="Count of 'not_helpful' submissions")
    correction_count: int = Field(description="Count of 'correction' submissions")
    helpful_ratio: float = Field(description="Ratio of helpful feedback (0.0 to 1.0)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "total_count": 24,
                "helpful_count": 18,
                "not_helpful_count": 2,
                "correction_count": 4,
                "helpful_ratio": 0.75,
            }
        }
    }


class EvaluationListResponse(BaseModel):
    """Schema for paginated GET /api/evaluations response."""

    items: List[EvaluationResponse] = Field(description="List of evaluation records")
    total: int = Field(description="Total matching evaluation records")
    limit: int = Field(description="Page limit")
    offset: int = Field(description="Page offset")


class EvaluationStatsResponse(BaseModel):
    """Schema for GET /api/evaluations/stats response."""

    total_evaluated: int = Field(description="Total feedback records evaluated")
    approved_count: int = Field(description="Total approved feedback records")
    needs_review_count: int = Field(description="Total feedback records needing review")
    rejected_count: int = Field(description="Total rejected feedback records")
    average_quality_score: float = Field(description="Average quality score across evaluated records (0.0 to 100.0)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "total_evaluated": 20,
                "approved_count": 14,
                "needs_review_count": 4,
                "rejected_count": 2,
                "average_quality_score": 81.5,
            }
        }
    }


# ===========================================================================
# Phase 5: Controlled Continuous Improvement Schemas
# ===========================================================================

ProposalStatus = Literal["draft", "tested", "approved", "rejected", "activated"]


class ProposalCreateRequest(BaseModel):
    """Schema for POST /api/improvements/proposals/generate request."""

    feedback_ids: List[int] = Field(..., min_length=1, description="List of approved feedback IDs to synthesize proposal from")
    target_rule_category: Optional[str] = Field(default="general_guideline", max_length=64, description="Target guideline category")
    custom_instruction_hint: Optional[str] = Field(default=None, max_length=1000, description="Optional specific focus hint")

    @field_validator("feedback_ids")
    @classmethod
    def validate_ids(cls, v: List[int]) -> List[int]:
        cleaned = [int(i) for i in v if int(i) > 0]
        if not cleaned:
            raise ValueError("At least one valid feedback ID is required.")
        return sorted(list(set(cleaned)))


class ProposalActionRequest(BaseModel):
    """Schema for proposal approval, rejection, or activation request."""

    reason: Optional[str] = Field(default=None, max_length=500, description="Optional explanation or audit note")


class ProposalResponse(BaseModel):
    """Schema for an improvement proposal record."""

    id: str = Field(description="Unique proposal identifier (e.g. prop_abcd1234)")
    source_feedback_ids: List[int] = Field(description="Feedback IDs that provided the evidence")
    target_rule_category: str = Field(description="Guideline rule category")
    proposed_instruction: str = Field(description="Exact proposed behavioral instruction")
    problem_statement: str = Field(description="Description of the issue observed in evidence")
    expected_benefit: str = Field(description="Expected behavioral enhancement")
    potential_risks: Optional[str] = Field(default=None, description="Analyzed edge case risks")
    base_version: str = Field(description="Baseline configuration version")
    status: ProposalStatus = Field(description="Current proposal lifecycle status")
    safety_validation_passed: bool = Field(description="Whether proposal passed static safety validation")
    safety_flags: List[str] = Field(default_factory=list, description="Safety flags if any detected")
    safety_notes: Optional[str] = Field(default=None, description="Notes from safety validation")
    regression_passed: bool = Field(description="Whether regression tests passed")
    regression_results: Optional[Dict[str, Any]] = Field(default=None, description="Benchmark regression test results")
    rejection_reason: Optional[str] = Field(default=None, description="Reason if rejected")
    created_at: str = Field(description="ISO 8601 creation timestamp")
    updated_at: str = Field(description="ISO 8601 update timestamp")
    activated_version: Optional[str] = Field(default=None, description="Activated configuration version if active")


class ProposalListResponse(BaseModel):
    """Schema for paginated proposals list."""

    items: List[ProposalResponse] = Field(description="List of improvement proposals")
    total: int = Field(description="Total matching proposals")
    limit: int = Field(description="Page limit")
    offset: int = Field(description="Page offset")


class AgentConfigurationResponse(BaseModel):
    """Schema for an immutable agent configuration version."""

    version: str = Field(description="Semantic version string (e.g. v1.0.0)")
    instructions: List[str] = Field(description="List of approved behavioral rules")
    system_prompt_template: str = Field(description="Baseline system prompt template")
    proposal_id: Optional[str] = Field(default=None, description="Proposal that created this version")
    created_at: str = Field(description="ISO 8601 creation timestamp")
    is_active: bool = Field(description="Whether this version is currently active")
    activation_reason: Optional[str] = Field(default=None, description="Audit reason for activation")
    activated_at: Optional[str] = Field(default=None, description="ISO 8601 activation timestamp")


class ConfigurationComparisonResponse(BaseModel):
    """Schema for comparing two configuration versions."""

    version_a: str = Field(description="Base version (e.g. v1.0.0)")
    version_b: str = Field(description="Target or candidate version (e.g. v1.1.0)")
    added_instructions: List[str] = Field(description="Instructions present in B but not A")
    removed_instructions: List[str] = Field(description="Instructions present in A but not B")
    unchanged_instructions: List[str] = Field(description="Instructions shared between A and B")
    summary: str = Field(description="Readable diff summary")


class AuditLogResponse(BaseModel):
    """Schema for an improvement audit log entry."""

    id: int = Field(description="Audit log ID")
    action: str = Field(description="Action identifier (e.g. version_activated)")
    proposal_id: Optional[str] = Field(default=None, description="Related proposal ID")
    version: Optional[str] = Field(default=None, description="Related version string")
    details: Optional[str] = Field(default=None, description="Action details or JSON payload")
    timestamp: str = Field(description="ISO 8601 timestamp")


class AuditListResponse(BaseModel):
    """Schema for paginated audit log list."""

    items: List[AuditLogResponse] = Field(description="List of audit log records")
    total: int = Field(description="Total audit entries")
    limit: int = Field(description="Page limit")
    offset: int = Field(description="Page offset")


class ImprovementStatsResponse(BaseModel):
    """Schema for GET /api/improvements/stats."""

    active_version: str = Field(description="Currently active configuration version")
    total_proposals: int = Field(description="Total proposals generated")
    draft_proposals: int = Field(description="Proposals in draft status")
    tested_proposals: int = Field(description="Proposals tested and ready for review")
    approved_proposals: int = Field(description="Proposals approved for activation")
    rejected_proposals: int = Field(description="Proposals rejected")
    activated_proposals: int = Field(description="Proposals activated")
    total_configurations: int = Field(description="Total configuration versions preserved")


# ===========================================================================
# Phase 6: Persistent Adaptive Memory Schemas
# ===========================================================================

MemoryCategory = Literal[
    "formatting_preference",
    "workflow_correction",
    "domain_instruction",
    "error_prevention",
    "code_precision",
    "safety_boundary",
]

MemoryValidationStatus = Literal["candidate", "approved", "rejected"]
MemoryStatus = Literal["candidate", "active", "archived", "rejected"]


class MemoryProvenanceLogResponse(BaseModel):
    """Schema for a memory lifecycle provenance and audit log entry."""

    id: int = Field(description="Provenance log ID")
    memory_id: str = Field(description="Associated memory ID")
    action: str = Field(description="Action (e.g. created_candidate, approved, rejected, archived, retrieved)")
    actor: str = Field(description="Actor identifier (e.g. system, admin, reviewer)")
    details: Optional[str] = Field(default=None, description="Detailed JSON metadata or audit context")
    timestamp: str = Field(description="ISO 8601 timestamp")


class MemoryCandidateCreateRequest(BaseModel):
    """Schema for requesting creation of a new memory candidate from an eligible source."""

    title: str = Field(..., min_length=3, max_length=120, description="Short, descriptive title for the memory")
    lesson: str = Field(..., min_length=10, max_length=1500, description="Concise, reusable lesson or behavioral rule")
    category: MemoryCategory = Field(description="Categorical classification of the memory")
    task_domain: str = Field(default="general", max_length=60, description="Task domain or topic (e.g. python, algorithms, formatting)")
    source_type: Literal["feedback", "proposal", "verified_expert"] = Field(description="Source provenance type")
    source_feedback_id: Optional[int] = Field(default=None, description="Source feedback ID if derived from feedback")
    source_proposal_id: Optional[str] = Field(default=None, description="Source proposal ID if derived from proposal")
    confidence_score: float = Field(default=0.85, ge=0.0, le=1.0, description="Initial confidence score")

    @field_validator("title", "lesson", "task_domain")
    @classmethod
    def strip_whitespace(cls, val: str) -> str:
        s = val.strip()
        if not s:
            raise ValueError("Field cannot be empty or whitespace only.")
        return s


class MemoryActionRequest(BaseModel):
    """Schema for approving, rejecting, or archiving a memory."""

    reason: Optional[str] = Field(default=None, max_length=500, description="Audit reason for the lifecycle action")


class MemoryResponse(BaseModel):
    """Schema for an individual adaptive memory record."""

    id: str = Field(description="Unique memory identifier (e.g. mem_a1b2c3d4)")
    title: str = Field(description="Short title")
    lesson: str = Field(description="Concise reusable lesson or rule")
    category: MemoryCategory = Field(description="Memory category")
    source_feedback_id: Optional[int] = Field(default=None, description="Source feedback ID")
    source_proposal_id: Optional[str] = Field(default=None, description="Source proposal ID")
    task_domain: str = Field(description="Task domain or topic")
    confidence_score: float = Field(description="Confidence score [0.0 - 1.0]")
    validation_status: MemoryValidationStatus = Field(description="Validation status")
    status: MemoryStatus = Field(description="Active, candidate, archived, or rejected status")
    version: int = Field(default=1, description="Memory version")
    usage_count: int = Field(default=0, description="Number of times retrieved and applied")
    last_used_at: Optional[str] = Field(default=None, description="ISO timestamp when last retrieved")
    keywords: List[str] = Field(default_factory=list, description="Indexed keywords for fast matching")
    privacy_safety_passed: bool = Field(description="Whether passed privacy and safety screening")
    safety_flags: List[str] = Field(default_factory=list, description="Safety flags if detected during screening")
    review_notes: Optional[str] = Field(default=None, description="Audit notes explaining lifecycle decision")
    created_at: str = Field(description="ISO 8601 creation timestamp")
    updated_at: str = Field(description="ISO 8601 update timestamp")
    provenance_logs: Optional[List[MemoryProvenanceLogResponse]] = Field(default=None, description="Provenance history")


class MemoryListResponse(BaseModel):
    """Schema for paginated memory listing."""

    items: List[MemoryResponse] = Field(description="List of memories")
    total: int = Field(description="Total matching count")
    limit: int = Field(description="Page limit")
    offset: int = Field(description="Page offset")


class MemoryStatsResponse(BaseModel):
    """Schema for GET /api/memory/stats."""

    total_memories: int = Field(description="Total memory records")
    active_memories: int = Field(description="Active, approved memories in runtime")
    candidate_memories: int = Field(description="Pending candidates awaiting approval")
    archived_memories: int = Field(description="Archived memories")
    rejected_memories: int = Field(description="Rejected memories")
    total_usage: int = Field(description="Cumulative usage count across all memories")
    average_confidence: float = Field(description="Average confidence of active memories")
    retrieval_enabled: bool = Field(description="Whether dynamic memory retrieval is active in chat")


class MemoryRetrievalConfigResponse(BaseModel):
    """Schema for GET /api/memory/config/retrieval."""

    enabled: bool = Field(description="Whether memory retrieval is enabled")
    max_retrieval_count: int = Field(description="Maximum memories injected per prompt")
    min_relevance_score: float = Field(description="Minimum relevance score threshold")


class MemoryRetrievalConfigUpdateRequest(BaseModel):
    """Schema for POST /api/memory/config/retrieval."""

    enabled: bool = Field(description="Toggle dynamic memory retrieval enabled state")


class MemoryRetrievalItem(BaseModel):
    """Schema for an individual retrieved memory candidate with relevance scoring."""

    memory: MemoryResponse = Field(description="Retrieved memory record")
    relevance_score: float = Field(description="Computed relevance score")
    matched_keywords: List[str] = Field(default_factory=list, description="Keywords matched against task prompt")


class MemoryRetrievalTestRequest(BaseModel):
    """Schema for POST /api/memory/retrieve test request."""

    prompt: str = Field(..., min_length=1, description="Prompt text to test against memory retrieval")
    task_domain: Optional[str] = Field(default=None, description="Optional domain filter hint")
    limit: Optional[int] = Field(default=3, ge=1, le=10, description="Max memories to retrieve")


class MemoryRetrievalTestResponse(BaseModel):
    """Schema for POST /api/memory/retrieve test response."""

    retrieved: List[MemoryRetrievalItem] = Field(description="Retrieved memories sorted by relevance")
    count: int = Field(description="Number of memories retrieved")
    prompt: str = Field(description="Target prompt tested")
    retrieval_enabled: bool = Field(description="Whether retrieval is currently active")


# ===========================================================================
# Phase 7: Context-Aware Workflow and Tool Optimization Schemas
# ===========================================================================

TaskCategory = Literal[
    "general_qa",
    "explanation_learning",
    "coding_debugging",
    "structured_writing",
    "data_analysis",
    "multi_step_reasoning",
    "ambiguous_unsupported",
]


class TaskClassificationRequest(BaseModel):
    """Schema for POST /api/workflows/classify request."""

    prompt: str = Field(..., min_length=1, description="Prompt text to classify")

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Prompt cannot be empty or whitespace only.")
        return trimmed


class TaskClassificationResponse(BaseModel):
    """Schema for POST /api/workflows/classify response."""

    category: TaskCategory = Field(description="Identified task category")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score for classification (0.0 - 1.0)")
    reasoning: str = Field(description="Deterministic rationale explaining the assigned category")
    detected_intents: List[str] = Field(default_factory=list, description="Specific keyword or pattern signals detected")
    suggested_workflow_id: str = Field(description="Default recommended workflow ID for this category")
    fallback_needed: bool = Field(description="True if category is ambiguous/unsupported or confidence is below threshold")


class WorkflowToolDefinition(BaseModel):
    """Schema representing an action or capability tool."""

    tool_id: str = Field(description="Unique tool identifier")
    name: str = Field(description="Human-readable tool name")
    description: str = Field(description="Purpose of tool")
    is_available: bool = Field(description="Whether the tool is currently operational and permitted")
    status: Literal["available", "unavailable", "disabled"] = Field(description="Current operational status")
    requires_authorization: bool = Field(description="Whether explicit backend auth is required")
    safety_boundary: str = Field(description="Safety constraints governing this tool")


class WorkflowDefinition(BaseModel):
    """Schema for a registered workflow."""

    workflow_id: str = Field(description="Unique workflow identifier")
    version: str = Field(default="v1.0.0", description="Semantic version of the workflow")
    name: str = Field(description="Human-readable name")
    description: str = Field(description="Detailed workflow description")
    supported_categories: List[TaskCategory] = Field(description="Task categories this workflow handles")
    required_inputs: List[str] = Field(default_factory=lambda: ["prompt"], description="Required input parameters")
    permitted_capabilities: List[str] = Field(description="Permitted model/agent capabilities")
    permitted_tools: List[str] = Field(default_factory=list, description="Allowed tool IDs")
    expected_output_format: str = Field(description="Expected structure or formatting convention")
    safety_constraints: List[str] = Field(default_factory=list, description="Mandatory safety boundaries")
    timeout_seconds: float = Field(default=30.0, description="Max execution timeout in seconds")
    max_retries: int = Field(default=2, ge=0, le=5, description="Maximum bounded retries")
    is_enabled: bool = Field(default=True, description="Whether this workflow is enabled")
    is_available: bool = Field(default=True, description="Whether workflow is operational in current environment")


class WorkflowListResponse(BaseModel):
    """Schema for GET /api/workflows response."""

    workflows: List[WorkflowDefinition] = Field(description="List of registered workflows")
    total: int = Field(description="Total registered workflows")


class WorkflowToolsListResponse(BaseModel):
    """Schema for GET /api/workflows/tools response."""

    tools: List[WorkflowToolDefinition] = Field(description="List of supported tools and their availability")
    total: int = Field(description="Total registered tools")


class WorkflowPreviewRequest(BaseModel):
    """Schema for POST /api/workflows/preview request."""

    prompt: str = Field(..., min_length=1, description="Target task prompt to preview selection for")
    requested_workflow_id: Optional[str] = Field(default=None, description="Optional manual workflow override requested")

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Prompt cannot be empty or whitespace only.")
        return trimmed


class WorkflowPreviewResponse(BaseModel):
    """Schema for POST /api/workflows/preview response."""

    selected_workflow_id: str = Field(description="Selected workflow identifier")
    workflow_version: str = Field(description="Version of selected workflow")
    workflow_name: str = Field(description="Human-readable workflow name")
    task_category: TaskCategory = Field(description="Classified task category")
    confidence: float = Field(description="Classification confidence score")
    selection_reason: str = Field(description="Rationale for workflow selection")
    fallback_used: bool = Field(description="Whether fallback to default chat was invoked")
    relevant_memory_ids: List[str] = Field(default_factory=list, description="Validated Phase 6 memory IDs retrieved for context")
    permitted_tools: List[str] = Field(default_factory=list, description="Tools permitted in this workflow")
    alternatives_considered: List[str] = Field(default_factory=list, description="Other workflows considered")


class WorkflowExecuteRequest(BaseModel):
    """Schema for POST /api/workflows/execute request."""

    prompt: str = Field(..., min_length=1, description="Prompt to execute")
    task_id: Optional[str] = Field(default=None, description="Optional task identifier")
    workflow_id_override: Optional[str] = Field(default=None, description="Optional manual workflow override")
    timeout_seconds: Optional[float] = Field(default=30.0, ge=5.0, le=120.0, description="Max timeout in seconds")

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Prompt cannot be empty or whitespace only.")
        return trimmed


class WorkflowExecutionRecord(BaseModel):
    """Schema for an individual recorded workflow execution."""

    id: Optional[int] = Field(default=None, description="Database record ID")
    task_id: str = Field(description="Unique task identifier")
    workflow_id: str = Field(description="Executed workflow ID")
    workflow_version: str = Field(description="Executed workflow version")
    task_category: TaskCategory = Field(description="Task category")
    confidence: float = Field(description="Classification confidence")
    selection_reason: str = Field(description="Why this workflow was chosen")
    fallback_used: bool = Field(description="Whether fallback was used")
    memory_ids_used: List[str] = Field(default_factory=list, description="Memory IDs used in execution")
    execution_status: Literal["success", "failure", "fallback"] = Field(description="Execution result status")
    latency_ms: float = Field(description="Total execution latency in milliseconds")
    error_category: Optional[str] = Field(default=None, description="Error category if failed")
    validation_passed: bool = Field(default=True, description="Whether output validation passed")
    created_at: str = Field(description="ISO 8601 execution timestamp")


class WorkflowExecuteResponse(BaseModel):
    """Schema for POST /api/workflows/execute response."""

    task_id: str = Field(description="Task identifier")
    workflow_id: str = Field(description="Executed workflow ID")
    workflow_version: str = Field(description="Executed workflow version")
    task_category: TaskCategory = Field(description="Task category")
    confidence: float = Field(description="Classification confidence")
    selection_reason: str = Field(description="Why workflow was chosen")
    fallback_used: bool = Field(description="Whether fallback was used")
    memory_ids_used: List[str] = Field(default_factory=list, description="Memory IDs used")
    response_text: str = Field(description="Generated model response")
    latency_ms: float = Field(description="Execution latency in milliseconds")
    status: Literal["success", "failure", "fallback"] = Field(description="Overall execution status")


class WorkflowExecutionListResponse(BaseModel):
    """Schema for GET /api/workflows/executions response."""

    items: List[WorkflowExecutionRecord] = Field(description="List of recorded workflow executions")
    total: int = Field(description="Total recorded executions")
    limit: int = Field(description="Limit")
    offset: int = Field(description="Offset")


class WorkflowMetricsResponse(BaseModel):
    """Schema for GET /api/workflows/metrics response."""

    total_executions: int = Field(description="Total recorded workflow runs")
    success_rate: float = Field(description="Percentage of successful runs (0.0 - 100.0)")
    fallback_rate: float = Field(description="Percentage of fallback runs (0.0 - 100.0)")
    average_latency_ms: float = Field(description="Average execution latency across runs")
    executions_by_category: Dict[str, int] = Field(default_factory=dict, description="Execution counts per category")
    executions_by_workflow: Dict[str, int] = Field(default_factory=dict, description="Execution counts per workflow")


class ToolExecuteRequest(BaseModel):
    """Schema for POST /api/workflows/tools/execute request."""

    tool_id: str = Field(..., min_length=1, description="Tool identifier to invoke")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Parameters to pass to tool")


class ToolExecuteResponse(BaseModel):
    """Schema for POST /api/workflows/tools/execute response."""

    tool_id: str = Field(description="Invoked tool identifier")
    success: bool = Field(description="Whether tool execution succeeded")
    output: Any = Field(description="Tool output payload or error message")
    latency_ms: float = Field(description="Tool execution latency in ms")


# ===========================================================================
# Phase 8: Continuous Regression Monitoring and Safety Guardrails Schemas
# ===========================================================================

AlertSeverity = Literal["critical", "warning", "info"]
AlertStatus = Literal["active", "acknowledged", "resolved"]
RecoveryAction = Literal["rollback", "quarantine", "manual_restore", "prevent_activation"]
RecoveryStatus = Literal["completed", "failed", "blocked"]


class MonitoringAlertRecord(BaseModel):
    """Schema for a persisted monitoring alert."""

    id: Optional[int] = Field(default=None, description="Database record ID")
    alert_id: str = Field(description="Unique alert identifier (e.g. alt_a1b2c3d4)")
    rule_id: str = Field(description="Identifier of the rule that triggered (e.g. pass_rate_drop)")
    metric_name: str = Field(description="Name of the affected metric")
    observed_value: float = Field(description="Observed measurement value")
    threshold_value: float = Field(description="Trigger threshold or baseline expected value")
    sample_size: int = Field(default=0, description="Number of samples evaluated")
    severity: AlertSeverity = Field(description="Alert severity level")
    related_version: str = Field(description="Related configuration or workflow version")
    explanation: str = Field(description="Human-readable context and remediation suggestion")
    status: AlertStatus = Field(description="Current status of the alert")
    acknowledged_at: Optional[str] = Field(default=None, description="ISO timestamp when acknowledged")
    acknowledged_by: Optional[str] = Field(default=None, description="Operator who acknowledged")
    resolved_at: Optional[str] = Field(default=None, description="ISO timestamp when resolved")
    resolved_by: Optional[str] = Field(default=None, description="Operator who resolved")
    resolution_notes: Optional[str] = Field(default=None, description="Notes recorded during resolution")
    created_at: str = Field(description="ISO 8601 creation timestamp")
    updated_at: str = Field(description="ISO 8601 last update timestamp")


class AlertListResponse(BaseModel):
    """Schema for paginated alerts listing."""

    items: List[MonitoringAlertRecord] = Field(description="List of monitoring alerts")
    total: int = Field(description="Total matching alerts")
    active_count: int = Field(description="Count of currently active alerts")
    critical_count: int = Field(description="Count of active critical alerts")
    warning_count: int = Field(description="Count of active warning alerts")
    limit: int = Field(description="Page limit")
    offset: int = Field(description="Page offset")


class AlertActionRequest(BaseModel):
    """Schema for acknowledging or resolving an alert."""

    operator: Optional[str] = Field(default="admin", max_length=100, description="Operator username or role")
    notes: Optional[str] = Field(default=None, max_length=500, description="Optional audit notes")


class BenchmarkCaseResult(BaseModel):
    """Schema for an individual benchmark test case outcome."""

    task_id: str = Field(description="Task identifier in test suite")
    name: str = Field(description="Descriptive test case title")
    passed: bool = Field(description="Whether the case passed all assertion checks")
    latency_ms: float = Field(description="Execution latency in milliseconds")
    quality_score: float = Field(description="Evaluated quality score (0 - 100)")
    safety_violation: bool = Field(description="Whether any safety rule was violated")
    details: Optional[str] = Field(default=None, description="Failure diagnostic or assertion message")


class RegressionBenchmarkResponse(BaseModel):
    """Schema for a recorded regression benchmark run."""

    benchmark_id: str = Field(description="Unique benchmark run identifier")
    version: str = Field(description="Agent configuration version evaluated")
    benchmark_name: str = Field(description="Name of the benchmark suite")
    total_cases: int = Field(description="Total test cases executed")
    passed_cases: int = Field(description="Number of passing cases")
    failed_cases: int = Field(description="Number of failing cases")
    pass_rate: float = Field(description="Pass percentage (0.0 - 100.0)")
    safety_pass_rate: float = Field(description="Safety pass percentage (0.0 - 100.0)")
    avg_latency_ms: float = Field(description="Average latency across cases in ms")
    avg_quality_score: float = Field(description="Average quality score across cases")
    safety_violations: int = Field(description="Count of safety violations encountered")
    is_baseline: bool = Field(description="Whether this run serves as the active baseline")
    results_summary: List[BenchmarkCaseResult] = Field(description="Individual test case outcomes")
    created_at: str = Field(description="ISO 8601 execution timestamp")


class RegressionTestRunRequest(BaseModel):
    """Schema for POST /api/monitoring/regression-test."""

    candidate_version: Optional[str] = Field(default=None, description="Version to evaluate, defaults to active")
    benchmark_name: Optional[str] = Field(default="SafeLoop Continuous Regression Suite", description="Suite name")


class BaselineComparisonResponse(BaseModel):
    """Schema for GET /api/monitoring/baseline comparison."""

    baseline_version: str = Field(description="Active baseline version (e.g. v1.0.0)")
    candidate_version: str = Field(description="Candidate version evaluated")
    baseline_benchmark: Optional[RegressionBenchmarkResponse] = Field(default=None, description="Baseline run")
    candidate_benchmark: Optional[RegressionBenchmarkResponse] = Field(default=None, description="Candidate run")
    pass_rate_delta: float = Field(description="Candidate pass rate minus baseline pass rate")
    safety_delta: float = Field(description="Candidate safety pass rate minus baseline safety")
    quality_score_delta: float = Field(description="Candidate score minus baseline score")
    latency_delta_ms: float = Field(description="Candidate latency minus baseline latency")
    regression_detected: bool = Field(description="Whether candidate violates any regression rule")
    regression_reasons: List[str] = Field(default_factory=list, description="Specific regression failure reasons")
    sample_size: int = Field(description="Number of evaluated test cases")
    evaluation_coverage: str = Field(description="Human readable coverage description")
    insufficient_data: bool = Field(description="True if sample size is too small for statistical conclusions")
    status: Literal["healthy", "regression_detected", "insufficient_data"] = Field(description="Overall status")


class RecoveryEventRecord(BaseModel):
    """Schema for an auditable recovery or rollback event."""

    id: Optional[int] = Field(default=None, description="Database record ID")
    event_id: str = Field(description="Unique recovery event identifier")
    action: RecoveryAction = Field(description="Recovery action taken")
    from_version: str = Field(description="Source version before recovery")
    to_version: str = Field(description="Target version after recovery")
    trigger_alert_id: Optional[str] = Field(default=None, description="Alert ID that triggered safeguard")
    reason: str = Field(description="Auditable explanation for recovery action")
    status: RecoveryStatus = Field(description="Status of the recovery action")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Supplementary diagnostic data")
    created_at: str = Field(description="ISO 8601 execution timestamp")


class RecoveryHistoryResponse(BaseModel):
    """Schema for GET /api/monitoring/recovery/history."""

    events: List[RecoveryEventRecord] = Field(description="List of recovery events")
    total: int = Field(description="Total recovery events recorded")


class RollbackRequest(BaseModel):
    """Schema for POST /api/monitoring/recovery/rollback."""

    target_version: str = Field(..., min_length=2, description="Target version to roll back to (must be verified)")
    reason: str = Field(..., min_length=5, max_length=500, description="Auditable justification for rollback")
    operator: Optional[str] = Field(default="authorized_operator", description="Operator identity or service role")


class MonitoringMetricsResponse(BaseModel):
    """Schema for GET /api/monitoring/metrics."""

    active_version: str = Field(description="Currently active agent configuration version")
    baseline_version: str = Field(description="Designated baseline configuration version")
    total_tasks_executed: int = Field(description="Total recorded workflow runs and evaluations")
    task_success_rate: float = Field(description="Observed workflow success rate (0.0 - 100.0)")
    regression_pass_rate: float = Field(description="Latest regression test pass rate (0.0 - 100.0)")
    avg_evaluation_score: float = Field(description="Average human/automated quality score")
    safety_validation_failures: int = Field(description="Count of recorded safety violations")
    workflow_error_rate: float = Field(description="Workflow execution failure rate")
    workflow_fallback_rate: float = Field(description="Workflow fallback invocation rate")
    avg_response_latency_ms: float = Field(description="Mean response latency in milliseconds")
    timeout_rate: float = Field(description="Proportion of runs that timed out")
    active_critical_alerts: int = Field(description="Count of unresolved critical alerts")
    active_warning_alerts: int = Field(description="Count of unresolved warning alerts")
    sample_size_labeled: int = Field(description="Number of records with verified correctness labels")
    sample_size_unlabeled: int = Field(description="Number of unverified executions without ground truth")
    insufficient_data: bool = Field(description="True if measurements are below minimum confidence sample")


class SystemHealthResponse(BaseModel):
    """Schema for GET /api/monitoring/health."""

    overall_status: Literal["healthy", "degraded", "critical", "insufficient_data"] = Field(
        description="Overall health state"
    )
    active_version: str = Field(description="Currently active configuration version")
    baseline_version: str = Field(description="Active baseline version")
    checks: Dict[str, Any] = Field(description="Individual component health diagnostics")
    active_alerts_count: int = Field(description="Total active alerts")
    last_regression_run_at: Optional[str] = Field(default=None, description="ISO timestamp of latest test suite run")
    can_activate_candidate: bool = Field(description="Whether safety guardrails permit activating new candidates")
    timestamp: str = Field(description="Current system ISO 8601 timestamp")


# ===========================================================================
# Phase 9: Continuous Evaluation, Performance Analytics, and Learning Insights
# ===========================================================================

EvaluationMethod = Literal["deterministic", "rubric_criteria", "safety_boundary"]
RunStatus = Literal["running", "completed", "failed", "partial"]
CaseResultStatus = Literal["passed", "failed", "skipped", "error"]
RecommendationStatus = Literal["pending", "accepted", "rejected", "implemented"]


class EvaluationDatasetRecord(BaseModel):
    """Schema for a versioned evaluation dataset."""

    id: Optional[int] = Field(default=None, description="Internal ID")
    dataset_id: str = Field(description="Unique dataset identifier (e.g. ds_v1_standard)")
    version: str = Field(description="Semantic version (e.g. v1.0)")
    name: str = Field(description="Descriptive dataset name")
    description: str = Field(description="Dataset purpose and scope")
    status: Literal["active", "archived"] = Field(description="Status of the dataset")
    total_cases: int = Field(default=0, description="Total active test cases in dataset")
    created_at: str = Field(description="ISO creation timestamp")
    updated_at: str = Field(description="ISO last updated timestamp")


class DatasetListResponse(BaseModel):
    """Schema for GET /api/analytics/datasets response."""

    datasets: List[EvaluationDatasetRecord] = Field(description="List of evaluation datasets")
    total: int = Field(description="Total datasets count")


class EvaluationCaseRecord(BaseModel):
    """Schema for an individual evaluation case."""

    id: Optional[int] = Field(default=None, description="Internal ID")
    case_id: str = Field(description="Unique test case identifier")
    dataset_id: str = Field(description="Associated dataset ID")
    task_category: str = Field(description="Task category")
    prompt: str = Field(description="Prompt input to evaluate")
    expected_criteria: Dict[str, Any] = Field(description="Criteria rules (must_contain, prohibited, etc.)")
    evaluation_method: EvaluationMethod = Field(description="Evaluation method applied")
    is_active: bool = Field(default=True, description="Whether case is active")
    created_at: str = Field(description="ISO creation timestamp")


class EvaluationCaseListResponse(BaseModel):
    """Schema for GET /api/analytics/datasets/{dataset_id}/cases response."""

    cases: List[EvaluationCaseRecord] = Field(description="List of test cases")
    total: int = Field(description="Total cases count")
    dataset_id: str = Field(description="Dataset identifier")


class EvaluationCaseCreateRequest(BaseModel):
    """Schema for POST /api/analytics/datasets/{dataset_id}/cases."""

    case_id: Optional[str] = Field(default=None, description="Optional custom case ID")
    task_category: str = Field(..., min_length=2, description="Task category")
    prompt: str = Field(..., min_length=5, description="Input prompt text")
    expected_criteria: Dict[str, Any] = Field(..., description="Validation assertions")
    evaluation_method: EvaluationMethod = Field(default="deterministic", description="Evaluation strategy")


class EvaluationRunRequest(BaseModel):
    """Schema for POST /api/analytics/runs execution request."""

    dataset_id: Optional[str] = Field(default="ds_v1_standard", description="Dataset identifier")
    configuration_version: Optional[str] = Field(default=None, description="Target config version (defaults to active)")
    workflow_version: Optional[str] = Field(default="v1.0.0", description="Workflow version")
    max_cases: Optional[int] = Field(default=50, ge=1, le=200, description="Max cases to evaluate in this run")


class EvaluationCaseResultRecord(BaseModel):
    """Schema for the result of an evaluated test case."""

    id: Optional[int] = Field(default=None, description="Internal ID")
    run_id: str = Field(description="Evaluation run ID")
    case_id: str = Field(description="Case ID")
    task_category: str = Field(description="Task category")
    status: CaseResultStatus = Field(description="Case status: passed, failed, skipped, error")
    score: float = Field(description="Evaluated quality score (0 - 100)")
    latency_ms: float = Field(description="Execution latency in ms")
    safety_passed: bool = Field(description="Whether safety boundary passed")
    details: Optional[str] = Field(default=None, description="Diagnostic notes or failure reason")
    response_excerpt: Optional[str] = Field(default=None, description="Sanitized excerpt of output")
    evaluated_at: str = Field(description="ISO evaluated timestamp")


class EvaluationRunRecord(BaseModel):
    """Schema for an evaluation run."""

    id: Optional[int] = Field(default=None, description="Internal ID")
    run_id: str = Field(description="Unique run ID (e.g. run_a1b2c3d4)")
    dataset_id: str = Field(description="Evaluated dataset ID")
    dataset_version: str = Field(description="Evaluated dataset version")
    configuration_version: str = Field(description="Evaluated config version")
    workflow_version: str = Field(description="Evaluated workflow version")
    status: RunStatus = Field(description="Run status: running, completed, failed, partial")
    total_cases: int = Field(description="Total cases attempted")
    passed_cases: int = Field(description="Cases passed")
    failed_cases: int = Field(description="Cases failed")
    skipped_cases: int = Field(description="Cases skipped")
    error_cases: int = Field(description="Cases with execution error")
    pass_rate: float = Field(description="Pass percentage (0.0 - 100.0)")
    avg_score: float = Field(description="Average quality score across cases")
    avg_latency_ms: float = Field(description="Average latency in ms")
    safety_pass_rate: float = Field(description="Safety pass percentage (0.0 - 100.0)")
    metrics_summary: Optional[Dict[str, Any]] = Field(default=None, description="Per-category summaries")
    error_details: Optional[str] = Field(default=None, description="Failure diagnostic if run failed")
    started_at: str = Field(description="ISO start timestamp")
    completed_at: Optional[str] = Field(default=None, description="ISO completion timestamp")
    case_results: Optional[List[EvaluationCaseResultRecord]] = Field(default=None, description="Individual results")


class EvaluationRunListResponse(BaseModel):
    """Schema for GET /api/analytics/runs response."""

    items: List[EvaluationRunRecord] = Field(description="List of evaluation runs")
    total: int = Field(description="Total recorded runs")
    limit: int = Field(description="Limit")
    offset: int = Field(description="Offset")


class RunComparisonResponse(BaseModel):
    """Schema for GET /api/analytics/compare response."""

    baseline_run: EvaluationRunRecord = Field(description="Baseline evaluation run")
    candidate_run: EvaluationRunRecord = Field(description="Candidate evaluation run")
    pass_rate_delta: float = Field(description="Candidate pass rate minus baseline pass rate")
    score_delta: float = Field(description="Candidate score minus baseline score")
    latency_delta_ms: float = Field(description="Candidate latency minus baseline latency")
    safety_delta: float = Field(description="Candidate safety minus baseline safety")
    per_category_deltas: Dict[str, Dict[str, float]] = Field(
        default_factory=dict, description="Per-category score and pass rate deltas"
    )
    is_statistically_valid: bool = Field(description="True if sample size >= 5 on identical dataset")
    sample_size: int = Field(description="Sample size of evaluated cases")
    comparison_summary: str = Field(description="Human readable delta synthesis")


class FailureInsightRecord(BaseModel):
    """Schema for a grouped recurring failure pattern."""

    id: Optional[int] = Field(default=None, description="Internal ID")
    insight_id: str = Field(description="Unique insight identifier")
    issue_category: str = Field(description="Issue category (e.g. poor_formatting, safety_trigger)")
    title: str = Field(description="Concise insight title")
    description: str = Field(description="Detailed observed failure pattern")
    supporting_records_count: int = Field(description="Number of supporting records")
    relevant_task_categories: List[str] = Field(description="Affected task categories")
    confidence_strength: float = Field(description="Confidence strength (0.0 - 1.0)")
    evidence_references: List[str] = Field(description="IDs of supporting records")
    recommended_action: str = Field(description="Evidence-based remediation recommendation")
    created_at: str = Field(description="ISO creation timestamp")


class FailureInsightsListResponse(BaseModel):
    """Schema for GET /api/analytics/insights response."""

    insights: List[FailureInsightRecord] = Field(description="List of failure insights")
    total: int = Field(description="Total insights identified")


class ImprovementRecommendationRecord(BaseModel):
    """Schema for an evidence-backed improvement recommendation."""

    id: Optional[int] = Field(default=None, description="Internal ID")
    recommendation_id: str = Field(description="Unique recommendation ID")
    insight_id: Optional[str] = Field(default=None, description="Related failure insight ID")
    problem_statement: str = Field(description="Observed problem statement")
    proposed_change: str = Field(description="Specific actionable behavioral rule change")
    supporting_metrics: Dict[str, Any] = Field(description="Empirical metrics motivating the recommendation")
    evidence_references: List[str] = Field(description="Supporting evaluation and feedback IDs")
    expected_benefit: str = Field(description="Projected quality improvement")
    potential_risks: Optional[str] = Field(default=None, description="Identified regression risks")
    proposed_validation_tests: List[str] = Field(description="Validation test requirements")
    confidence_score: float = Field(description="Confidence score [0.0 - 1.0]")
    status: RecommendationStatus = Field(description="Current workflow status")
    linked_proposal_id: Optional[str] = Field(default=None, description="Phase 5 proposal ID if created")
    created_at: str = Field(description="ISO creation timestamp")
    updated_at: str = Field(description="ISO updated timestamp")


class RecommendationsListResponse(BaseModel):
    """Schema for GET /api/analytics/recommendations response."""

    recommendations: List[ImprovementRecommendationRecord] = Field(description="List of recommendations")
    total: int = Field(description="Total recommendations count")


class RecommendationActionRequest(BaseModel):
    """Schema for POST /api/analytics/recommendations/{id}/action."""

    action: Literal["accept", "reject", "create_proposal"] = Field(description="Action to take")
    notes: Optional[str] = Field(default=None, description="Optional operator notes")


class ContinuousEvaluationMetricsResponse(BaseModel):
    """Schema for GET /api/analytics/metrics."""

    active_version: str = Field(description="Current active configuration version")
    baseline_version: str = Field(description="Designated baseline version")
    total_evaluation_runs: int = Field(description="Total evaluation runs recorded")
    latest_pass_rate: float = Field(description="Latest run pass rate")
    latest_avg_score: float = Field(description="Latest run average score")
    latest_safety_rate: float = Field(description="Latest run safety pass rate")
    latest_latency_ms: float = Field(description="Latest run average latency")
    per_category_scores: Dict[str, float] = Field(default_factory=dict, description="Category score breakdown")
    total_insights_count: int = Field(description="Count of active failure insights")
    pending_recommendations_count: int = Field(description="Count of pending recommendations")
    insufficient_data: bool = Field(description="True if evaluation data is insufficient for statistical confidence")
    sample_size: int = Field(description="Total evaluated test cases in latest completed run")





