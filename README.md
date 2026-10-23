# SafeLoop AI

> **Feedback-Driven Closed-Loop Continuous Improvement of Agentic AI Systems Without Model Retraining**

SafeLoop AI is an agentic AI engineering framework designed to enable continuous, self-improving agent performance through closed-loop human and automated feedback. Rather than relying on costly, slow, and non-deterministic model fine-tuning or weight retraining, SafeLoop AI indexes validated user critiques and operational corrections into a safe, persistent strategy memory layer with defensive regression gating and evidence-based continuous evaluation.

---

## Architecture Overview

```text
                                  +---------------------------------------+
                                  |         User / AI Playground          |
                                  +-------------------+-------------------+
                                                      |
                                                      v
                                        +---------------------------+
                                        |  Task Classification &    |
                                        |    Workflow Optimization  | (Phase 7)
                                        +-------------+-------------+
                                                      |
                                                      v
                          +-------------------------------------------------------+
                          |   Agent Execution Engine (Google Gemini Integration)  | (Phase 1-2)
                          |   + Active Configuration & Behavioral Guidelines      | (Phase 5)
                          |   + Retrieved Adaptive Learning Memories              | (Phase 6)
                          +---------------------------+---------------------------+
                                                      |
                                                      v
                                        +---------------------------+
                                        |    Feedback Collection    | (Phase 3)
                                        | (Helpful / Not / Correct) |
                                        +-------------+-------------+
                                                      |
                                                      v
                                        +---------------------------+
                                        |  Quality Evaluation Engine| (Phase 4)
                                        |  + Hard Safety Gate       |
                                        +-------------+-------------+
                                                      |
                         +----------------------------+----------------------------+
                         |                                                         |
                         v                                                         v
         +-------------------------------+                         +-------------------------------+
         | Persistent Adaptive Memory    | (Phase 6)               | Controlled Improvement        | (Phase 5)
         | + Provenance Audit Trail      |                         | + Proposal Generation         |
         | + Scoped Relevance Retrieval  |                         | + Static Safety Verification  |
         +-------------------------------+                         | + Regression Benchmark Gate   |
                                                                   | + Human Review Approval       |
                                                                   | + Atomic Version Activation   |
                                                                   +---------------+---------------+
                                                                                   |
                                                                                   v
                                        +---------------------------+  <-----------+
                                        |   Continuous Monitoring   | (Phase 8)
                                        |  + Real Telemetry Metrics |
                                        |  + Baseline Comparisons  |
                                        |  + Guardrails & Rollbacks |
                                        +-------------+-------------+
                                                      |
                                                      v
                                        +---------------------------+
                                        |   Continuous Evaluation   | (Phase 9)
                                        |  + Versioned Benchmarks   |
                                        |  + Regression Analytics   |
                                        |  + Failure Clustering     |
                                        |  + Evidence Recommendations|
                                        +---------------------------+
```

---

## Key Features & Phase Breakdown

- **Phase 1: Foundation & Design System**: Dark-themed AI engineering dashboard, strict TypeScript contracts, FastAPI service foundation, and zero-fake telemetry.
- **Phase 2: Gemini Agent Integration**: Official Google GenAI SDK integration (`google-genai`), latency telemetry, and server-side secret isolation.
- **Phase 3: Feedback Collection Engine**: Indexed feedback collection with binary votes, ratings, and structured corrective demonstrations.
- **Phase 4: Feedback Quality Evaluation**: Deterministic multi-factor scoring (0–100), automated decisions (`approved`, `needs_review`, `rejected`), and prompt injection safety gates.
- **Phase 5: Controlled Continuous Improvement**: Proposal generation, safety checks, benchmark regression suite, immutable configuration versioning (`v1.0.0` -> `v1.1.0`), and strict approval gates before activation.
- **Phase 6: Persistent Adaptive Memory**: Provenance tracking, domain classification, privacy screening, and runtime memory retrieval without weight modification.
- **Phase 7: Context-Aware Workflow Selection**: Intent classification across 7 task categories, specialized workflow execution, tool allowlisting, and fallback resilience.
- **Phase 8: Continuous Monitoring & Safety Guardrails**: Real operational metrics, versioned baseline comparisons, deduplicated alert queue, and atomic rollback to known-good versions.
- **Phase 9: Evaluation Analytics & Insights**: Repeatable benchmark runs on golden datasets (`ds_v1_standard`), empirical failure pattern clustering, and evidence-backed recommendations.
- **Phase 10: Final Integration & Production Readiness**: Comprehensive E2E closed-loop integration, 124 passing backend tests, optimized frontend production bundle, and sanitized configuration.

