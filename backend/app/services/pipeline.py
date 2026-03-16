"""
Pipeline orchestrator — split into three independently callable stage functions.

Each stage can be called directly (manual mode) or chained by run_pipeline (auto mode).
"""
import asyncio
import random
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.models import AnswerKey, Exam, EvaluationJob, JobStatus, StudentResult
from app.services import ocr_service, layout_service, eval_service
from app.services.log_service import write_log

logger = logging.getLogger(__name__)

_ABORT_STATUSES = {JobStatus.failed}


def _is_aborted(status: JobStatus) -> bool:
    return status in _ABORT_STATUSES


# ---------------------------------------------------------------------------
# OCR Stage
# ---------------------------------------------------------------------------

async def run_ocr(job_id: str) -> None:
    """Run OCR stage. Job must be in pending or ocr_failed state."""
    logger.info(f"[ocr] Starting job={job_id}")
    try:
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
            job = res.scalar_one_or_none()
            if not job or _is_aborted(job.status):
                return
            exam_res = await db.execute(select(Exam).where(Exam.id == job.exam_id))
            exam = exam_res.scalar_one_or_none()
            pdf_path = exam.pdf_path if exam else f"/data/uploads/{job.exam_id}/original.pdf"

            job.status = JobStatus.ocr_running
            job.current_stage = "ocr"
            job.progress_pct = 5
            job.progress_detail = "OCR aşaması başlatılıyor..."
            job.error_message = None
            if job.started_at is None:
                job.started_at = datetime.now(timezone.utc)
            await db.commit()

        await write_log(job_id, "ocr", "info", "OCR başlatıldı — Tesseract motoru kullanılıyor")

        ocr_pages = await asyncio.get_event_loop().run_in_executor(
            None, ocr_service.run_ocr, pdf_path
        )
        total_pages = len(ocr_pages)

        for i, page in enumerate(ocr_pages):
            async with AsyncSessionLocal() as db:
                res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
                job = res.scalar_one_or_none()
                if not job or _is_aborted(job.status):
                    return
                job.progress_pct = 5 + int((i + 1) / total_pages * 20)
                job.progress_detail = f"Sayfa {i + 1}/{total_pages} tarandı..."
                await db.commit()

            await write_log(
                job_id, "ocr", "info",
                f"Sayfa {i + 1}/{total_pages} tarandı — güven: {page['confidence']:.2f}",
            )
            await asyncio.sleep(0.3)

        avg_conf = sum(p["confidence"] for p in ocr_pages) / total_pages

        async with AsyncSessionLocal() as db:
            res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
            job = res.scalar_one_or_none()
            if not job or _is_aborted(job.status):
                return
            job.status = JobStatus.ocr_complete
            job.current_stage = None
            job.ocr_output = {
                "pages": ocr_pages,
                "pages_processed": total_pages,
                "avg_confidence": round(avg_conf, 4),
            }
            job.progress_pct = 25
            job.progress_detail = f"OCR tamamlandı — {total_pages} sayfa"
            await db.commit()

        await write_log(
            job_id, "ocr", "success",
            f"OCR tamamlandı — {total_pages} sayfa, ortalama güven: {avg_conf:.2f}",
        )
        logger.info(f"[ocr] Complete job={job_id} pages={total_pages}")

    except Exception as exc:
        logger.exception(f"[ocr] Failed job={job_id}: {exc}")
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
            job = res.scalar_one_or_none()
            if job:
                job.status = JobStatus.ocr_failed
                job.error_message = str(exc)
                await db.commit()
        await write_log(job_id, "ocr", "error", f"OCR hatası: {exc}")


# ---------------------------------------------------------------------------
# Layout Stage
# ---------------------------------------------------------------------------

