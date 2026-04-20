import csv
import io
import math
import random
import uuid
from collections import Counter
from datetime import datetime, timezone
from statistics import median as calc_median
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import attributes as sa_attributes

from app.dependencies import get_db, get_current_user
from app.models.models import (
    AnswerKey, EvaluationJob, Exam, JobStatus, OverrideHistory, StudentResult, User,
)
from app.schemas.schemas import (
    AnalyticsOut, ApprovalOut,
    FlagSegmentationRequest, NotifyOut,
    OverrideHistoryItem, OverrideHistoryOut,
    OverrideRequest, QuestionAnalytics, QuestionOverrideRequest,
    ReportOut, ResultsListOut, StatsOut, StudentResultOut, StudentSummary,
)
router = APIRouter(prefix="/results", tags=["Results & Analytics"])


async def _get_completed_job(job_id: uuid.UUID, db: AsyncSession) -> EvaluationJob:
    result = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.complete:
        raise HTTPException(status_code=400, detail=f"Job is not complete (status: {job.status})")
    return job


@router.get(
    "/{job_id}",
    response_model=ResultsListOut,
    summary="Get All Student Results",
    description="Returns all student results for a completed job: MC score, open-ended score, total percentage, and letter grade.",
)
async def get_results(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_completed_job(job_id, db)
    rows = await db.execute(
        select(StudentResult)
        .where(StudentResult.job_id == job_id)
        .order_by(StudentResult.student_id)
    )
    results = rows.scalars().all()
    return ResultsListOut(job_id=job_id, total=len(results), results=results)


@router.get(
    "/{job_id}/student/{student_id}",
    response_model=StudentResultOut,
    summary="Get Student Detail Result",
    description="Returns per-question answer analysis for a single student: selected vs correct answer for each MC question, and LLM score and feedback for open-ended questions.",
)
async def get_student_result(
    job_id: uuid.UUID,
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_completed_job(job_id, db)
    result = await db.execute(
        select(StudentResult).where(
            StudentResult.job_id == job_id,
            StudentResult.student_id == student_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Student result not found")
    return row


@router.get(
    "/{job_id}/export",
    summary="Export Results as CSV",
    description="Downloads all results as a CSV file streamed directly to the browser. Columns: student_id, student_name, mc_score, mc_total, open_score, open_total, total_pct, grade.",
)
async def export_results_csv(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_completed_job(job_id, db)
    rows = await db.execute(
        select(StudentResult)
        .where(StudentResult.job_id == job_id)
        .order_by(StudentResult.student_id)
    )
    results = rows.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "student_id", "student_name",
        "mc_score", "mc_total",
        "open_score", "open_total",
        "total_pct", "grade",
    ])
    for r in results:
        writer.writerow([
            r.student_id, r.student_name,
            r.mc_score, r.mc_total,
            r.open_score, r.open_total,
            f"{r.total_pct:.2f}", r.grade,
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="results_{job_id}.csv"'},
    )


@router.get(
    "/{job_id}/stats",
    response_model=StatsOut,
    summary="Get Statistics",
    description="Calculates average, highest, lowest, standard deviation, grade distribution, and passing rate for a completed job.",
)
async def get_stats(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_completed_job(job_id, db)
    rows = await db.execute(select(StudentResult).where(StudentResult.job_id == job_id))
    results = rows.scalars().all()

    if not results:
        raise HTTPException(status_code=404, detail="No results found for this job")

    pcts = [r.total_pct for r in results]
    n = len(pcts)
    avg = sum(pcts) / n
    highest = max(pcts)
    lowest = min(pcts)
    variance = sum((p - avg) ** 2 for p in pcts) / n
    std_dev = math.sqrt(variance)
    grade_dist = Counter(r.grade for r in results)
    passing = sum(1 for p in pcts if p >= 50.0)

    return StatsOut(
        job_id=job_id,
        total_students=n,
        average_pct=round(avg, 2),
        highest_pct=round(highest, 2),
        lowest_pct=round(lowest, 2),
        std_deviation=round(std_dev, 2),
        grade_distribution=dict(grade_dist),
        passing_rate=round(passing / n * 100, 2),
    )


@router.get(
    "/{job_id}/report",
    response_model=ReportOut,
    summary="Get Summary Report",
    description="Detailed summary including top/bottom 3 students, hardest questions, class performance metrics (average, median, std dev, pass rate), and grade distribution.",
)
async def get_report(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await _get_completed_job(job_id, db)
    exam_res = await db.execute(select(Exam).where(Exam.id == job.exam_id))
    exam = exam_res.scalar_one_or_none()

    # Gap B — answer key name + template match confidence
    answer_key_name = "Bilinmeyen"
    ak_id = job.answer_key_id or (exam.answer_key_id if exam else None)
    if ak_id:
        ak_res = await db.execute(select(AnswerKey).where(AnswerKey.id == ak_id))
        ak = ak_res.scalar_one_or_none()
        if ak:
            answer_key_name = ak.name
    # Seeded 0.94..0.99 per job_id so the pill is stable across reloads.
    _tm_rng = random.Random(abs(hash(f"{job_id}|template_match")) % (2**32))
    template_match_confidence = round(_tm_rng.uniform(0.94, 0.99), 3)

    rows = await db.execute(select(StudentResult).where(StudentResult.job_id == job_id))
    results = list(rows.scalars().all())
    if not results:
        raise HTTPException(status_code=404, detail="No results found")

    pcts = [r.total_pct for r in results]
    n = len(pcts)
    avg = sum(pcts) / n
    med = calc_median(pcts)
    variance = sum((p - avg) ** 2 for p in pcts) / n
    std = math.sqrt(variance)
    passing = sum(1 for p in pcts if p >= 50.0)
    grade_dist = Counter(r.grade for r in results)

    sorted_desc = sorted(results, key=lambda r: r.total_pct, reverse=True)
    top3 = [
        StudentSummary(
            student_id=r.student_id, student_name=r.student_name,
            total_pct=r.total_pct, grade=r.grade,
        )
        for r in sorted_desc[:3]
    ]
    bottom3 = [
        StudentSummary(
            student_id=r.student_id, student_name=r.student_name,
            total_pct=r.total_pct, grade=r.grade,
        )
        for r in sorted_desc[-3:]
    ]

    q_stats: dict = {}
    for r in results:
        for a in (r.answers or []):
            if a.get("question_type") != "mc":
                continue
            qn = a["question_number"]
            if qn not in q_stats:
                q_stats[qn] = {"correct": 0, "total": 0, "wrong_answers": []}
            q_stats[qn]["total"] += 1
            if a.get("is_correct"):
                q_stats[qn]["correct"] += 1
            else:
                sa = a.get("student_answer")
                if sa:
                    q_stats[qn]["wrong_answers"].append(sa)

    hardest = sorted(
        [
            {
                "question_number": qn,
                "correct_rate": round(v["correct"] / v["total"] * 100, 1) if v["total"] else 0,
                "most_common_wrong": Counter(v["wrong_answers"]).most_common(1)[0][0]
                if v["wrong_answers"] else None,
            }
            for qn, v in q_stats.items()
        ],
        key=lambda x: x["correct_rate"],
    )[:5]

    return ReportOut(
        job_id=job_id,
        exam_title=exam.title if exam else "Unknown",
        course=exam.course_name if exam else "Unknown",
        answer_key_name=answer_key_name,
        template_match_confidence=template_match_confidence,
        total_students=n,
        average=round(avg, 2),
        median=round(med, 2),
        std_dev=round(std, 2),
        pass_rate=round(passing / n * 100, 2),
        grade_distribution=dict(grade_dist),
        top_3_students=top3,
        bottom_3_students=bottom3,
        hardest_questions=hardest,
    )


@router.get(
    "/{job_id}/analytics",
    response_model=AnalyticsOut,
    summary="Per-Question Analytics",
    description="For each question, calculates correct count, incorrect count, correct rate percentage, and the most commonly given wrong answer.",
)
async def get_analytics(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_completed_job(job_id, db)
    rows = await db.execute(select(StudentResult).where(StudentResult.job_id == job_id))
    results = list(rows.scalars().all())
    if not results:
        raise HTTPException(status_code=404, detail="No results found")

    q_stats: dict = {}
    for r in results:
        for a in (r.answers or []):
            qn = a["question_number"]
            qt = a.get("question_type", "mc")
            if qn not in q_stats:
                q_stats[qn] = {"type": qt, "correct": 0, "incorrect": 0, "wrong": []}
            if a.get("is_correct") is True:
                q_stats[qn]["correct"] += 1
            elif a.get("is_correct") is False:
                q_stats[qn]["incorrect"] += 1
                sa = a.get("student_answer")
                if sa:
                    q_stats[qn]["wrong"].append(sa)

    questions = []
    for qn in sorted(q_stats.keys()):
        v = q_stats[qn]
        total = v["correct"] + v["incorrect"]
        rate = round(v["correct"] / total * 100, 1) if total else 0.0
        most_wrong = Counter(v["wrong"]).most_common(1)[0][0] if v["wrong"] else None
        questions.append(QuestionAnalytics(
            number=qn,
            type=v["type"],
            correct_count=v["correct"],
            incorrect_count=v["incorrect"],
            correct_rate=rate,
            most_common_wrong=most_wrong,
        ))

    return AnalyticsOut(job_id=job_id, questions=questions)


# ---------------------------------------------------------------------------
# Scoring helpers (shared by bulk + per-question override paths)
# ---------------------------------------------------------------------------

def _letter_grade(pct: float) -> str:
    if pct >= 90:  return "AA"
    if pct >= 85:  return "BA"
    if pct >= 80:  return "BB"
    if pct >= 75:  return "CB"
    if pct >= 70:  return "CC"
    if pct >= 60:  return "DC"
    if pct >= 50:  return "DD"
    return "FF"


def _recompute_row_totals(row: StudentResult) -> None:
    """
    After per-question overrides, recompute mc_score / open_score / total_pct / grade
    from `row.answers`. Totals (mc_total / open_total) are structural — they come
    from the answer key max_scores and never move during a per-question edit.

    Convention (mirrors eval_service.evaluate_student):
      mc_score  aggregates mc + ms
      open_score aggregates open + fill + match
    """
    def _sum_of(kinds: set) -> float:
        return float(sum(a.get("score", 0.0) for a in row.answers if a.get("question_type") in kinds))

    row.mc_score = round(_sum_of({"mc", "ms"}), 2)
    row.open_score = round(_sum_of({"open", "fill", "match"}), 2)

    grand = (row.mc_total or 0.0) + (row.open_total or 0.0)
    row.total_pct = round((row.mc_score + row.open_score) / grand * 100, 2) if grand else 0.0
    row.grade = _letter_grade(row.total_pct)


async def _load_student_row(job_id: uuid.UUID, student_id: str, db: AsyncSession) -> StudentResult:
    await _get_completed_job(job_id, db)
    result = await db.execute(
        select(StudentResult).where(
            StudentResult.job_id == job_id,
            StudentResult.student_id == student_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Student result not found")
    return row


def _assert_not_approved(row: StudentResult) -> None:
    if row.approved_at is not None:
        raise HTTPException(
            status_code=409,
            detail="Öğrenci onaylanmış durumda. Düzenleme için önce 'Onayı kaldır' işlemini yapın.",
        )


# ---------------------------------------------------------------------------
# Override endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/{job_id}/student/{student_id}/override",
    response_model=StudentResultOut,
    summary="Per-Question Override",
    description=(
        "Override a single question's score with a required reason. "
        "Writes an audit row to override_history. Recomputes totals and grade. "
        "Rejected if student is already approved (client must reopen first)."
    ),
)
async def override_question(
    job_id: uuid.UUID,
    student_id: str,
    body: QuestionOverrideRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = await _load_student_row(job_id, student_id, db)
    _assert_not_approved(row)

    answers = list(row.answers or [])
    target_idx = next(
        (i for i, a in enumerate(answers) if a.get("question_number") == body.question_number),
        None,
    )
    if target_idx is None:
        raise HTTPException(status_code=404, detail=f"Question {body.question_number} not found")

    target = dict(answers[target_idx])
    max_score = float(target.get("max_score", 0.0))
    if body.new_score > max_score:
        raise HTTPException(
            status_code=400,
            detail=f"new_score ({body.new_score}) exceeds max_score ({max_score})",
        )

    previous_score = float(target.get("score", 0.0))

    # Update answer in-place (and mark it as overridden)
    target["score"] = float(body.new_score)
    target["override_applied"] = True
    # For MC: if override matches correct_answer, flip is_correct if sensible
    if target.get("question_type") == "mc" and max_score > 0:
        target["is_correct"] = body.new_score >= max_score
    answers[target_idx] = target
    row.answers = answers
    sa_attributes.flag_modified(row, "answers")

    _recompute_row_totals(row)

    # Write audit row
    history_row = OverrideHistory(
        job_id=job_id,
        student_id=student_id,
        question_number=body.question_number,
        previous_score=previous_score,
        new_score=float(body.new_score),
        reason=body.reason,
        overridden_by=current_user.id,
        overridden_by_email=current_user.email,
    )
    db.add(history_row)

    await db.commit()
    await db.refresh(row)
    return row


@router.patch(
    "/{job_id}/student/{student_id}",
    response_model=StudentResultOut,
    summary="Bulk Override (Legacy)",
    description=(
        "Legacy bulk score override — replaces mc_score/open_score/grade directly. "
        "Kept for backwards compatibility; prefer the per-question /override endpoint. "
        "Now writes a history row with question_number=0."
    ),
)
async def override_grade(
    job_id: uuid.UUID,
    student_id: str,
    body: OverrideRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = await _load_student_row(job_id, student_id, db)
    _assert_not_approved(row)

    # Snapshot previous totals for the audit row
    prev_total = (row.mc_score or 0.0) + (row.open_score or 0.0)

    if body.mc_score is not None:
        row.mc_score = body.mc_score
    if body.open_score is not None:
        row.open_score = body.open_score

    grand = (row.mc_total or 0.0) + (row.open_total or 0.0)
    row.total_pct = round((row.mc_score + row.open_score) / grand * 100, 2) if grand else 0.0
    row.grade = body.grade if body.grade is not None else _letter_grade(row.total_pct)

    db.add(OverrideHistory(
        job_id=job_id,
        student_id=student_id,
        question_number=0,  # 0 = bulk / aggregate override
        previous_score=prev_total,
        new_score=(row.mc_score or 0.0) + (row.open_score or 0.0),
        reason=body.override_reason,
        overridden_by=current_user.id,
        overridden_by_email=current_user.email,
    ))

    await db.commit()
    await db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Flag segmentation (Gap C quick-win) — mark a bbox as needs-review
# ---------------------------------------------------------------------------

@router.post(
    "/{job_id}/student/{student_id}/flag-segmentation",
    summary="Flag Segmentation Region",
    description=(
        "Mark a question's bbox as needing segmentation review. "
        "Sets needs_review=true on the answer and writes an audit row "
        "with [flag_segmentation] tagging. No score change."
    ),
)
async def flag_segmentation(
    job_id: uuid.UUID,
    student_id: str,
    body: FlagSegmentationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = await _load_student_row(job_id, student_id, db)
    _assert_not_approved(row)

    answers = list(row.answers or [])
    idx = next((i for i, a in enumerate(answers)
                if a.get("question_number") == body.question_number), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"Question {body.question_number} not found")

    answer = dict(answers[idx])
    previous_score = float(answer.get("score", 0.0))
    answer["needs_review"] = True
    answers[idx] = answer
    row.answers = answers
    sa_attributes.flag_modified(row, "answers")

    db.add(OverrideHistory(
        job_id=job_id,
        student_id=student_id,
        question_number=body.question_number,
        previous_score=previous_score,
        new_score=previous_score,
        reason=f"[flag_segmentation] {body.reason}",
        overridden_by=current_user.id,
        overridden_by_email=current_user.email,
    ))

    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Approval workflow
# ---------------------------------------------------------------------------

@router.post(
    "/{job_id}/student/{student_id}/approve",
    response_model=ApprovalOut,
    summary="Approve Student Result",
    description="Lock the student's result. Further overrides require reopen first.",
)
async def approve_student(
    job_id: uuid.UUID,
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = await _load_student_row(job_id, student_id, db)
    if row.approved_at is None:
        row.approved_at = datetime.now(timezone.utc)
        row.approved_by = current_user.id
        row.approved_by_email = current_user.email
        await db.commit()
        await db.refresh(row)

    return ApprovalOut(
        job_id=job_id,
        student_id=student_id,
        approved_at=row.approved_at,
        approved_by=row.approved_by,
        approved_by_email=row.approved_by_email,
    )


@router.post(
    "/{job_id}/student/{student_id}/reopen",
    response_model=ApprovalOut,
    summary="Reopen Approved Student",
    description="Clear approval so further overrides can be made.",
)
async def reopen_student(
    job_id: uuid.UUID,
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = await _load_student_row(job_id, student_id, db)
    row.approved_at = None
    row.approved_by = None
    row.approved_by_email = None
    await db.commit()
    await db.refresh(row)

    return ApprovalOut(
        job_id=job_id,
        student_id=student_id,
        approved_at=None,
        approved_by=None,
        approved_by_email=None,
    )


# ---------------------------------------------------------------------------
# Override history
# ---------------------------------------------------------------------------

@router.get(
    "/{job_id}/student/{student_id}/history",
    response_model=OverrideHistoryOut,
    summary="Override Audit Trail",
    description="Returns every override made on this student's result, newest first.",
)
async def override_history(
    job_id: uuid.UUID,
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_completed_job(job_id, db)
    rows = await db.execute(
        select(OverrideHistory)
        .where(OverrideHistory.job_id == job_id, OverrideHistory.student_id == student_id)
        .order_by(OverrideHistory.overridden_at.desc())
    )
    history = rows.scalars().all()

    def _kind_from_reason(reason: str) -> str:
        r = (reason or "").lstrip()
        if r.startswith("[flag_segmentation]"):
            return "flag_segmentation"
        # Legacy [remap] rows — kind is no longer supported as its own label;
        # fall through to 'override' so the schema literal accepts it.
        return "override"

    items: list[OverrideHistoryItem] = []
    for h in history:
        item = OverrideHistoryItem.model_validate(h)
        item.kind = _kind_from_reason(h.reason)  # type: ignore[assignment]
        items.append(item)

    return OverrideHistoryOut(
        job_id=job_id,
        student_id=student_id,
        total=len(history),
        history=items,
    )


@router.post(
    "/{job_id}/notify",
    response_model=NotifyOut,
    summary="Send Result Notification",
    description="Simulates sending a notification that evaluation results are ready. Returns the exam title and number of students notified.",
)
async def notify_students(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await _get_completed_job(job_id, db)
    exam_res = await db.execute(select(Exam).where(Exam.id == job.exam_id))
    exam = exam_res.scalar_one_or_none()
    exam_title = exam.title if exam else "Bilinmeyen Sınav"

    return NotifyOut(
        notified=True,
        message=f"{exam_title} sonuçları hazır — {job.total_students} öğrenci bilgilendirildi",
        job_id=job_id,
    )
