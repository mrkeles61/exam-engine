import csv
import io
import math
import uuid
from collections import Counter
from statistics import median as calc_median
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_db, get_current_user
from app.models.models import EvaluationJob, Exam, JobStatus, StudentResult, User
from app.schemas.schemas import (
    AnalyticsOut, NotifyOut, OverrideRequest, QuestionAnalytics,
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


@router.patch(
    "/{job_id}/student/{student_id}",
    response_model=StudentResultOut,
    summary="Override Grade",
    description="Allows the instructor to manually override the LLM-assigned score for a student. Recalculates total_pct and auto-assigns the letter grade unless a manual grade is also provided.",
)
async def override_grade(
    job_id: uuid.UUID,
    student_id: str,
    body: OverrideRequest,
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

    if body.mc_score is not None:
        row.mc_score = body.mc_score
    if body.open_score is not None:
        row.open_score = body.open_score

    grand = row.mc_total + row.open_total
    row.total_pct = round((row.mc_score + row.open_score) / grand * 100, 2) if grand else 0.0

    if body.grade is not None:
        row.grade = body.grade
    else:
        p = row.total_pct
        if p >= 90: row.grade = "AA"
        elif p >= 85: row.grade = "BA"
        elif p >= 80: row.grade = "BB"
        elif p >= 75: row.grade = "CB"
        elif p >= 70: row.grade = "CC"
        elif p >= 60: row.grade = "DC"
        elif p >= 50: row.grade = "DD"
        else: row.grade = "FF"

    await db.commit()
    await db.refresh(row)
    return row


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
