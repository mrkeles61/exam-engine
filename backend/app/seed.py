"""
app/seed.py -- Demo data seeder.

Run with:
    python -m app.seed

Creates (idempotent -- skips if admin already exists):
  - 1 admin user  (ADMIN_EMAIL / ADMIN_PASSWORD from .env)
  - 2 answer keys (MC-only 40q, Mixed 40 MC + 3 open)
  - 3 exams with completed evaluation jobs and 15-20 students each
"""
import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal, create_tables
from app.core.security import hash_password
from app.models.models import (
    AnswerKey, Exam, EvaluationJob, ExamType, JobStatus,
    PipelineLog, StudentResult, User, UserRole,
)

# ---------------------------------------------------------------------------
# Turkish student name pool
# ---------------------------------------------------------------------------
_FIRST = [
    "Ahmet", "Mehmet", "Mustafa", "Ali", "Huseyin", "Ibrahim", "Hasan", "Yusuf",
    "Omer", "Emre", "Berkay", "Serkan", "Berk", "Enes", "Furkan", "Burak",
    "Ayse", "Fatma", "Zeynep", "Emine", "Hatice", "Merve", "Busra", "Selin",
    "Elif", "Ozge", "Nazli", "Gizem", "Irem", "Tugba", "Asli", "Sibel",
]
_LAST = [
    "Yilmaz", "Kaya", "Demir", "Sahin", "Celik", "Yildiz", "Yildirim",
    "Ozturk", "Arslan", "Dogan", "Kilic", "Aslan", "Cetin", "Koc",
    "Kurt", "Ozdemir", "Aydin", "Simsek", "Bulut", "Karaca", "Erdogan",
    "Gunes", "Akin", "Polat", "Tekin", "Kaplan", "Isik", "Cakir",
]

_MC_CYCLE = ["A", "B", "C", "D"]
_OPEN_FEEDBACK = [
    "Temel kavramlari dogru ifade etmis, ancak ornekler yetersiz.",
    "Kapsamli ve iyi organize edilmis yanit. Teknik terimler dogru kullanilmis.",
    "Konu genel hatlariyla anlasilmis fakat kritik detaylar eksik.",
    "Yanit cok kisa; yeterli aciklama yapilmamis.",
    "Mukemmel yanit - tum alt basliklar eksiksiz ele alinmis.",
    "Kismen dogru. Bazi kavramlar yanlis kullanilmis.",
    "Ornekler yerinde ve aciklamalar tutarli.",
    "Konunun ozu kavranamamis gorunuyor.",
]


# ---------------------------------------------------------------------------
# Answer key builders
# ---------------------------------------------------------------------------

def _mc_40() -> list:
    return [
        {
            "number": i + 1,
            "type": "mc",
            "correct_answer": _MC_CYCLE[i % 4],
            "rubric": None,
            "points": 2.5,
        }
        for i in range(40)
    ]


def _open_3(start: int = 41) -> list:
    rubrics = [
        "Nesne yonelimli programlamanin 4 temel ilkesini aciklayin (kalitim, polimorfizm, kapsulleme, soyutlama).",
        "Veri yapisi seciminin algoritma karmasikligina etkisini orneklerle anlatın.",
        "REST API HTTP metodlarini ve yaygin durum kodlarini aciklayin.",
    ]
    return [
        {
            "number": start + i,
            "type": "open",
            "correct_answer": None,
            "rubric": r,
            "points": 10,
        }
        for i, r in enumerate(rubrics)
    ]


# ---------------------------------------------------------------------------
# Student result generator
# ---------------------------------------------------------------------------

def _grade(pct: float) -> str:
    if pct >= 90: return "AA"
    if pct >= 85: return "BA"
    if pct >= 80: return "BB"
    if pct >= 75: return "CB"
    if pct >= 70: return "CC"
    if pct >= 60: return "DC"
    if pct >= 50: return "DD"
    return "FF"


