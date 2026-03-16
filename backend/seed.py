"""
seed.py — Populates demo data on first run.

Run with:
    python seed.py

Creates:
  - 1 admin user  (admin@university.edu / admin123)
  - 2 sample answer keys
  - 3 sample exams with completed evaluation jobs and student results
"""
import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, create_tables
from app.core.security import hash_password
from app.models.models import (
    AnswerKey, Exam, EvaluationJob, ExamType, JobStatus, StudentResult, User, UserRole,
)
from app.services import layout_service, eval_service


# ---------------------------------------------------------------------------
# Sample answer keys
# ---------------------------------------------------------------------------

def _mc_key_40():
    """Deterministic 40-question MC key."""
    cycle = ["A", "B", "C", "D"]
    return [{"number": i + 1, "type": "mc", "correct_answer": cycle[i % 4], "rubric": None, "points": 2.5}
            for i in range(40)]


def _open_key_3():
    rubrics = [
        "Nesne yönelimli programlamanın 4 temel ilkesini (kalıtım, polimorfizm, kapsülleme, soyutlama) açıklayın.",
        "Veri yapısı seçiminin algoritma karmaşıklığına etkisini örneklerle anlatın.",
        "REST API'nin HTTP metodlarını ve durum kodlarını açıklayın.",
    ]
    return [{"number": 41 + i, "type": "open", "correct_answer": None, "rubric": r, "points": 10}
            for i, r in enumerate(rubrics)]


# ---------------------------------------------------------------------------
# Main seed logic
# ---------------------------------------------------------------------------

async def seed():
    print("Creating tables...")
    await create_tables()

    async with AsyncSessionLocal() as db:
        # ---- Admin user ------------------------------------------------
        existing = await db.execute(select(User).where(User.email == "admin@university.edu"))
        if existing.scalar_one_or_none():
            print("Seed data already present — skipping.")
            return

        admin = User(
            id=uuid.uuid4(),
            email="admin@university.edu",
            hashed_password=hash_password("admin123"),
            role=UserRole.admin,
        )
        db.add(admin)
        await db.flush()
        print(f"  ✓ Admin user created: {admin.email}")

        # ---- Answer keys -----------------------------------------------
        ak1 = AnswerKey(
            id=uuid.uuid4(),
            name="Bilgisayar Mühendisliği Ara Sınav — Algoritma",
            course_name="BM301 Algoritmalar",
            questions=_mc_key_40() + _open_key_3(),
            created_by=admin.id,
        )
        ak2 = AnswerKey(
            id=uuid.uuid4(),
            name="Yazılım Mühendisliği Final — OOP",
            course_name="YM201 Nesne Yönelimli Programlama",
            questions=_mc_key_40() + _open_key_3(),
            created_by=admin.id,
        )
        db.add_all([ak1, ak2])
        await db.flush()
        print(f"  ✓ Answer keys created: {ak1.name}, {ak2.name}")

        # ---- Exams + completed jobs ------------------------------------
        exams_meta = [
            ("BM301 2024 Ara Sınav", "BM301 Algoritmalar", ExamType.mixed, ak1.id),
            ("YM201 2024 Final", "YM201 Nesne Yönelimli Programlama", ExamType.mixed, ak2.id),
            ("BM101 2024 Genel Sınav", "BM101 Programlamaya Giriş", ExamType.mc, ak1.id),
        ]

        for title, course, etype, ak_id in exams_meta:
            exam_id = uuid.uuid4()
            exam = Exam(
                id=exam_id,
                title=title,
                course_name=course,
                exam_type=etype,
                pdf_path=f"/data/uploads/{exam_id}/original.pdf",
                answer_key_id=ak_id,
                uploaded_by=admin.id,
            )
            db.add(exam)
            await db.flush()

            # Completed job
            job_id = uuid.uuid4()
            students = layout_service.get_student_sheets(str(exam_id))
            results_list = [eval_service.evaluate_student(s) for s in students]

            job = EvaluationJob(
                id=job_id,
                exam_id=exam_id,
                status=JobStatus.complete,
                progress_pct=100,
                progress_detail="Evaluation complete.",
                total_students=len(students),
                processed_students=len(students),
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
            )
            db.add(job)
            await db.flush()

            for r in results_list:
                record = StudentResult(
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
                )
                db.add(record)

            print(f"  ✓ Exam '{title}' — job {job_id} — {len(students)} students")

        await db.commit()
        print("\nSeed complete!")
        print("  Admin login: admin@university.edu / admin123")


if __name__ == "__main__":
    asyncio.run(seed())
