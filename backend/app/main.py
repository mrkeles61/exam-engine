import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import create_tables, run_dev_migrations
from app.api import auth, upload, answer_keys, evaluation, results, logs, health

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up — creating tables if not exist...")
    await create_tables()
    logger.info("Running dev migrations (idempotent ALTER TABLE)...")
    await run_dev_migrations()
    logger.info("Database ready.")
    yield
    logger.info("Shutting down.")


_TAGS_METADATA = [
    {"name": "Authentication", "description": "Register, login, and retrieve the current user profile."},
    {"name": "Exam Management", "description": "Upload exam PDFs and manage exam records."},
    {"name": "Pipeline", "description": "Run the OCR → Layout → Evaluation pipeline. Supports full auto-mode and per-stage manual control."},
    {"name": "Answer Keys", "description": "Create, update, validate, and delete answer keys used for grading."},
    {"name": "Results & Analytics", "description": "Retrieve student results, statistics, per-question analytics, and export to CSV."},
    {"name": "System", "description": "Health check, exam list with status, and dashboard summary metrics."},
]

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    openapi_tags=_TAGS_METADATA,
)

# ---------------------------------------------------------------------------
# CORS — React dev server on different port
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
PREFIX = settings.API_PREFIX

app.include_router(auth.router, prefix=PREFIX)
app.include_router(upload.router, prefix=PREFIX)
app.include_router(answer_keys.router, prefix=PREFIX)
app.include_router(evaluation.router, prefix=PREFIX)
app.include_router(results.router, prefix=PREFIX)
app.include_router(logs.router, prefix=PREFIX)
app.include_router(health.router, prefix=PREFIX)