---

## Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.13+)
- **Server**: Uvicorn (ASGI)
- **AI SDK**: Official `google-genai` SDK
- **Data Persistence**: SQLite with WAL mode (`PRAGMA journal_mode = WAL;`)
- **Validation**: Pydantic v2 & Pydantic Settings
- **Testing**: Pytest, AnyIO, HTTPX (124 automated tests)

### Frontend
- **Framework**: React 18
- **Language**: TypeScript (strict mode)
- **Build Tool**: Vite
- **Icons**: Lucide React
- **Architecture**: Single-page application with URL hash routing (`#overview`, `#improvement`, etc.) and Error Boundary containment

---

## Requirements & Environment Setup

### Prerequisites
- **Python**: 3.13+ installed
- **Node.js**: 18.x or 20.x+ installed
- **Operating System**: Windows 10/11, macOS, or Linux

### 1. Backend Setup (Windows PowerShell)

```powershell
# Navigate to backend directory
cd D:\SafeLoop-AI\backend

# Create virtual environment (if not already created)
python -m venv .venv

# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
Copy-Item .env.example .env
# Edit .env to add your GEMINI_API_KEY from Google AI Studio
```

### 2. Frontend Setup (Windows PowerShell)

```powershell
# Navigate to frontend directory
cd D:\SafeLoop-AI\frontend

# Install dependencies
npm install

# Configure environment variables
Copy-Item .env.example .env
# Default VITE_API_BASE_URL is http://127.0.0.1:8001 (or http://127.0.0.1:8000)
```

---

## Environment Variables

All sensitive credentials remain strictly server-side. **Never commit `.env` files to Git.**

### Backend (`backend/.env`)

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `APP_NAME` | Service title | `"SafeLoop AI"` |
| `APP_VERSION` | Application version | `"0.1.0"` |
| `ENVIRONMENT` | Runtime mode | `"development"` / `"production"` |
| `DEBUG` | Enable debug logs | `true` / `false` |
| `HOST` | Backend bind host | `"127.0.0.1"` |
| `PORT` | Backend port | `8001` (or `8000`) |
| `ALLOWED_ORIGINS` | CORS origins JSON array | `["http://localhost:5173", "http://127.0.0.1:5173"]` |
| `DATABASE_PATH` | SQLite database file | `backend/data/safeloop.db` |
| `GEMINI_API_KEY` | Google AI Studio API key | `"your_gemini_api_key_here"` |
| `GEMINI_MODEL` | Gemini model name | `"gemini-2.5-flash"` |
| `MEMORY_RETRIEVAL_ENABLED` | Dynamic memory retrieval flag | `true` |
| `MEMORY_MAX_RETRIEVAL_COUNT`| Max memories per chat request | `3` |
| `MEMORY_MIN_RELEVANCE_SCORE`| Minimum relevance threshold | `0.25` |

### Frontend (`frontend/.env`)

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Base URL of FastAPI backend | `http://127.0.0.1:8001` |

---

## Starting the Application on Windows

### 1. Launch Backend Server

In a PowerShell terminal:
```powershell
cd D:\SafeLoop-AI\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```
The backend starts at `http://127.0.0.1:8001`.

### 2. Launch Frontend Dev Server

In a second PowerShell terminal:
```powershell
cd D:\SafeLoop-AI\frontend
npm run dev
```
The frontend is available at `http://localhost:5173`.

---

## Running Automated Tests

### Backend Tests (124 tests across 11 test suites)

```powershell
cd D:\SafeLoop-AI
python -m pytest backend/tests -v
```

### Frontend Typecheck & Production Build

```powershell
cd D:\SafeLoop-AI\frontend

# Run strict TypeScript check
npm run typecheck

# Run production Vite build
npm run build
```

---

## Interactive API Documentation

