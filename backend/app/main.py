import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import create_tables
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
    logger.info("Database ready.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
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
