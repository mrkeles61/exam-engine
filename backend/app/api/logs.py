"""GET /jobs/{job_id}/logs — pipeline log streaming endpoint."""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_db, get_current_user
from app.models.models import EvaluationJob, PipelineLog, User
from app.schemas.schemas import PipelineLogOut

router = APIRouter(tags=["Pipeline"])


@router.get(
    "/jobs/{job_id}/logs",
    response_model=List[PipelineLogOut],
    summary="Get Pipeline Logs",
    description="Returns all log entries produced during pipeline execution. Supports incremental polling via the 'after' query parameter (ISO timestamp) to fetch only new entries since the last poll.",
)
async def get_job_logs(
    job_id: uuid.UUID,
    after: Optional[datetime] = Query(None, description="Only return logs after this timestamp"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Job not found")

    query = select(PipelineLog).where(PipelineLog.job_id == job_id)
    if after:
        query = query.where(PipelineLog.timestamp > after)
    query = query.order_by(PipelineLog.timestamp)

    result = await db.execute(query)
    return result.scalars().all()