def _make_students(exam_seed: int, mc_key: list, open_questions: list, count: int) -> list:
    rng = random.Random(exam_seed)
    results = []

    open_sample_answers = [
        "Nesne yonelimli programlama; kalitim, polimorfizm ve kapsulleme ilkelerine dayanir.",
        "Veri yapilari, bilgilerin bellekte organize bicimde saklanmasini saglar.",
        "HTTP GET kaynak getirir, POST olusturur, PUT gunceller, DELETE siler.",
        "Algoritma karamasikligi, girdi buyuklugune gore calisme suresini ifade eder.",
        "Bagli liste, dizi ve yigin temel veri yapilarindandir.",
    ]

    for _ in range(count):
        first = rng.choice(_FIRST)
        last = rng.choice(_LAST)
        year = rng.randint(2019, 2023)
        suffix = rng.randint(100000, 999999)
        student_id = f"{year}{suffix}"

        # MC answers
        mc_answers = [rng.choice(_MC_CYCLE) for _ in mc_key]
        mc_details = []
        mc_score = 0.0
        for q, student_ans in zip(mc_key, mc_answers):
            correct = q["correct_answer"]
            ok = student_ans == correct
            if ok:
                mc_score += q["points"]
            mc_details.append({
                "question_number": q["number"],
                "question_type": "mc",
                "student_answer": student_ans,
                "correct_answer": correct,
                "is_correct": ok,
                "score": q["points"] if ok else 0.0,
                "max_score": q["points"],
                "feedback": None,
                "confidence": None,
            })
        mc_total = sum(q["points"] for q in mc_key)

        # Open-ended
        open_details = []
        open_score = 0.0
        for q in open_questions:
            score = round(rng.uniform(4.0, 10.0), 1)
            open_score += score
            open_details.append({
                "question_number": q["number"],
                "question_type": "open",
                "student_answer": rng.choice(open_sample_answers),
                "correct_answer": q.get("rubric"),
                "is_correct": None,
                "score": score,
                "max_score": q["points"],
                "feedback": rng.choice(_OPEN_FEEDBACK),
                "confidence": round(rng.uniform(0.70, 0.95), 3),
            })
        open_total = sum(q["points"] for q in open_questions)

        grand = mc_total + open_total
        total_pct = round((mc_score + open_score) / grand * 100, 2) if grand else 0.0

        results.append({
            "student_id": student_id,
            "student_name": f"{first} {last}",
            "mc_score": mc_score,
            "mc_total": mc_total,
            "open_score": round(open_score, 2),
            "open_total": open_total,
            "total_pct": total_pct,
            "grade": _grade(total_pct),
            "answers": mc_details + open_details,
        })

    return results


# ---------------------------------------------------------------------------
# Pipeline log generator
# ---------------------------------------------------------------------------