FastAPI auto-generates interactive OpenAPI documentation:
- **Swagger UI**: `http://127.0.0.1:8001/docs`
- **ReDoc UI**: `http://127.0.0.1:8001/redoc`
- **Root Service Metadata**: `http://127.0.0.1:8001/`

---

## 5-Minute Live Demonstration Script

| Timing | View / Endpoint | Action & Talking Points |
| :--- | :--- | :--- |
| **0:00 - 0:45** | **AI Playground** (`#playground`) | **Agent Task Execution**: Enter a Python prompt: *"How do I sort a list in Python?"*. Execute and highlight telemetry badges (model, roundtrip latency in ms, task ID). Point out that the agent is governed by immutable versioned guidelines (`v1.0.0`). |
| **0:45 - 1:30** | **Feedback Capture** (`#playground` / `#feedback`) | **Feedback & Rubric Scoring**: Click the feedback drawer on the response. Submit a **Correction**: *"Always specify that list.sort() sorts in place, while sorted() returns a new list."* Navigate to **Feedback** (`#feedback`), view the newly captured record, and demonstrate deterministic scoring and safety validation. |
| **1:30 - 2:30** | **Continuous Improvement** (`#improvement`) | **Controlled Improvement Pipeline**: In **Continuous Improvement**, review the proposal generated from the feedback. Show that candidate instructions cannot activate directly (status: `draft`). Run the 5-point **Regression Benchmark**, execute human approval, and activate to bump version to `v1.1.0`. Show the verifiable audit log. |
| **2:30 - 3:15** | **Learning Memory** (`#memory`) | **Adaptive Memory Persistence**: Open **Learning Memory**, show the approved memory candidate for `"Python List Sorting In-Place vs New"`. Demonstrate test retrieval with query *"How do I sort without modifying original?"* to show relevant memory extraction without fine-tuning. |
| **3:15 - 4:00** | **Monitoring & Safety** (`#safety`) | **Safety Guardrails & Rollbacks**: Open **Monitoring & Safety**. Show real system telemetry (labeled sample count, regression pass rate, zero fake data). Review the baseline comparison against `v1.0.0` and explain how safety violations trigger critical alerts and atomic rollback to known-good versions. |
| **4:00 - 5:00** | **Continuous Evaluation** (`#evaluation`) | **Empirical Evaluation & Recommendations**: Open **Evaluation**. Inspect the latest benchmark run against golden dataset `ds_v1_standard`. Show delta comparisons between versions, failure pattern clustering, and explain why SafeLoop AI rejects claims of improvement unless backed by statistically valid empirical evidence. |

---

## Production Deployment & Readiness Checklist

### Deployment Architecture
- **Reverse Proxy**: Nginx or Caddy terminating TLS, serving static frontend files from `frontend/dist`, and proxying `/api` and `/health` requests to `127.0.0.1:8001`.
- **Application Server**: Uvicorn running under `systemd` or as a container process.
- **Process Supervisor**: Restart-on-failure policy with structured log forwarding to stdout.

### Pre-Deployment Checklist
- [x] All 124 backend tests passing (`pytest backend/tests`).
- [x] Zero TypeScript compilation errors (`tsc --noEmit`).
- [x] Frontend production bundle built (`npm run build`).
- [x] `backend/.env` and `frontend/.env` excluded from version control (`.gitignore`).
- [x] SQLite database directory (`backend/data/`) excluded from version control.
- [x] CORS `ALLOWED_ORIGINS` locked to trusted production domains.
- [x] API key isolated server-side with no exposure in client bundles or API responses.
- [x] Baseline configuration (`v1.0.0`) initialized and immutable.

### Known Limitations & Operational Boundaries
1. **SQLite Concurrency**: SQLite with WAL mode is optimal for single-node deployments. If horizontally scaling to multiple backend instances, configure an external PostgreSQL database.
2. **Statistical Significance**: Evaluation comparisons require a minimum of 5 labeled test cases before concluding statistically significant improvement; smaller sample sizes are appropriately flagged as `insufficient_data` or `inconclusive`.
3. **Model Dependence**: SafeLoop AI enforces strict behavioral instructions and adaptive memories without model weight retraining. Prompt instructions assume modern instruction-following LLMs (Gemini 2.5 Flash).
