"""Health, exams list, exam history, and dashboard summary endpoints."""
import time
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

import redis.asyncio as aioredis

from app.core.config import settings
from app.core.database import engine
from app.dependencies import get_db, require_professor_or_admin
from app.models.models import Exam, EvaluationJob, JobStatus, StudentResult, User
from app.schemas.schemas import DashboardOut, ExamHistoryItem, ExamListItem, HealthOut

router = APIRouter(tags=["health"])

_START_TIME = time.time()


@router.get("/health", response_model=HealthOut)
async def health_check():
    # DB check
    db_status = "connected"
    try:
        async with engine.connect() as conn:
            await conn.execute(select(1))  # type: ignore[arg-type]
    except Exception:
        db_status = "error"

    # Redis check
    redis_status = "connected"
    try:
        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=1)
        await r.ping()
        await r.aclose()
    except Exception:
        redis_status = "error"

    return HealthOut(
        status="ok",
        database=db_status,
        redis=redis_status,
        uptime_seconds=round(time.time() - _START_TIME, 1),
        version="1.0.0",
    )


@router.get("/exams", response_model=List[ExamListItem])
async def list_exams_with_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    exams_res = await db.execute(select(Exam).order_by(Exam.created_at.desc()))
    exams = exams_res.scalars().all()

    items = []
    for exam in exams:
        # Latest job for this exam
        job_res = await db.execute(
            select(EvaluationJob)
            .where(EvaluationJob.exam_id == exam.id)
            .order_by(EvaluationJob.created_at.desc())
            .limit(1)
        )
        latest_job = job_res.scalar_one_or_none()

        # Student count from latest completed job
        student_count = 0
        if latest_job and latest_job.status == JobStatus.complete:
            student_count = latest_job.total_students

        items.append(ExamListItem(
            id=exam.id,
            title=exam.title,
            course_name=exam.course_name,
            exam_type=exam.exam_type,
            latest_job_status=latest_job.status.value if latest_job else None,
            student_count=student_count,
            created_at=exam.created_at,
        ))
    return items


@router.get("/exams/{exam_id}/history", response_model=List[ExamHistoryItem])
async def get_exam_history(
    exam_id,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    exam_res = await db.execute(select(Exam).where(Exam.id == exam_id))
    if not exam_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Exam not found")

    jobs_res = await db.execute(
        select(EvaluationJob)
        .where(EvaluationJob.exam_id == exam_id)
        .order_by(EvaluationJob.created_at.desc())
    )
    jobs = jobs_res.scalars().all()

    history = []
    for job in jobs:
        avg = None
        if job.status == JobStatus.complete:
            sr_res = await db.execute(
                select(StudentResult).where(StudentResult.job_id == job.id)
            )
            results = sr_res.scalars().all()
            if results:
                avg = round(sum(r.total_pct for r in results) / len(results), 2)

        history.append(ExamHistoryItem(
            job_id=job.id,
            status=job.status,
            started_at=job.started_at,
            completed_at=job.completed_at,
            student_count=job.total_students,
            average=avg,
        ))
    return history


@router.get("/dashboard/summary", response_model=DashboardOut)
async def dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    # Total exams
    exams_count = (await db.execute(select(func.count(Exam.id)))).scalar_one()

    # Total students (sum across all complete jobs)
    total_students_res = await db.execute(
        select(func.sum(EvaluationJob.total_students))
        .where(EvaluationJob.status == JobStatus.complete)
    )
    total_students = total_students_res.scalar_one() or 0

    # Average score across all student results
    avg_res = await db.execute(select(func.avg(StudentResult.total_pct)))
    avg_score = avg_res.scalar_one()
    if avg_score is not None:
        avg_score = round(float(avg_score), 2)

    # Active jobs
    active_statuses = [
        JobStatus.pending, JobStatus.ocr_running, JobStatus.layout_running, JobStatus.eval_running,
    ]
    active_count = (
        await db.execute(
            select(func.count(EvaluationJob.id))
            .where(EvaluationJob.status.in_(active_statuses))
        )
    ).scalar_one()

    # Recent 5 jobs
    recent_res = await db.execute(
        select(EvaluationJob).order_by(EvaluationJob.created_at.desc()).limit(5)
    )
    recent = recent_res.scalars().all()
    recent_jobs = [
        {
            "id": str(j.id),
            "status": j.status.value,
            "total_students": j.total_students,
            "created_at": j.created_at.isoformat(),
        }
        for j in recent
    ]

    return DashboardOut(
        total_exams=exams_count,
        total_students=total_students,
        avg_score=avg_score,
        active_jobs=active_count,
        recent_jobs=recent_jobs,
        health="ok",
    )