async def run_layout(job_id: str) -> None:
    """Run layout stage. Job must be in ocr_complete or layout_failed state."""
    logger.info(f"[layout] Starting job={job_id}")
    try:
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
            job = res.scalar_one_or_none()
            if not job or _is_aborted(job.status):
                return
            exam_id = str(job.exam_id)

            job.status = JobStatus.layout_running
            job.current_stage = "layout"
            job.progress_pct = 28
            job.progress_detail = "Düzen analizi başlatılıyor..."
            job.error_message = None
            await db.commit()

        await write_log(job_id, "layout", "info", "Düzen analizi başlatıldı — LayoutParser kullanılıyor")

        student_sheets = await asyncio.get_event_loop().run_in_executor(
            None, layout_service.get_student_sheets, exam_id
        )
        total = len(student_sheets)

        for i, sheet in enumerate(student_sheets):
            async with AsyncSessionLocal() as db:
                res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
                job = res.scalar_one_or_none()
                if not job or _is_aborted(job.status):
                    return
                job.progress_pct = 28 + int((i + 1) / total * 20)
                job.progress_detail = f"Öğrenci {i + 1}/{total} tespit edildi..."
                await db.commit()

            await write_log(
                job_id, "layout", "info",
                f"Öğrenci tespit edildi: {sheet['student_name']} ({sheet['student_id']})",
                student_id=sheet["student_id"],
                student_name=sheet["student_name"],
            )
            await asyncio.sleep(0.5)

        async with AsyncSessionLocal() as db:
            res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
            job = res.scalar_one_or_none()
            if not job or _is_aborted(job.status):
                return
            job.status = JobStatus.layout_complete
            job.current_stage = None
            job.layout_output = {
                "student_sheets": student_sheets,
                "students_detected": total,
                "student_list": [
                    {"id": s["student_id"], "name": s["student_name"]}
                    for s in student_sheets
                ],
            }
            job.total_students = total
            job.progress_pct = 50
            job.progress_detail = f"Düzen analizi tamamlandı — {total} öğrenci"
            await db.commit()

        await write_log(
            job_id, "layout", "success",
            f"Düzen analizi tamamlandı — {total} öğrenci tespit edildi",
        )
        logger.info(f"[layout] Complete job={job_id} students={total}")

    except Exception as exc:
        logger.exception(f"[layout] Failed job={job_id}: {exc}")
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
            job = res.scalar_one_or_none()
            if job:
                job.status = JobStatus.layout_failed
                job.error_message = str(exc)
                await db.commit()
        await write_log(job_id, "layout", "error", f"Düzen analizi hatası: {exc}")


# ---------------------------------------------------------------------------
# Evaluation Stage
# ---------------------------------------------------------------------------

