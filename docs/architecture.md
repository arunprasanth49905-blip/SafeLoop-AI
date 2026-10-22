# SafeLoop AI — Architectural Blueprint

> **SafeLoop AI: Safe Feedback-Driven Continuous Improvement of Agentic AI Systems Without Model Retraining**

## 1. Architectural Philosophy

Traditional machine learning requires expensive, slow, and high-risk weight retraining loops (fine-tuning, RLHF) to adapt models to user feedback. In contrast, **SafeLoop AI** implements a **closed-loop feedback adaptation architecture** for LLM-based agentic systems that continuously improves agent behavior *without touching underlying model weights*.

Continuous adaptation is achieved via:
1. **Dynamic Prompt & Context Injection**: Modifying runtime instructions using retrieved, verified strategies.
2. **Persistent Strategy Memory**: Storing human feedback, corrective demonstrations, and successful execution patterns as structured memory vectors and rule constraints.
3. **Safety & Plausibility Gating**: Filtering feedback through multi-stage safety validators to prevent prompt injection, behavioral regression, and memory poisoning.
4. **Deterministic Rollback & Benchmarking**: Evaluating updated memory against baseline tasks prior to deployment, rolling back regression-causing memory nodes immediately.

```mermaid
flowchart TD
    User([User / Engineer]) <--> Frontend[React + Vite Frontend UI]
    Frontend <--> Backend[FastAPI Backend Gateway]

    subgraph Phase 1: Operational Foundation
        HealthService[Health Telemetry Service]
        AgentService[Agent Status Service]
    end

    Backend --> HealthService
    Backend --> AgentService

    subgraph Future Core Engine (Phases 2 - 7)
        Gemini[Google Gemini 1.5/2.0 API]
        FeedbackCollector[Feedback Collection Engine - Phase 3]
        SafetyGate[Safety & Regression Validator - Phase 5/6]
        MemoryStore[(Persistent Strategy Memory - Phase 4)]
        EvalEngine[Continuous Evaluation Engine - Phase 7]
    end

    Backend -.->|Phase 2| Gemini
    Frontend -.->|Phase 3| FeedbackCollector
    FeedbackCollector -.-> SafetyGate
    SafetyGate -.->|Approved Updates| MemoryStore
    MemoryStore -.->|Contextual Strategy Retrieval| Gemini
    EvalEngine -.->|Regression Gate| SafetyGate
```

---

## 2. Component Architecture

### 2.1 Frontend Client (`frontend/`)
- **Technology**: React 18, Vite, TypeScript, Lucide React, Modern CSS Modules/Variables.
- **Role**: Operator workstation providing clear visibility into system health, runtime agent performance, feedback collection, memory index inspection, safety validation logs, and continuous benchmarks.
- **Principles**:
  - Restrained, professional developer-first interface.
  - Zero mock data or fabricated metrics.
  - Type-safe communication with the backend.
  - Absolute isolation from private credentials (no API keys in frontend).

### 2.2 FastAPI Backend Gateway (`backend/app/`)
- **Technology**: Python 3.13+, FastAPI, Uvicorn, Pydantic V2, Pydantic Settings.
- **Role**: Central coordinator managing API routes, configuration validation, agent execution orchestration, feedback ingestion, and security boundaries.
- **Modular Layout**:
  - `app/api/routes/`: Route declarations and HTTP status handling (`health.py`, `agent.py`).
  - `app/core/`: Configuration schemas (`config.py`) and secret-safe logging (`logging.py`).
  - `app/models/`: Pydantic request and response schemas enforcing data contracts.
  - `app/services/`: Reusable business logic layers (`agent_service.py`).

### 2.3 AI Agent Provider (`google-gemini`) *(Scheduled for Phase 2)*
- **Integration**: Google Gemini 1.5 Flash / Pro via official Google Generative AI SDK.
- **Role**: Executes tasks, multi-step tool calls, and code generation.
- **Context Injection**: During inference, the agent dynamically receives retrieved strategy instructions from the memory store alongside system prompts.

### 2.4 Feedback Collection Engine *(Scheduled for Phase 3)*
- **Role**: Collects user signals across three primary modalities:
  1. *Binary & Categorical Ratings* (e.g., thumbs up/down, rubrics).
  2. *Correction Demonstrations* (e.g., user supplies correct code or expected output).
  3. *Critique Annotations* (e.g., "avoid using deprecated library method X").

### 2.5 Persistent Strategy Memory Store *(Scheduled for Phase 4)*
- **Role**: Indexes verified learning memories and operational strategies.
- **Storage Modalities**:
  - Semantic vector store for similarity-based retrieval during task execution.
  - Rule-based constraint index for negative constraints (what *not* to do).

### 2.6 Safety & Regression Gating Engine *(Scheduled for Phases 5 & 6)*
- **Role**: Defensive firewall preventing memory poisoning and performance regressions.
- **Safety Checks**:
  - Feedback plausibility check: Prevents malicious or low-quality feedback from altering agent behavior.
  - Injection detection: Screens incoming feedback for jailbreaks or prompt injection attacks.
  - Automated canary evaluation: Evaluates proposed strategies on baseline regression suites before committing to active memory.

### 2.7 Continuous Evaluation Dashboard *(Scheduled for Phase 7)*
- **Role**: Tracks key empirical performance indicators:
  - Task Success Rate (%)
  - Accuracy (%)
  - User Satisfaction Score
  - Latency Profiles (p50, p95, p99)
  - Consistency & Alignment Score
  - Regression Rate (%)

---

## 3. Communication & Security Standards

1. **Strict Secret Isolation**:
   - `GEMINI_API_KEY` is loaded exclusively inside the backend server via `pydantic-settings`.
   - The frontend never receives, displays, or transmits credentials.
2. **Strict CORS Policy**:
   - Explicit allowed origins (`http://localhost:5173`, `http://127.0.0.1:5173`).
   - Wildcard origins (`*`) are disallowed when credentials are enabled.
3. **Data Integrity & Typings**:
   - Shared schema contract between Pydantic response models and TypeScript interfaces.
