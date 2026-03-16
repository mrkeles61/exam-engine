"""
Log service — writes PipelineLog records to the database.
Each call opens its own session so it can be called anywhere.
"""
from datetime import datetime, timezone
from typing import Optional

from app.core.database import AsyncSessionLocal
from app.models.models import PipelineLog


async def write_log(
    job_id: str,
    stage: str,
    level: str,
    message: str,
    *,
    student_id: Optional[str] = None,
    student_name: Optional[str] = None,
    score: Optional[float] = None,
) -> None:
    async with AsyncSessionLocal() as db:
        log = PipelineLog(
            job_id=str(job_id),
            stage=stage,
            level=level,
            message=message,
            student_id=student_id,
            student_name=student_name,
            score=score,
            timestamp=datetime.now(timezone.utc),
        )
        db.add(log)
        await db.commit()