def _make_logs(job_id: uuid.UUID, students: list, base_time: datetime) -> list:
    """Generate realistic historical pipeline logs for a completed job."""
    logs = []
    t = base_time

    def log(stage, level, message, student_id=None, student_name=None, score=None):
        nonlocal t
        t += timedelta(seconds=random.uniform(0.2, 1.0))
        logs.append(PipelineLog(
            job_id=job_id,
            stage=stage,
            level=level,
            message=message,
            student_id=student_id,
            student_name=student_name,
            score=score,
            timestamp=t,
        ))

    # OCR stage
    log("ocr", "info", "OCR başlatılıyor...")
    n_pages = random.randint(30, 60)
    for page in range(1, n_pages + 1):
        conf = round(random.uniform(0.88, 0.99), 3)
        level = "info" if conf >= 0.92 else "warning"
        log("ocr", level, f"Sayfa {page}/{n_pages} işlendi — güven: {conf}")
    log("ocr", "success", f"OCR tamamlandı — {n_pages} sayfa, ort. güven: {round(random.uniform(0.92, 0.97), 3)}")

    # Layout stage
    log("layout", "info", "Sayfa düzeni analiz ediliyor...")
    for i, s in enumerate(students, 1):
        log("layout", "info",
            f"Öğrenci {i}/{len(students)} algılandı — {s['student_id']}",
            student_id=s["student_id"], student_name=s["student_name"])
    log("layout", "success", f"Düzen analizi tamamlandı — {len(students)} öğrenci bulundu")

    # Evaluation stage
    log("evaluation", "info", "Değerlendirme başlatılıyor...")
    for s in students:
        pct = s["total_pct"]
        if pct >= 70:
            level = "success"
            msg = f"Değerlendirildi — puan: %{pct:.1f} ({s['grade']})"
        elif pct >= 50:
            level = "info"
            msg = f"Değerlendirildi — puan: %{pct:.1f} ({s['grade']})"
        else:
            level = "warning"
            msg = f"Düşük puan — %{pct:.1f} ({s['grade']})"
        log("evaluation", level, msg,
            student_id=s["student_id"], student_name=s["student_name"], score=pct)
    log("evaluation", "success",
        f"Değerlendirme tamamlandı — {len(students)} öğrenci puanlandı")

    return logs


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def seed() -> None:
    print("Creating tables...")
    await create_tables()

    async with AsyncSessionLocal() as db:
        # Guard -- skip if already seeded
        existing = await db.execute(select(User).where(User.email == settings.ADMIN_EMAIL))
        if existing.scalar_one_or_none():
            print("Seed data already present -- skipping.")
            return

        # ---- Admin user ----
        admin = User(
            id=uuid.uuid4(),
            email=settings.ADMIN_EMAIL,
            hashed_password=hash_password(settings.ADMIN_PASSWORD),
            role=UserRole.admin,
        )
        db.add(admin)
        await db.flush()
        print(f"  + Admin: {admin.email}")

        # ---- Answer keys ----
        mc_questions = _mc_40()
        mixed_mc = _mc_40()
        mixed_open = _open_3()

        ak_mc = AnswerKey(
            id=uuid.uuid4(),
            name="Algoritmalar Ara Sinav -- Coktan Secmeli (40 Soru)",
            course_name="BM301 Algoritmalar",
            questions=mc_questions,
            created_by=admin.id,
        )
        ak_mixed = AnswerKey(
            id=uuid.uuid4(),
            name="Yazilim Muhendisligi Final -- Karma (40 MC + 3 Acik)",
            course_name="YM201 Nesne Yonelimli Programlama",
            questions=mixed_mc + mixed_open,
            created_by=admin.id,
        )
        db.add_all([ak_mc, ak_mixed])
        await db.flush()
        print(f"  + Answer keys: 2 created")

        # ---- Exams with completed jobs ----
        exams_cfg = [
            (
                "BM301 2024 Ara Sinav",
                "BM301 Algoritmalar",
                ExamType.mc,
                ak_mc.id,
                mc_questions,
                [],
                101,
            ),
            (
                "YM201 2024 Final",
                "YM201 Nesne Yonelimli Programlama",
                ExamType.mixed,
                ak_mixed.id,
                mixed_mc,
                mixed_open,
                202,
            ),
            (
                "BM101 2024 Vize",
                "BM101 Programlamaya Giris",
                ExamType.mc,
                ak_mc.id,
                mc_questions,
                [],
                303,
            ),
        ]

        for title, course, etype, ak_id, mc_q, open_q, seed_int in exams_cfg:
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

            n_students = random.Random(seed_int).randint(15, 20)
            students = _make_students(seed_int, mc_q, open_q, n_students)

            job_start = datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 72))
            job_id = uuid.uuid4()
            job = EvaluationJob(
                id=job_id,
                exam_id=exam_id,
                answer_key_id=ak_id,
                status=JobStatus.complete,
                current_stage="evaluation",
                progress_pct=100,
                progress_detail="Evaluation complete.",
                total_students=n_students,
                processed_students=n_students,
                started_at=job_start,
                completed_at=job_start + timedelta(minutes=random.randint(2, 8)),
            )
            db.add(job)
            await db.flush()

            for s in students:
                db.add(StudentResult(
                    job_id=job_id,
                    student_id=s["student_id"],
                    student_name=s["student_name"],
                    mc_score=s["mc_score"],
                    mc_total=s["mc_total"],
                    open_score=s["open_score"],
                    open_total=s["open_total"],
                    total_pct=s["total_pct"],
                    grade=s["grade"],
                    answers=s["answers"],
                ))

            # Generate pipeline logs for this job
            pipeline_logs = _make_logs(job_id, students, job_start)
            for pl in pipeline_logs:
                db.add(pl)

            print(f"  + Exam '{title}' -- {n_students} students, {len(pipeline_logs)} logs")

        await db.commit()

    print("")
    print("Seed complete!")
    print(f"  Login: {settings.ADMIN_EMAIL} / {settings.ADMIN_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
