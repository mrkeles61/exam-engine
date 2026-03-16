# Exam Evaluation Engine

An LLM-based exam evaluation system for universities. Upload scanned exam PDFs, run an OCR → layout detection → automated grading pipeline, and explore per-student results with statistics and CSV export.

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) 24+
- [Docker Compose](https://docs.docker.com/compose/) v2 (ships with Docker Desktop)

---

## Quick Start

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec api python -m app.seed
```

Open **http://localhost** in your browser.

| | |
|---|---|
| Email | `admin@university.edu` |
| Password | `admin123` |

Or use the helper script: `bash scripts/start.sh`

---

## Services

| Service | Description | Exposed |
|---|---|---|
| `frontend` | React SPA + nginx (serves static files + proxies /api) | `80` → host |
| `api` | FastAPI backend | internal |
| `postgres` | PostgreSQL 16 | internal |
| `redis` | Redis 7 (reserved for future worker) | internal |

---

## Architecture

```
Browser
  └── http://localhost  (nginx inside frontend container)
        ├── /        → React SPA (static files from dist/)
        └── /api/*   → proxied to api:8000

Evaluation pipeline  (asyncio BackgroundTasks, no Celery):
  POST /api/evaluate
    └── EvaluationJob  status=pending
          └── BackgroundTask
                ├── OCR stage         mock: ocr_service.py
                ├── Layout detection  mock: layout_service.py
                ├── LLM grading       mock: eval_service.py
                └── StudentResult rows persisted → status=complete
```

Each mock service exposes a single function. Swap it with the real OCR/LLM implementation without touching the pipeline.

---

## API Reference

Interactive docs available at **http://localhost/docs**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/register` | Register user |
| GET | `/api/auth/me` | Current user |
| POST | `/api/upload` | Upload exam PDF |
| GET/DELETE | `/api/upload/{id}` | Get or delete exam |
| POST | `/api/answer-keys` | Create answer key |
| GET/PUT/DELETE | `/api/answer-keys/{id}` | Manage answer key |
| POST | `/api/evaluate` | Start evaluation job |
| GET | `/api/jobs` | List jobs |
| GET | `/api/jobs/{id}` | Job status + progress |
| POST | `/api/jobs/{id}/cancel` | Cancel job |
| GET | `/api/results/{job_id}` | All student results |
| GET | `/api/results/{job_id}/student/{sid}` | Single student |
| GET | `/api/results/{job_id}/export` | CSV download |
| GET | `/api/results/{job_id}/stats` | Statistics |

---

## Local Development (without Docker)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Update DATABASE_URL in .env to point at a local Postgres
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev    # http://localhost:3000, /api proxied to :8000
```

---

## Tech Stack

**Backend:** FastAPI 0.115, Python 3.11, SQLAlchemy 2.0 async, PostgreSQL 16, Alembic, python-jose, passlib/bcrypt

**Frontend:** React 18, TypeScript, Vite 6, Tailwind CSS, React Router v6, Axios

**Infrastructure:** Docker Compose, nginx
