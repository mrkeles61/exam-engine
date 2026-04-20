from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from .config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Idempotent dev migrations
#
# SQLAlchemy's create_all() creates *new* tables but will never alter an
# existing one. Until we adopt Alembic fully, we run a small list of
# IF NOT EXISTS statements on startup so fresh columns show up without a
# manual volume wipe.
#
# Rules:
#   - Every statement here MUST be idempotent (IF NOT EXISTS / IF EXISTS).
#   - Additive only. No data-destructive changes.
#   - When we move to Alembic, copy these into a baseline migration and
#     delete the function call from main.py.
# ---------------------------------------------------------------------------

_DEV_MIGRATIONS: list[str] = [
    # student_results: teacher approval workflow
    "ALTER TABLE student_results ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ",
    "ALTER TABLE student_results ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL",
    "ALTER TABLE student_results ADD COLUMN IF NOT EXISTS approved_by_email VARCHAR(255)",
]


async def create_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def run_dev_migrations() -> None:
    """Run idempotent ALTER TABLE statements. Safe to call every startup."""
    async with engine.begin() as conn:
        for stmt in _DEV_MIGRATIONS:
            await conn.execute(text(stmt))
