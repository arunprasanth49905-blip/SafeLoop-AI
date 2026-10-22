# SafeLoop AI

> **Safe Feedback-Driven Continuous Improvement of Agentic AI Systems Without Model Retraining**

SafeLoop AI is an agentic AI engineering framework designed to enable continuous, self-improving performance through closed-loop human and automated feedback. Rather than relying on costly, slow, and non-deterministic model fine-tuning or weight retraining, SafeLoop AI indexes validated user critiques and operational corrections into a safe, persistent strategy memory layer with defensive regression gating.

---

## Current Status: Phase 1 Foundation

**Phase 1** establishes the clean, decoupled architectural foundation of SafeLoop AI:
- Robust **FastAPI backend** with environment-driven settings (`pydantic-settings`), real `/health` monitoring, and non-sensitive `/api/agent/status` reporting.
- Modern **React 18 + TypeScript + Vite** frontend UI featuring a restrained, professional dark engineering design, active backend status telemetry, and interactive navigation across 7 system views.
- **Strict credential isolation**: AI keys are never exposed in logs, frontend bundles, or client responses.
- **Zero fake metrics / mock data**: All metrics display genuine empty states or em dashes until respective backend engines are activated in future phases.

---

## Technology Stack

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript (strict mode)
- **Icons**: Lucide React
- **Styling**: CSS Variables & responsive modern stylesheet (no external CSS framework bloat)

### Backend
- **Framework**: FastAPI
- **Server**: Uvicorn
- **Validation & Settings**: Pydantic v2 & Pydantic Settings
- **Testing**: Pytest, AnyIO, HTTPX
- **Compatibility**: Python 3.13+

---

## Directory Structure

```text
SafeLoop-AI/
├── .gitignore
├── README.md
├── docs/
│   ├── architecture.md
│   └── phase-roadmap.md
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── routes/
│   │   │       ├── __init__.py
│   │   │       ├── health.py
│   │   │       └── agent.py
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py
│   │   │   └── logging.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   └── schemas.py
│   │   └── services/
│   │       ├── __init__.py
│   │       └── agent_service.py
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py
│       ├── test_health.py
│       └── test_agent.py
└── frontend/
    ├── .env.example
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    ├── public/
    │   └── safeloop-logo.svg
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── components/
        │   ├── EmptyState.tsx
        │   ├── Header.tsx
        │   ├── MetricPlaceholder.tsx
        │   ├── Sidebar.tsx
        │   └── StatusBadge.tsx
        ├── hooks/
        │   └── useSystemStatus.ts
        ├── layouts/
        │   └── DashboardLayout.tsx
        ├── pages/
        │   ├── EvaluationPage.tsx
        │   ├── FeedbackPage.tsx
        │   ├── MemoryPage.tsx
        │   ├── OverviewPage.tsx
        │   ├── PlaygroundPage.tsx
        │   ├── SafetyPage.tsx
        │   └── SettingsPage.tsx
        ├── services/
        │   └── api.ts
        ├── styles/
        │   ├── global.css
        │   └── theme.css
        └── types/
            └── index.ts
```

---

## Prerequisites

- **Python**: Version 3.13 or higher (`python --version`)
- **Node.js**: Version 18+ or 20+ (`node --version`)
- **Package Manager**: npm 9+ (`npm --version`)

---

## Local Development Setup

### 1. Backend Setup

Open a Command Prompt or PowerShell terminal in the project root:

```cmd
cd backend
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
copy .env.example .env
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

> **Note**: If port `8000` is already in use by another service on your machine, specify a different port (e.g., `--port 8001`) and update `VITE_API_BASE_URL` in `frontend/.env` accordingly.

Verify the backend in your browser or with curl:
- **Root info**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Health check**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- **Agent status**: [http://127.0.0.1:8000/api/agent/status](http://127.0.0.1:8000/api/agent/status)
- **Interactive OpenAPI docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 2. Frontend Setup

Open a second Command Prompt or PowerShell terminal in the project root:

```cmd
cd frontend
npm.cmd install
copy .env.example .env
npm.cmd run dev
```

Open your browser to:
- **Frontend Dashboard**: [http://127.0.0.1:5173/](http://127.0.0.1:5173/)

---

## API Endpoints

### `GET /health`
Verifies backend process operational readiness.
- **Status Code**: `200 OK`
- **Response**:
```json
{
  "status": "healthy",
  "service": "safeloop-backend",
  "version": "0.1.0"
}
```

### `GET /api/agent/status`
Returns AI provider integration status without exposing credentials.
- **Status Code**: `200 OK`
- **Response** (Phase 1 default without Gemini key):
```json
{
  "provider": "google-gemini",
  "configured": false,
  "model": "gemini-1.5-flash",
  "status_message": "Gemini integration has not yet been activated (Phase 2)."
}
```

---

## Environment Configuration

### Backend (`backend/.env`)
| Variable | Default | Description |
| :--- | :--- | :--- |
| `APP_NAME` | `SafeLoop AI` | Name of the backend application |
| `APP_VERSION` | `0.1.0` | Semantic version |
| `ENVIRONMENT` | `development` | Deployment environment |
| `DEBUG` | `true` | Enable debug logs |
| `HOST` | `127.0.0.1` | Local bind host |
| `PORT` | `8000` | Local bind port |
| `ALLOWED_ORIGINS` | `["http://localhost:5173", ...]` | CORS allowed origins |
| `GEMINI_API_KEY` | `""` | Optional in Phase 1 (never required to start) |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Configured model identifier |

### Frontend (`frontend/.env`)
| Variable | Default | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | URL of the backend API gateway |

---

## Running Automated Tests

### Backend Tests (Pytest)
```cmd
cd backend
.venv\Scripts\python -m pytest -v
```

Tests verify:
1. `GET /health` returns HTTP 200 and matches the expected schema.
2. `GET /api/agent/status` returns HTTP 200 with provider readiness.
3. No secret API keys are ever leaked in response payloads or headers.
4. App starts and runs cleanly even if Gemini key is omitted.
5. Settings parsing handles irregular origins without crashing.

### Frontend Typecheck & Build
```cmd
cd frontend
npm.cmd run typecheck
npm.cmd run build
```

---

## Phase 1 Limitations & Boundaries

1. **No Real Gemini Calls**: Real LLM generation is reserved for **Phase 2**.
2. **Disabled Send Button**: The Playground Send button is disabled with an explanatory banner so users are never misled by fake AI completions.
3. **Empty Metric States**: Tasks, Feedback, and Benchmark metrics display `—` to reflect the honest state of the system.
4. **Local Execution**: No external cloud services or databases are provisioned in Phase 1.

---

## Future Phase Roadmap

For comprehensive details on Phases 2 through 10, see [docs/phase-roadmap.md](docs/phase-roadmap.md) and [docs/architecture.md](docs/architecture.md).