async def run_evaluation(job_id: str) -> None:
    """Run evaluation stage. Job must be in layout_complete or eval_failed state."""
    logger.info(f"[eval] Starting job={job_id}")
    try:
        mc_key = None
        open_questions = None
        student_sheets = None

        async with AsyncSessionLocal() as db:
            res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
            job = res.scalar_one_or_none()
            if not job or _is_aborted(job.status):
                return

            exam_id = str(job.exam_id)
            resolved_ak_id = job.answer_key_id
            if not resolved_ak_id:
                exam_res = await db.execute(select(Exam).where(Exam.id == job.exam_id))
                exam = exam_res.scalar_one_or_none()
                if exam:
                    resolved_ak_id = exam.answer_key_id

            if resolved_ak_id:
                ak_res = await db.execute(
                    select(AnswerKey).where(AnswerKey.id == str(resolved_ak_id))
                )
                ak = ak_res.scalar_one_or_none()
                if ak:
                    mc_qs = [q for q in ak.questions if q.get("type") == "mc"]
                    mc_key = [q.get("correct_answer", "A") for q in mc_qs] or None
                    open_questions = [q for q in ak.questions if q.get("type") == "open"] or None

            layout_out = job.layout_output or {}
            student_sheets = layout_out.get("student_sheets")

            job.status = JobStatus.eval_running
            job.current_stage = "evaluation"
            job.progress_pct = 53
            job.progress_detail = "Değerlendirme başlatılıyor..."
            job.error_message = None
            await db.commit()

        if not student_sheets:
            student_sheets = await asyncio.get_event_loop().run_in_executor(
                None, layout_service.get_student_sheets, exam_id
            )

        await write_log(
            job_id, "evaluation", "info",
            "Değerlendirme başlatıldı — Çoktan seçmeli + açık uçlu puanlama",
        )

        total = len(student_sheets)
        evaluated = []

        for i, sheet in enumerate(student_sheets):
            async with AsyncSessionLocal() as db:
                res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
                job = res.scalar_one_or_none()
                if not job or _is_aborted(job.status):
                    return
                job.progress_pct = 53 + int((i + 1) / total * 42)
                job.progress_detail = f"Öğrenci {i + 1}/{total} değerlendiriliyor..."
                job.processed_students = i
                await db.commit()

            await write_log(
                job_id, "evaluation", "info",
                f"Öğrenci {i + 1}/{total}: {sheet['student_name']} — İşleniyor...",
                student_id=sheet["student_id"],
                student_name=sheet["student_name"],
            )
            await asyncio.sleep(random.uniform(1.0, 2.0))

            result_dict = await asyncio.get_event_loop().run_in_executor(
                None, eval_service.evaluate_student, sheet, mc_key, open_questions
            )
            evaluated.append(result_dict)

            pct = result_dict["total_pct"]
            grade = result_dict["grade"]
            mc_s, mc_t = result_dict["mc_score"], result_dict["mc_total"]
            open_s, open_t = result_dict["open_score"], result_dict["open_total"]
            mc_str = f"{int(mc_s)}/{int(mc_t)}" if mc_t > 0 else "—"
            open_str = f"{open_s:.0f}/{int(open_t)}" if open_t > 0 else "—"
            level = "success" if pct >= 50.0 else "warning"
            mark = "✓" if pct >= 50.0 else "⚠"

            await write_log(
                job_id, "evaluation", level,
                f"Öğrenci {i + 1}/{total}: {sheet['student_name']} — "
                f"ÇS: {mc_str}, Açık: {open_str} — "
                f"Toplam: {pct:.1f}% ({grade}) {mark}",
                student_id=sheet["student_id"],
                student_name=sheet["student_name"],
                score=pct,
            )

        # Persist results and mark complete
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
            job = res.scalar_one_or_none()
            if not job or _is_aborted(job.status):
                return
            for r in evaluated:
                db.add(StudentResult(
                    job_id=job_id,
                    student_id=r["student_id"],
                    student_name=r["student_name"],
                    mc_score=r["mc_score"],
                    mc_total=r["mc_total"],
                    open_score=r["open_score"],
                    open_total=r["open_total"],
                    total_pct=r["total_pct"],
                    grade=r["grade"],
                    answers=r["answers"],
                ))
            job.status = JobStatus.complete
            job.current_stage = None
            job.progress_pct = 100
            job.progress_detail = "Değerlendirme tamamlandı."
            job.processed_students = total
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()

        avg = sum(r["total_pct"] for r in evaluated) / total if evaluated else 0.0
        high = max(r["total_pct"] for r in evaluated) if evaluated else 0.0
        low = min(r["total_pct"] for r in evaluated) if evaluated else 0.0

        await write_log(job_id, "evaluation", "success",
                        f"Değerlendirme tamamlandı — {total} öğrenci puanlandı")
        await write_log(job_id, "evaluation", "info",
                        f"Ortalama: {avg:.1f}% | En yüksek: {high:.1f}% | En düşük: {low:.1f}%")
        await write_log(job_id, "system", "success", "İş tamamlandı ✓")
        logger.info(f"[eval] Complete job={job_id} students={total}")

    except Exception as exc:
        logger.exception(f"[eval] Failed job={job_id}: {exc}")
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
            job = res.scalar_one_or_none()
            if job:
                job.status = JobStatus.eval_failed
                job.error_message = str(exc)
                await db.commit()
        await write_log(job_id, "evaluation", "error", f"Değerlendirme hatası: {exc}")


# ---------------------------------------------------------------------------
# Auto pipeline — chains all three stages
# ---------------------------------------------------------------------------

async def run_pipeline(job_id: str, exam_id: str, answer_key_id=None) -> None:
    """Auto mode: OCR → Layout → Evaluation in sequence."""
    logger.info(f"[pipeline] Auto mode job={job_id}")
    await write_log(job_id, "system", "info", "Otomatik pipeline başlatıldı")

    await run_ocr(job_id)

    async with AsyncSessionLocal() as db:
        res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
        job = res.scalar_one_or_none()
        if not job or job.status != JobStatus.ocr_complete:
            logger.warning(f"[pipeline] Stopping after OCR failure job={job_id}")
            return

    await run_layout(job_id)

    async with AsyncSessionLocal() as db:
        res = await db.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
        job = res.scalar_one_or_none()
        if not job or job.status != JobStatus.layout_complete:
            logger.warning(f"[pipeline] Stopping after Layout failure job={job_id}")
            return

    await run_evaluation(job_id)
