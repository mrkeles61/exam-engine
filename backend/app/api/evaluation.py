import uuid
from datetime import datetime, timezone
from statistics import mean
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.dependencies import get_db, require_professor_or_admin
from app.models.models import (
    Exam, EvaluationJob, JobStatus, PipelineLog, StudentResult, User,
)
from app.schemas.schemas import (
    EvaluateRequest, JobOut, OcrStageOut, LayoutStageOut, EvalStageOut,
    StageResultsOut, RetryOut, TimelineOut, TimelineStage,
)
from app.services.pipeline import run_pipeline, run_ocr, run_layout, run_evaluation

router = APIRouter(tags=["Pipeline"])

_OCR_ALLOWED = {JobStatus.pending, JobStatus.ocr_failed}
_LAYOUT_ALLOWED = {JobStatus.ocr_complete, JobStatus.layout_failed}
_EVAL_ALLOWED = {JobStatus.layout_complete, JobStatus.eval_failed}

_FAILED_STATUSES = {
    JobStatus.failed,
    JobStatus.ocr_failed,
    JobStatus.layout_failed,
    JobStatus.eval_failed,
}


@router.post(
    "/evaluate",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start Automatic Evaluation",
    description="Runs all pipeline stages sequentially in the background: OCR → Layout Analysis → Evaluation. Job status can be tracked via the /jobs endpoint.",
)
async def start_evaluation(
    body: EvaluateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    result = await db.execute(select(Exam).where(Exam.id == body.exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    resolved_key_id = body.answer_key_id or exam.answer_key_id

    job = EvaluationJob(
        exam_id=body.exam_id,
        answer_key_id=resolved_key_id,
        status=JobStatus.pending,
        progress_pct=0,
        progress_detail="Job queued, waiting to start...",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(run_pipeline, str(job.id), str(body.exam_id), resolved_key_id)
    return job


@router.post(
    "/jobs/{job_id}/stage/ocr",
    response_model=OcrStageOut,
    summary="Run OCR Stage",
    description="Runs only the OCR stage. Extracts text from the PDF using Tesseract/PaddleOCR. Calculates a confidence score per page. Job must be in 'pending' or 'ocr_failed' status.",
)
async def stage_ocr(
    job_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in _OCR_ALLOWED:
        raise HTTPException(
            status_code=400,
            detail=f"OCR yalnızca '{'/'.join(s.value for s in _OCR_ALLOWED)}' durumundaki işler için çalıştırılabilir",
        )
    background_tasks.add_task(run_ocr, str(job_id))
    return OcrStageOut(
        status="ocr_running",
        pages_processed=0,
        avg_confidence=0.0,
    )


@router.post(
    "/jobs/{job_id}/stage/layout",
    response_model=LayoutStageOut,
    summary="Run Layout Analysis Stage",
    description="Analyzes OCR output to detect individual student answer sheets. Extracts MC and open-ended answers per student. Job must be in 'ocr_complete' or 'layout_failed' status.",
)
async def stage_layout(
    job_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in _LAYOUT_ALLOWED:
        raise HTTPException(
            status_code=400,
            detail=f"Düzen analizi yalnızca '{'/'.join(s.value for s in _LAYOUT_ALLOWED)}' durumundaki işler için çalıştırılabilir",
        )
    background_tasks.add_task(run_layout, str(job_id))
    return LayoutStageOut(
        status="layout_running",
        students_detected=0,
        students=[],
    )


@router.post(
    "/jobs/{job_id}/stage/evaluate",
    response_model=EvalStageOut,
    summary="Run Evaluation Stage",
    description="Scores MC answers with rule-based matching and open-ended answers with LLM. Produces per-student results. Job must be in 'layout_complete' or 'eval_failed' status.",
)
async def stage_evaluate(
    job_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in _EVAL_ALLOWED:
        raise HTTPException(
            status_code=400,
            detail=f"Değerlendirme yalnızca '{'/'.join(s.value for s in _EVAL_ALLOWED)}' durumundaki işler için çalıştırılabilir",
        )
    background_tasks.add_task(run_evaluation, str(job_id))
    return EvalStageOut(status="eval_running", students_scored=0, average=0.0)


@router.get(
    "/jobs/{job_id}/stage-results",
    response_model=StageResultsOut,
    summary="Get Stage Intermediate Outputs",
    description="Returns the intermediate output of each completed stage: OCR page count and confidence, detected student count from layout, and scoring summary from evaluation.",
)
async def get_stage_results(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    ocr_info = None
    if job.ocr_output:
        out = job.ocr_output
        preview_pages = out.get("pages", [])
        preview = preview_pages[0]["raw_text"][:120] + "..." if preview_pages else ""
        ocr_info = {
            "completed": True,
            "pages": out.get("pages_processed", 0),
            "confidence": out.get("avg_confidence", 0.0),
            "output_preview": preview,
        }

    layout_info = None
    if job.layout_output:
        out = job.layout_output
        layout_info = {
            "completed": True,
            "students_found": out.get("students_detected", 0),
            "student_list": out.get("student_list", []),
        }

    eval_info = None
    if job.status == JobStatus.complete:
        sr_res = await db.execute(
            select(StudentResult).where(StudentResult.job_id == job_id)
        )
        results = sr_res.scalars().all()
        avg = mean(r.total_pct for r in results) if results else 0.0
        eval_info = {
            "completed": True,
            "students_scored": len(results),
            "average": round(avg, 2),
        }

    return StageResultsOut(ocr=ocr_info, layout=layout_info, evaluation=eval_info)


@router.post(
    "/jobs/{job_id}/retry",
    response_model=RetryOut,
    summary="Retry Failed Job",
    description="Restarts the pipeline from the failed stage. Does not re-run prior successful stages. Only works on jobs with a failure status (ocr_failed, layout_failed, eval_failed, failed).",
)
async def retry_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in _FAILED_STATUSES:
        raise HTTPException(
            status_code=400, detail="Yalnızca başarısız işler yeniden denenebilir",
        )

    if job.status in (JobStatus.eval_failed,):
        await db.execute(
            delete(StudentResult).where(StudentResult.job_id == job_id)
        )
        job.status = JobStatus.layout_complete
        retrying_from = "evaluation"
    elif job.status == JobStatus.layout_failed:
        job.status = JobStatus.ocr_complete
        retrying_from = "layout"
    else:
        job.status = JobStatus.pending
        retrying_from = "ocr"

    job.error_message = None
    job.current_stage = None
    await db.commit()

    from fastapi import BackgroundTasks
    from app.services.pipeline import run_ocr, run_layout, run_evaluation
    import asyncio

    if retrying_from == "ocr":
        asyncio.ensure_future(run_ocr(str(job_id)))
    elif retrying_from == "layout":
        asyncio.ensure_future(run_layout(str(job_id)))
    else:
        asyncio.ensure_future(run_evaluation(str(job_id)))

    return RetryOut(
        job_id=job_id,
        retrying_from=retrying_from,
        new_status=job.status.value,
    )


@router.get(
    "/jobs",
    response_model=List[JobOut],
    summary="List All Jobs",
    description="Returns all evaluation jobs sorted newest first. Each item includes status, progress percentage, and student count.",
)
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    result = await db.execute(
        select(EvaluationJob).order_by(EvaluationJob.created_at.desc())
    )
    return result.scalars().all()


@router.get(
    "/jobs/{job_id}",
    response_model=JobOut,
    summary="Get Job Detail",
    description="Returns the current status, progress percentage, total/processed student count, and error message for a specific job.",
)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    result = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post(
    "/jobs/{job_id}/cancel",
    response_model=JobOut,
    summary="Cancel Job",
    description="Cancels a running job by setting its status to 'failed'. Cannot cancel already-completed or already-failed jobs.",
)
async def cancel_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    result = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in (JobStatus.complete, JobStatus.failed):
        raise HTTPException(status_code=400, detail=f"Cannot cancel job in '{job.status}' state")

    job.status = JobStatus.failed
    job.error_message = "Cancelled by user"
    job.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(job)
    return job


@router.get(
    "/jobs/{job_id}/timeline",
    response_model=TimelineOut,
    summary="Get Stage Timings",
    description="Returns the start time, end time, and total duration in seconds for each pipeline stage (OCR, layout, evaluation), derived from pipeline log timestamps.",
)
async def get_job_timeline(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    logs_res = await db.execute(
        select(PipelineLog)
        .where(PipelineLog.job_id == job_id)
        .order_by(PipelineLog.timestamp)
    )
    logs = logs_res.scalars().all()

    stage_times: dict = {}
    for log in logs:
        s = log.stage
        if s not in stage_times:
            stage_times[s] = {"first": log.timestamp, "last": log.timestamp}
        else:
            stage_times[s]["last"] = log.timestamp

    stage_names = ["ocr", "layout", "evaluation"]
    stage_status_map = {
        "ocr": job.ocr_output and "complete" or (
            "failed" if job.status == JobStatus.ocr_failed else
            "running" if job.status == JobStatus.ocr_running else
            "pending"
        ),
        "layout": job.layout_output and "complete" or (
            "failed" if job.status == JobStatus.layout_failed else
            "running" if job.status == JobStatus.layout_running else
            "pending"
        ),
        "evaluation": (
            "complete" if job.status == JobStatus.complete else
            "failed" if job.status == JobStatus.eval_failed else
            "running" if job.status == JobStatus.eval_running else
            "pending"
        ),
    }

    stages = []
    for name in stage_names:
        times = stage_times.get(name, {})
        started = times.get("first")
        ended = times.get("last")
        duration = None
        if started and ended and started != ended:
            duration = (ended - started).total_seconds()
        stages.append(TimelineStage(
            name=name,
            status=stage_status_map.get(name, "pending"),
            started_at=started,
            completed_at=ended if stage_status_map.get(name) in ("complete", "failed") else None,
            duration_seconds=duration,
        ))

    return TimelineOut(job_id=job_id, stages=stages)
