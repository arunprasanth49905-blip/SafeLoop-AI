"""Context-Aware Workflow Selection and Tool Optimization Service (Phase 7).

Manages:
- Task classification with grounded confidence scoring and fallback routing.
- Registry of explicitly supported workflows and capability boundaries.
- Context-aware workflow selection integrating Phase 6 validated memories and Phase 5 rules.
- Strict tool authorization boundaries rejecting unavailable or arbitrary tools.
- Real execution recording, failure isolation, and performance metrics aggregation.
"""

import json
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.database import get_db_connection
from app.core.logging import logger
from app.models.schemas import (
    TaskCategory,
    TaskClassificationResponse,
    ToolExecuteResponse,
    WorkflowDefinition,
    WorkflowExecuteResponse,
    WorkflowExecutionListResponse,
    WorkflowExecutionRecord,
    WorkflowMetricsResponse,
    WorkflowPreviewResponse,
    WorkflowToolDefinition,
)
from app.services.agent_service import agent_service


class WorkflowService:
    """Service orchestrating context-aware workflow selection, tool boundaries, and telemetry."""

    def __init__(self, db_path: Optional[str] = None):
        self._db_path = db_path
        self._init_registries()

    def _init_registries(self) -> None:
        """Initialize static registries for supported workflows and capabilities."""
        # 1. Registered Supported Workflows
        self._workflows: Dict[str, WorkflowDefinition] = {
            "default_chat_workflow": WorkflowDefinition(
                workflow_id="default_chat_workflow",
                version="v1.0.0",
                name="Standard Conversational QA Workflow",
                description="General-purpose response pipeline applying baseline conversational reasoning, continuous improvement guidelines, and validated memories.",
                supported_categories=["general_qa", "ambiguous_unsupported"],
                required_inputs=["prompt"],
                permitted_capabilities=["conversational_qa", "markdown_formatting", "validated_memory_integration"],
                permitted_tools=["input_sanitizer", "token_estimator"],
                expected_output_format="standard_markdown",
                safety_constraints=[
                    "Enforce strict non-negotiable safety gates",
                    "Do not execute shell commands or arbitrary code",
                    "Protect API credentials and private system context",
                ],
                timeout_seconds=30.0,
                max_retries=2,
                is_enabled=True,
                is_available=True,
            ),
            "code_synthesis_workflow": WorkflowDefinition(
                workflow_id="code_synthesis_workflow",
                version="v1.0.0",
                name="Bounded Code Synthesis & Debugging Workflow",
                description="Specialized pipeline for code generation, algorithmic implementation, and syntax debugging with explicit execution prohibition and test scaffolding.",
                supported_categories=["coding_debugging"],
                required_inputs=["prompt"],
                permitted_capabilities=["code_synthesis", "syntax_formatting", "algorithmic_analysis", "type_hinting"],
                permitted_tools=["input_sanitizer", "token_estimator", "json_formatter"],
                expected_output_format="annotated_code_blocks",
                safety_constraints=[
                    "Strict prohibition on executing generated source code or shell commands",
                    "Enforce input parameter boundary validation",
                    "Prevent injection and credential exfiltration payloads",
                ],
                timeout_seconds=45.0,
                max_retries=2,
                is_enabled=True,
                is_available=True,
            ),
            "structured_explanation_workflow": WorkflowDefinition(
                workflow_id="structured_explanation_workflow",
                version="v1.0.0",
                name="Pedagogical Structured Explanation Workflow",
                description="Educational workflow formatting conceptual breakdowns into intuition, formal principles, concrete examples, and key takeaways.",
                supported_categories=["explanation_learning"],
                required_inputs=["prompt"],
                permitted_capabilities=["pedagogical_breakdown", "conceptual_clarity", "structured_sections"],
                permitted_tools=["input_sanitizer", "token_estimator"],
                expected_output_format="pedagogical_structured_guide",
                safety_constraints=[
                    "Ensure technical accuracy according to authoritative definitions",
                    "Avoid unsubstantiated claims or speculative facts",
                ],
                timeout_seconds=35.0,
                max_retries=2,
                is_enabled=True,
                is_available=True,
            ),
            "step_by_step_reasoning_workflow": WorkflowDefinition(
                workflow_id="step_by_step_reasoning_workflow",
                version="v1.0.0",
                name="Decomposed Multi-Step Reasoning Workflow",
                description="Multi-stage reasoning workflow decomposing complex problems into explicit premises, deductive steps, edge case evaluation, and verified synthesis.",
                supported_categories=["multi_step_reasoning"],
                required_inputs=["prompt"],
                permitted_capabilities=["premise_decomposition", "deductive_reasoning", "edge_case_scrutiny"],
                permitted_tools=["input_sanitizer", "token_estimator"],
                expected_output_format="decomposed_reasoning_steps",
                safety_constraints=[
                    "Validate logical consistency between intermediate steps",
                    "Do not fabricate premises without grounding",
                ],
                timeout_seconds=40.0,
                max_retries=2,
                is_enabled=True,
                is_available=True,
            ),
            "structured_document_workflow": WorkflowDefinition(
                workflow_id="structured_document_workflow",
                version="v1.0.0",
                name="Structured Document & Analysis Workflow",
                description="Document synthesis workflow structuring long-form text, executive summaries, tabular interpretations, and analytical reports.",
                supported_categories=["structured_writing", "data_analysis"],
                required_inputs=["prompt"],
                permitted_capabilities=["document_structuring", "tabular_summary", "executive_synthesis"],
                permitted_tools=["input_sanitizer", "token_estimator", "json_formatter"],
                expected_output_format="formal_markdown_document",
                safety_constraints=[
                    "Maintain structured heading hierarchies",
                    "Clearly separate verified data findings from inferences",
                ],
                timeout_seconds=35.0,
                max_retries=2,
                is_enabled=True,
                is_available=True,
            ),
        }

        # 2. Registered Tools and Permission Boundaries
        # Safe internal tools are marked is_available=True.
        # Dangerous or unintegrated tools are explicitly marked is_available=False and status="unavailable".
        self._tools: Dict[str, WorkflowToolDefinition] = {
            "input_sanitizer": WorkflowToolDefinition(
                tool_id="input_sanitizer",
                name="Input Sanitizer & Boundary Filter",
                description="Validates prompt safety, screens injection patterns, and strips non-printable control characters.",
                is_available=True,
                status="available",
                requires_authorization=False,
                safety_boundary="Deterministic internal text sanitization; cannot execute code or access network.",
            ),
            "token_estimator": WorkflowToolDefinition(
                tool_id="token_estimator",
                name="Token & Complexity Estimator",
                description="Estimates token footprint and prompt complexity metrics for resource budgeting.",
                is_available=True,
                status="available",
                requires_authorization=False,
                safety_boundary="Read-only statistical heuristic calculation; zero external side-effects.",
            ),
            "json_formatter": WorkflowToolDefinition(
                tool_id="json_formatter",
                name="Safe JSON Structured Formatter",
                description="Parses, validates, and formats structured JSON responses without dynamic code execution.",
                is_available=True,
                status="available",
                requires_authorization=False,
                safety_boundary="Strict standard-library JSON parsing; rejects executable expressions or payloads.",
            ),
            "code_execution_sandbox": WorkflowToolDefinition(
                tool_id="code_execution_sandbox",
                name="Code Execution Sandbox",
                description="Dynamic arbitrary code execution environment (DISABLED by safety policy).",
                is_available=False,
                status="unavailable",
                requires_authorization=True,
                safety_boundary="Strictly prohibited: SafeLoop AI does not execute generated code or shell commands.",
            ),
            "live_web_search": WorkflowToolDefinition(
                tool_id="live_web_search",
                name="Live External Web Search",
                description="External web search integration (UNAVAILABLE in current deployment).",
                is_available=False,
                status="unavailable",
                requires_authorization=True,
                safety_boundary="No external search provider configured; calls are rejected with status unavailable.",
            ),
            "database_direct_query": WorkflowToolDefinition(
                tool_id="database_direct_query",
                name="Direct SQL Query Executor",
                description="Direct SQL execution against external datastores (UNAUTHORIZED).",
                is_available=False,
                status="unavailable",
                requires_authorization=True,
                safety_boundary="Unauthorized: direct arbitrary SQL execution is disallowed for security isolation.",
            ),
        }

    # -----------------------------------------------------------------------
    # Task Classification Service
    # -----------------------------------------------------------------------

    def classify_task(self, prompt: str) -> TaskClassificationResponse:
        """Classify a user task prompt into an appropriate category with confidence and signals.

        Deterministic, extensible intent classification.
        Never fabricates confidence or claims certainty without basis.
        """
        text = prompt.strip()
        lower = text.lower()
        length = len(text)

        # 1. Ambiguous or unsupported: extremely brief, greetings, or non-actionable input
        if length <= 3:
            return TaskClassificationResponse(
                category="ambiguous_unsupported",
                confidence=0.30,
                reasoning=f"Extremely brief input ({length} chars) with insufficient task context.",
                detected_intents=["brief_input"],
                suggested_workflow_id="default_chat_workflow",
                fallback_needed=True,
            )

        greeting_patterns = [r"^hi\b", r"^hello\b", r"^hey\b", r"^greetings\b", r"^good (morning|afternoon|evening)\b"]
        if any(re.match(p, lower) for p in greeting_patterns) and length < 25:
            return TaskClassificationResponse(
                category="ambiguous_unsupported",
                confidence=0.50,
                reasoning="Generic conversational greeting without explicit task requirements.",
                detected_intents=["greeting"],
                suggested_workflow_id="default_chat_workflow",
                fallback_needed=True,
            )

        # 2. Programming and debugging signals
        coding_signals: List[str] = []
        code_keywords = [
            "def ", "class ", "function", "import ", "const ", "let ", "var ",
            "return ", "lambda", "algorithm", "quicksort", "mergesort", "binary search",
            "sql", "select ", "insert ", "bug", "debug", "refactor", "syntax",
            "exception", "traceback", "stack trace", "python", "typescript", "javascript",
            "react", "fastapi", "docker", "git", "api endpoint", "json schema",
            "unit test", "pytest", "complexity", "time complexity", "o(n", "o(1"
        ]
        for kw in code_keywords:
            if kw in lower:
                coding_signals.append(kw.strip())

        # Check code fence or indentation blocks
        if "```" in text or "def " in text or "function(" in lower:
            coding_signals.append("code_block")

        if len(coding_signals) >= 2 or (len(coding_signals) == 1 and any(k in lower for k in ["code", "write a function", "debug", "implement"])):
            confidence = min(0.95, 0.75 + (len(coding_signals) * 0.05))
            return TaskClassificationResponse(
                category="coding_debugging",
                confidence=round(confidence, 2),
                reasoning=f"Detected programming syntax and technical signals: {', '.join(coding_signals[:5])}.",
                detected_intents=coding_signals[:6],
                suggested_workflow_id="code_synthesis_workflow",
                fallback_needed=False,
            )

        # 3. Multi-step reasoning & mathematical deduction signals
        reasoning_signals: List[str] = []
        reasoning_keywords = [
            "step by step", "step-by-step", "solve", "proof", "deduce", "deduction",
            "calculate", "probability", "logic puzzle", "premises", "causal chain",
            "evaluate the scenario", "mathematical", "derive", "find the value of",
            "how many ways", "contradiction"
        ]
        for kw in reasoning_keywords:
            if kw in lower:
                reasoning_signals.append(kw)

        if len(reasoning_signals) >= 1 and any(w in lower for w in ["solve", "step", "calculate", "prove", "why", "logic"]):
            confidence = min(0.92, 0.72 + (len(reasoning_signals) * 0.07))
            return TaskClassificationResponse(
                category="multi_step_reasoning",
                confidence=round(confidence, 2),
                reasoning=f"Identified multi-stage logical or mathematical reasoning requirements: {', '.join(reasoning_signals[:4])}.",
                detected_intents=reasoning_signals[:5],
                suggested_workflow_id="step_by_step_reasoning_workflow",
                fallback_needed=False,
            )

        # 4. Data analysis signals
        data_signals: List[str] = []
        data_keywords = [
            "analyze data", "dataset", "statistics", "trend", "correlation",
            "distribution", "metrics", "tabular", "csv", "summary statistics",
            "mean", "median", "standard deviation", "regression analysis"
        ]
        for kw in data_keywords:
            if kw in lower:
                data_signals.append(kw)

        if len(data_signals) >= 2:
            confidence = min(0.90, 0.70 + (len(data_signals) * 0.06))
            return TaskClassificationResponse(
                category="data_analysis",
                confidence=round(confidence, 2),
                reasoning=f"Detected statistical and dataset analytical signals: {', '.join(data_signals[:4])}.",
                detected_intents=data_signals[:5],
                suggested_workflow_id="structured_document_workflow",
                fallback_needed=False,
            )

        # 5. Explanation and learning signals
        explanation_signals: List[str] = []
        explanation_keywords = [
            "explain", "what is", "how does", "how do", "teach me", "overview of",
            "concept of", "understand", "difference between", "compare and contrast",
            "tutorial", "guide to", "deep dive", "principles of"
        ]
        for kw in explanation_keywords:
            if kw in lower:
                explanation_signals.append(kw)

        if len(explanation_signals) >= 1:
            confidence = min(0.90, 0.70 + (len(explanation_signals) * 0.08))
            return TaskClassificationResponse(
                category="explanation_learning",
                confidence=round(confidence, 2),
                reasoning=f"Found pedagogical inquiry and conceptual explanation patterns: {', '.join(explanation_signals[:4])}.",
                detected_intents=explanation_signals[:5],
                suggested_workflow_id="structured_explanation_workflow",
                fallback_needed=False,
            )

        # 6. Structured writing signals
        writing_signals: List[str] = []
        writing_keywords = [
            "write an essay", "write a report", "draft an email", "draft a letter",
            "write an article", "create an outline", "formal documentation",
            "executive summary", "press release", "speech", "write a story",
            "format as markdown", "structured document"
        ]
        for kw in writing_keywords:
            if kw in lower:
                writing_signals.append(kw)

        if len(writing_signals) >= 1:
            confidence = min(0.92, 0.74 + (len(writing_signals) * 0.07))
            return TaskClassificationResponse(
                category="structured_writing",
                confidence=round(confidence, 2),
                reasoning=f"Detected structured prose composition and drafting signals: {', '.join(writing_signals[:4])}.",
                detected_intents=writing_signals[:5],
                suggested_workflow_id="structured_document_workflow",
                fallback_needed=False,
            )

        # 7. General QA fallback
        return TaskClassificationResponse(
            category="general_qa",
            confidence=0.75,
            reasoning="General question answering task without specialized workflow patterns.",
            detected_intents=["general_query"],
            suggested_workflow_id="default_chat_workflow",
            fallback_needed=False,
        )

    # -----------------------------------------------------------------------
    # Workflow Registry Access
    # -----------------------------------------------------------------------

    def list_workflows(self) -> List[WorkflowDefinition]:
        """List all registered workflows."""
        return list(self._workflows.values())

    def get_workflow(self, workflow_id: str) -> Optional[WorkflowDefinition]:
        """Get details for a registered workflow by ID."""
        return self._workflows.get(workflow_id)

    def list_tools(self) -> List[WorkflowToolDefinition]:
        """List all capability tools with permission and availability status."""
        return list(self._tools.values())

    def get_tool(self, tool_id: str) -> Optional[WorkflowToolDefinition]:
        """Get a tool definition by ID."""
        return self._tools.get(tool_id)

    # -----------------------------------------------------------------------
    # Context-Aware Workflow Selection
    # -----------------------------------------------------------------------

    def preview_workflow_selection(
        self,
        prompt: str,
        requested_workflow_id: Optional[str] = None,
    ) -> WorkflowPreviewResponse:
        """Evaluate context, classification, and constraints to select the appropriate workflow."""
        classification = self.classify_task(prompt)
        category = classification.category
        confidence = classification.confidence

        # Retrieve validated Phase 6 memories if available
        retrieved_memory_ids: List[str] = []
        try:
            from app.services.memory_service import memory_service
            mem_items = memory_service.retrieve_relevant_memories(prompt=prompt)
            # Only consider validated, active memories
            retrieved_memory_ids = [item.memory.id for item in mem_items if item.memory.validation_status == "approved"]
        except Exception as exc:
            logger.debug("Memory retrieval skipped in workflow preview: %s", exc)

        # Handle manual override request
        if requested_workflow_id and requested_workflow_id.strip():
            target_id = requested_workflow_id.strip()
            wf = self.get_workflow(target_id)
            if wf and wf.is_enabled and wf.is_available:
                return WorkflowPreviewResponse(
                    selected_workflow_id=wf.workflow_id,
                    workflow_version=wf.version,
                    workflow_name=wf.name,
                    task_category=category,
                    confidence=confidence,
                    selection_reason=f"Explicitly requested workflow '{wf.workflow_id}' validated and approved.",
                    fallback_used=False,
                    relevant_memory_ids=retrieved_memory_ids,
                    permitted_tools=wf.permitted_tools,
                    alternatives_considered=[classification.suggested_workflow_id],
                )
            else:
                # Requested workflow unavailable or disabled -> fallback with explanation
                default_wf = self._workflows["default_chat_workflow"]
                return WorkflowPreviewResponse(
                    selected_workflow_id=default_wf.workflow_id,
                    workflow_version=default_wf.version,
                    workflow_name=default_wf.name,
                    task_category=category,
                    confidence=confidence,
                    selection_reason=f"Requested workflow '{target_id}' is unavailable or disabled; safe fallback to default conversational workflow.",
                    fallback_used=True,
                    relevant_memory_ids=retrieved_memory_ids,
                    permitted_tools=default_wf.permitted_tools,
                    alternatives_considered=[target_id, classification.suggested_workflow_id],
                )

        # Context-aware automated selection
        target_id = classification.suggested_workflow_id
        wf = self.get_workflow(target_id)

        # Check fallback condition
        if classification.fallback_needed or not wf or not wf.is_enabled or not wf.is_available or confidence < 0.60:
            default_wf = self._workflows["default_chat_workflow"]
            reason = (
                f"Task classification indicates ambiguous or unsupported requirements (confidence: {confidence:.2f}); "
                "safe fallback to standard conversational QA workflow."
            )
            return WorkflowPreviewResponse(
                selected_workflow_id=default_wf.workflow_id,
                workflow_version=default_wf.version,
                workflow_name=default_wf.name,
                task_category=category,
                confidence=confidence,
                selection_reason=reason,
                fallback_used=True,
                relevant_memory_ids=retrieved_memory_ids,
                permitted_tools=default_wf.permitted_tools,
                alternatives_considered=[target_id] if target_id != "default_chat_workflow" else [],
            )

        # Valid specialized workflow selected
        alternatives = [w_id for w_id in self._workflows.keys() if w_id != target_id][:2]
        reason = (
            f"Selected specialized {wf.name} based on verified {category} category "
            f"(confidence: {confidence:.2f}) with {len(retrieved_memory_ids)} validated supporting memory lesson(s)."
        )

        return WorkflowPreviewResponse(
            selected_workflow_id=wf.workflow_id,
            workflow_version=wf.version,
            workflow_name=wf.name,
            task_category=category,
            confidence=confidence,
            selection_reason=reason,
            fallback_used=False,
            relevant_memory_ids=retrieved_memory_ids,
            permitted_tools=wf.permitted_tools,
            alternatives_considered=alternatives,
        )

    # -----------------------------------------------------------------------
    # Tool Permission and Execution Boundaries
    # -----------------------------------------------------------------------

    def execute_tool(self, tool_id: str, parameters: Dict[str, Any]) -> ToolExecuteResponse:
        """Enforce strict tool permission boundaries and execute permitted safe internal tools.

        Rejects unknown, disabled, or unauthorized tools with explicit permission errors.
        Never executes arbitrary code, shell commands, or unintegrated tools.
        """
        start_time = time.perf_counter()
        tool_def = self.get_tool(tool_id)

        if not tool_def:
            raise ValueError(f"Tool '{tool_id}' is not registered in the tool allowlist.")

        if not tool_def.is_available or tool_def.status != "available":
            raise PermissionError(
                f"Tool '{tool_id}' is unavailable and unauthorized for execution under Phase 7 safety policies "
                f"({tool_def.safety_boundary})."
            )

        # Execute permitted safe internal tool
        try:
            if tool_id == "input_sanitizer":
                input_text = str(parameters.get("text", ""))
                # Strip non-printable control characters, normalize line endings
                sanitized = "".join(ch for ch in input_text if ch.isprintable() or ch in "\n\r\t").strip()
                latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
                return ToolExecuteResponse(
                    tool_id=tool_id,
                    success=True,
                    output={"sanitized_text": sanitized, "original_length": len(input_text), "sanitized_length": len(sanitized)},
                    latency_ms=latency_ms,
                )

            elif tool_id == "token_estimator":
                input_text = str(parameters.get("text", ""))
                # Standard statistical heuristic: ~4 characters per token
                char_count = len(input_text)
                word_count = len(input_text.split())
                est_tokens = max(1, round(char_count / 4.0)) if char_count > 0 else 0
                latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
                return ToolExecuteResponse(
                    tool_id=tool_id,
                    success=True,
                    output={"estimated_tokens": est_tokens, "character_count": char_count, "word_count": word_count},
                    latency_ms=latency_ms,
                )

            elif tool_id == "json_formatter":
                raw_json = str(parameters.get("json_text", ""))
                parsed = json.loads(raw_json)
                formatted = json.dumps(parsed, indent=2)
                latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
                return ToolExecuteResponse(
                    tool_id=tool_id,
                    success=True,
                    output={"formatted_json": formatted, "valid": True},
                    latency_ms=latency_ms,
                )

            else:
                raise PermissionError(f"Tool '{tool_id}' does not have an approved execution handler.")

        except json.JSONDecodeError as j_err:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return ToolExecuteResponse(
                tool_id=tool_id,
                success=False,
                output=f"JSON validation failed: {str(j_err)}",
                latency_ms=latency_ms,
            )
        except Exception as exc:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return ToolExecuteResponse(
                tool_id=tool_id,
                success=False,
                output=f"Tool execution failed: {str(exc)}",
                latency_ms=latency_ms,
            )

    # -----------------------------------------------------------------------
    # Workflow Execution Engine
    # -----------------------------------------------------------------------

    async def execute_workflow(
        self,
        prompt: str,
        task_id: Optional[str] = None,
        workflow_id_override: Optional[str] = None,
        timeout_seconds: float = 30.0,
    ) -> WorkflowExecuteResponse:
        """Execute a task using context-aware workflow selection and record telemetry."""
        start_time = time.perf_counter()
        effective_task_id = task_id.strip() if (task_id and task_id.strip()) else f"task_{uuid.uuid4().hex[:8]}"

        # 1. Preview and select workflow
        preview = self.preview_workflow_selection(prompt, requested_workflow_id=workflow_id_override)
        selected_wf_id = preview.selected_workflow_id
        wf = self.get_workflow(selected_wf_id) or self._workflows["default_chat_workflow"]

        # 2. Build specialized workflow system instructions
        specialized_instruction = self._build_workflow_system_instruction(wf, preview)

        # 3. Execute via agent service with bounded timeout and safe retry policy
        response_text = ""
        execution_status = "success"
        error_category = None
        fallback_used = preview.fallback_used

        max_attempts = min(2, wf.max_retries + 1)
        last_error = None

        for attempt in range(1, max_attempts + 1):
            try:
                chat_res = await agent_service.generate_chat(
                    prompt=prompt,
                    task_id=effective_task_id,
                    system_instruction=specialized_instruction,
                    timeout_seconds=min(timeout_seconds, wf.timeout_seconds),
                )
                response_text = chat_res.text
                break
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Workflow '%s' attempt %d/%d failed for task %s: %s",
                    selected_wf_id,
                    attempt,
                    max_attempts,
                    effective_task_id,
                    exc,
                )
                if attempt < max_attempts:
                    await asyncio.sleep(0.5)

        # If specialized workflow execution failed after retries, safe fallback to default chat
        if not response_text and last_error:
            if selected_wf_id != "default_chat_workflow":
                logger.info("Engaging safe fallback to default conversational chat for task %s", effective_task_id)
                try:
                    fallback_res = await agent_service.generate_chat(
                        prompt=prompt,
                        task_id=effective_task_id,
                        system_instruction=None,
                        timeout_seconds=30.0,
                    )
                    response_text = fallback_res.text
                    execution_status = "fallback"
                    fallback_used = True
                    error_category = f"specialized_workflow_error: {type(last_error).__name__}"
                except Exception as fb_exc:
                    execution_status = "failure"
                    error_category = f"fallback_failed: {type(fb_exc).__name__}"
                    response_text = f"SafeLoop AI workflow execution encountered an error: {str(fb_exc)}"
            else:
                execution_status = "failure"
                error_category = f"execution_error: {type(last_error).__name__}"
                response_text = f"SafeLoop AI workflow execution encountered an error: {str(last_error)}"

        total_latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # 4. Record execution telemetry in SQLite database
        self._record_execution(
            task_id=effective_task_id,
            workflow_id=selected_wf_id,
            workflow_version=wf.version,
            task_category=preview.task_category,
            confidence=preview.confidence,
            selection_reason=preview.selection_reason,
            fallback_used=fallback_used,
            memory_ids_used=preview.relevant_memory_ids,
            execution_status=execution_status,
            latency_ms=total_latency_ms,
            error_category=error_category,
            validation_passed=bool(response_text and len(response_text) > 0),
        )

        return WorkflowExecuteResponse(
            task_id=effective_task_id,
            workflow_id=selected_wf_id,
            workflow_version=wf.version,
            task_category=preview.task_category,
            confidence=preview.confidence,
            selection_reason=preview.selection_reason,
            fallback_used=fallback_used,
            memory_ids_used=preview.relevant_memory_ids,
            response_text=response_text,
            latency_ms=total_latency_ms,
            status=execution_status,
        )

    def _build_workflow_system_instruction(
        self,
        workflow: WorkflowDefinition,
        preview: WorkflowPreviewResponse,
    ) -> str:
        """Compose bounded specialized guidelines tailored to the chosen workflow."""
        instructions: List[str] = [
            f"You are executing SafeLoop AI Workflow '{workflow.name}' ({workflow.version}).",
            "Mandatory Safety Rule: You cannot execute arbitrary shell commands, access private credentials, or execute external source code.",
        ]

        if workflow.workflow_id == "code_synthesis_workflow":
            instructions.extend([
                "Provide syntactically valid, production-grade code with explicit type annotations.",
                "Include clean unit tests or demonstration cases covering normal and boundary conditions.",
                "Ensure robust input validation and defensive error handling.",
                "Do NOT attempt to execute commands or run scripts directly.",
            ])
        elif workflow.workflow_id == "structured_explanation_workflow":
            instructions.extend([
                "Format explanation into four clear sections: 1. Core Concept Intuition, 2. Formal Technical Principles, 3. Concrete Example, 4. Summary & Takeaways.",
                "Use precise definitions without ungrounded speculation.",
            ])
        elif workflow.workflow_id == "step_by_step_reasoning_workflow":
            instructions.extend([
                "Structure reasoning into: Step 1 (Problem Breakdown & Premises), Step 2 (Deductive Derivation), Step 3 (Edge Case & Sanity Verification), Step 4 (Final Synthesis).",
                "State intermediate conclusions explicitly before proceeding.",
            ])
        elif workflow.workflow_id == "structured_document_workflow":
            instructions.extend([
                "Structure output with markdown headings (#, ##, ###), bullet lists, and summary tables where relevant.",
                "Ensure clear executive synthesis and separate factual data from analytical takeaways.",
            ])

        # Phase 5: Incorporate active continuous improvement guidelines if present
        try:
            from app.services.improvement_service import improvement_service
            active_cfg = improvement_service.get_active_configuration()
            if active_cfg and active_cfg.instructions:
                instructions.append("Continuous Improvement Guidelines:")
                instructions.extend(f"- {inst}" for inst in active_cfg.instructions)
        except Exception:
            pass

        return "\n".join(instructions)

    # -----------------------------------------------------------------------
    # Database Telemetry & Metrics Persistence
    # -----------------------------------------------------------------------

    def _record_execution(
        self,
        task_id: str,
        workflow_id: str,
        workflow_version: str,
        task_category: str,
        confidence: float,
        selection_reason: str,
        fallback_used: bool,
        memory_ids_used: List[str],
        execution_status: str,
        latency_ms: float,
        error_category: Optional[str],
        validation_passed: bool,
    ) -> None:
        """Persist execution record to the workflow_executions table."""
        created_at = datetime.now(timezone.utc).isoformat()
        memory_ids_str = json.dumps(memory_ids_used)

        try:
            with get_db_connection(self._db_path) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO workflow_executions (
                        task_id, workflow_id, workflow_version, task_category,
                        confidence, selection_reason, fallback_used, memory_ids_used,
                        execution_status, latency_ms, error_category, validation_passed,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        task_id,
                        workflow_id,
                        workflow_version,
                        task_category,
                        confidence,
                        selection_reason,
                        1 if fallback_used else 0,
                        memory_ids_str,
                        execution_status,
                        latency_ms,
                        error_category,
                        1 if validation_passed else 0,
                        created_at,
                    ),
                )
                conn.commit()
            logger.info(
                "Recorded workflow execution #%s (workflow=%s, category=%s, status=%s, latency=%sms)",
                task_id,
                workflow_id,
                task_category,
                execution_status,
                latency_ms,
            )
        except Exception as exc:
            logger.error("Failed to record workflow execution telemetry: %s", exc)

    def list_executions(
        self,
        limit: int = 50,
        offset: int = 0,
        workflow_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> WorkflowExecutionListResponse:
        """Retrieve paginated recorded workflow executions."""
        query = "SELECT * FROM workflow_executions"
        count_query = "SELECT COUNT(*) FROM workflow_executions"
        params: List[Any] = []
        where_clauses: List[str] = []

        if workflow_id:
            where_clauses.append("workflow_id = ?")
            params.append(workflow_id)
        if status:
            where_clauses.append("execution_status = ?")
            params.append(status)

        if where_clauses:
            clause = " WHERE " + " AND ".join(where_clauses)
            query += clause
            count_query += clause

        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?;"
        exec_params = list(params) + [limit, offset]

        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(count_query, params)
            total = cursor.fetchone()[0]

            cursor.execute(query, exec_params)
            rows = cursor.fetchall()

        items = []
        for r in rows:
            try:
                m_ids = json.loads(r["memory_ids_used"]) if r["memory_ids_used"] else []
            except Exception:
                m_ids = []
            items.append(
                WorkflowExecutionRecord(
                    id=r["id"],
                    task_id=r["task_id"],
                    workflow_id=r["workflow_id"],
                    workflow_version=r["workflow_version"],
                    task_category=r["task_category"],
                    confidence=r["confidence"],
                    selection_reason=r["selection_reason"],
                    fallback_used=bool(r["fallback_used"]),
                    memory_ids_used=m_ids,
                    execution_status=r["execution_status"],
                    latency_ms=r["latency_ms"],
                    error_category=r["error_category"],
                    validation_passed=bool(r["validation_passed"]),
                    created_at=r["created_at"],
                )
            )

        return WorkflowExecutionListResponse(items=items, total=total, limit=limit, offset=offset)

    def get_metrics(self) -> WorkflowMetricsResponse:
        """Compute aggregate workflow metrics from recorded executions."""
        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM workflow_executions;")
            total = cursor.fetchone()[0]

            if total == 0:
                return WorkflowMetricsResponse(
                    total_executions=0,
                    success_rate=100.0,
                    fallback_rate=0.0,
                    average_latency_ms=0.0,
                    executions_by_category={},
                    executions_by_workflow={},
                )

            cursor.execute(
                """
                SELECT
                    SUM(CASE WHEN execution_status = 'success' THEN 1 ELSE 0 END) as success_count,
                    SUM(CASE WHEN fallback_used = 1 THEN 1 ELSE 0 END) as fallback_count,
                    AVG(latency_ms) as avg_latency
                FROM workflow_executions;
                """
            )
            row = cursor.fetchone()
            success_count = row["success_count"] or 0
            fallback_count = row["fallback_count"] or 0
            avg_latency = round(float(row["avg_latency"] or 0.0), 2)

            cursor.execute("SELECT task_category, COUNT(*) as cnt FROM workflow_executions GROUP BY task_category;")
            cat_rows = cursor.fetchall()
            by_category = {r["task_category"]: r["cnt"] for r in cat_rows}

            cursor.execute("SELECT workflow_id, COUNT(*) as cnt FROM workflow_executions GROUP BY workflow_id;")
            wf_rows = cursor.fetchall()
            by_workflow = {r["workflow_id"]: r["cnt"] for r in wf_rows}

        success_rate = round((success_count / total) * 100.0, 1)
        fallback_rate = round((fallback_count / total) * 100.0, 1)

        return WorkflowMetricsResponse(
            total_executions=total,
            success_rate=success_rate,
            fallback_rate=fallback_rate,
            average_latency_ms=avg_latency,
            executions_by_category=by_category,
            executions_by_workflow=by_workflow,
        )


import asyncio  # Needed for asyncio.sleep in retries

# Singleton instance for application lifecycle
workflow_service = WorkflowService()
