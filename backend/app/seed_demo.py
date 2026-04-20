"""
Seed the database with three hand-crafted demo exams:
  A. CSE201 — Object-Oriented Programming (Final)
  B. MAT221 — Discrete Mathematics (Midterm)
  C. TDE101 — Türk Edebiyatı (Final)

Wipes existing exams / answer keys / jobs / student_results first, keeps users.

Run inside the API container:
    docker exec exam-engine-api-1 python -m app.seed_demo
"""
import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, create_tables, run_dev_migrations
from app.models.models import (
    AnswerKey,
    Exam,
    EvaluationJob,
    ExamType,
    JobStatus,
    OverrideHistory,
    PipelineLog,
    StudentResult,
    User,
    UserRole,
)
from app.core.security import hash_password
from app.services.pipeline import run_pipeline


# ─────────────────────────────────────────────────────────────────────────
# Exam A — CSE201 Object-Oriented Programming (Final)
# 10 MC + 2 fill + 2 open
# ─────────────────────────────────────────────────────────────────────────
CSE201_QUESTIONS = [
    # --- MC ---
    {"number": 1, "type": "mc", "points": 5,
     "text": "Aşağıdakilerden hangisi nesne yönelimli programlamanın bir temel ilkesi DEĞİLDİR?",
     "options": {"A": "Kalıtım (Inheritance)", "B": "Kapsülleme (Encapsulation)",
                 "C": "Rekürsiyon (Recursion)", "D": "Polimorfizm (Polymorphism)"},
     "correct_answer": "C"},
    {"number": 2, "type": "mc", "points": 5,
     "text": "Bir metodun farklı sınıflarda farklı davranışlar sergilemesi hangi ilkeye örnektir?",
     "options": {"A": "Soyutlama", "B": "Kapsülleme",
                 "C": "Polimorfizm", "D": "Kalıtım"},
     "correct_answer": "C"},
    {"number": 3, "type": "mc", "points": 5,
     "text": "SOLID ilkelerinde 'S' harfi neyi temsil eder?",
     "options": {"A": "Single Responsibility Principle", "B": "Simple Response Pattern",
                 "C": "Structured Object Design", "D": "State Oriented Logic"},
     "correct_answer": "A"},
    {"number": 4, "type": "mc", "points": 5,
     "text": "Java'da bir metodun alt sınıflar tarafından ezilmesini engelleyen anahtar sözcük hangisidir?",
     "options": {"A": "static", "B": "const", "C": "final", "D": "private"},
     "correct_answer": "C"},
    {"number": 5, "type": "mc", "points": 5,
     "text": "Aşağıdakilerden hangisi bir arayüzün (interface) asıl amacıdır?",
     "options": {"A": "Veri tutmak", "B": "Davranış sözleşmesi tanımlamak",
                 "C": "Bellek yönetmek", "D": "Hızlandırmak"},
     "correct_answer": "B"},
    {"number": 6, "type": "mc", "points": 5,
     "text": "Bir sınıftan örnek oluşturulurken çağrılan özel metoda ne denir?",
     "options": {"A": "Destructor", "B": "Constructor", "C": "Modifier", "D": "Accessor"},
     "correct_answer": "B"},
    {"number": 7, "type": "mc", "points": 5,
     "text": "Composition over inheritance (kalıtım yerine bileşim) yaklaşımının temel faydası nedir?",
     "options": {"A": "Daha sıkı bağlılık", "B": "Daha esnek ve yeniden kullanılabilir kod",
                 "C": "Daha çok sınıf yazmak", "D": "Daha hızlı çalıştırma"},
     "correct_answer": "B"},
    {"number": 8, "type": "mc", "points": 5,
     "text": "'Dependency Inversion' ilkesi ne anlama gelir?",
     "options": {"A": "Modüller arasındaki bağımlılıkları tersine çevirmek",
                 "B": "Soyutlamalara bağımlı olmak, somutlara değil",
                 "C": "Her sınıfı tek bağımlılıkla sınırlamak",
                 "D": "Sınıflar arası bağımlılığı tamamen kaldırmak"},
     "correct_answer": "B"},
    {"number": 9, "type": "mc", "points": 5,
     "text": "Aşağıdaki tasarım desenlerinden hangisi davranışsal (behavioral) bir desendir?",
     "options": {"A": "Singleton", "B": "Adapter", "C": "Observer", "D": "Factory"},
     "correct_answer": "C"},
    {"number": 10, "type": "mc", "points": 5,
     "text": "Hangisi encapsulation (kapsülleme) için en doğru örnektir?",
     "options": {"A": "private alanlar + public getter/setter",
                 "B": "Tüm alanları public yapmak",
                 "C": "Sınıfı final ilan etmek",
                 "D": "Kalıtım zincirini 3 seviye tutmak"},
     "correct_answer": "A"},

    # --- Fill ---
    {"number": 11, "type": "fill", "points": 6,
     "text": "OOP kavramları — boşlukları doldurunuz",
     "fill_template": "Bir metodun farklı şekillerde davranmasına ___ denir; "
                       "kodun üst sınıftan yeniden kullanılmasına ise ___ adı verilir.",
     "fill_answers": ["polimorfizm", "kalıtım"]},
    {"number": 12, "type": "fill", "points": 6,
     "text": "Sınıf yapıları",
     "fill_template": "Bir sınıftan nesne üretildiğinde çağrılan özel metoda ___ denir; "
                       "alanlara erişimi sınırlamak için kullanılan erişim belirleyicisi ___.",
     "fill_answers": ["constructor", "private"]},

    # --- Open ---
    {"number": 13, "type": "open", "points": 20,
     "text": "Polimorfizm nedir? Java veya benzeri bir dilde iki satırlık örnekle birlikte açıklayınız.",
     "rubric": "Tanım (5p) + örnek kod (10p) + örneğin neden polimorfik olduğunun açıklaması (5p)"},
    {"number": 14, "type": "open", "points": 18,
     "text": "SOLID ilkelerinden birini seçin ve bir yazılımda nasıl ihlal edildiğini + nasıl düzeltileceğini anlatın.",
     "rubric": "İlkenin adı ve tanımı (3p) + ihlal örneği (8p) + düzeltme önerisi (7p)"},
]
# Point totals: 10×5 + 2×6 + 20 + 18 = 100


# ─────────────────────────────────────────────────────────────────────────
# Exam B — MAT221 Discrete Mathematics (Midterm)
# 8 MC + 3 fill + 1 open
# ─────────────────────────────────────────────────────────────────────────
MAT221_QUESTIONS = [
    {"number": 1, "type": "mc", "points": 4,
     "text": "¬(p ∧ q) ifadesi aşağıdakilerden hangisine eşdeğerdir?",
     "options": {"A": "¬p ∨ ¬q", "B": "¬p ∧ ¬q", "C": "p ∨ q", "D": "p → q"},
     "correct_answer": "A"},
    {"number": 2, "type": "mc", "points": 4,
     "text": "A = {1, 2, 3} ve B = {3, 4} ise A ∪ B kaç elemanlıdır?",
     "options": {"A": "2", "B": "3", "C": "4", "D": "5"},
     "correct_answer": "C"},
    {"number": 3, "type": "mc", "points": 4,
     "text": "5 kişi arasından 3 kişilik bir komite kaç farklı biçimde seçilebilir?",
     "options": {"A": "10", "B": "15", "C": "20", "D": "60"},
     "correct_answer": "A"},
    {"number": 4, "type": "mc", "points": 4,
     "text": "p → q ifadesi aşağıdakilerden hangisine eşdeğerdir?",
     "options": {"A": "p ∧ q", "B": "¬p ∨ q", "C": "¬p ∧ q", "D": "p ∨ ¬q"},
     "correct_answer": "B"},
    {"number": 5, "type": "mc", "points": 4,
     "text": "Bir kümenin kuvvet kümesi (power set) |A| = 4 için kaç elemanlıdır?",
     "options": {"A": "8", "B": "12", "C": "16", "D": "24"},
     "correct_answer": "C"},
    {"number": 6, "type": "mc", "points": 4,
     "text": "Aşağıdakilerden hangisi bir eşdeğerlik bağıntısının özelliği DEĞİLDİR?",
     "options": {"A": "Yansıma", "B": "Simetri", "C": "Geçişme", "D": "Antisimetri"},
     "correct_answer": "D"},
    {"number": 7, "type": "mc", "points": 4,
     "text": "8! / 6! ifadesinin değeri kaçtır?",
     "options": {"A": "8", "B": "56", "C": "64", "D": "336"},
     "correct_answer": "B"},
    {"number": 8, "type": "mc", "points": 4,
     "text": "Bir grafiğin tüm köşelerinin derecelerinin toplamı aşağıdakilerden hangisine eşittir?",
     "options": {"A": "Köşe sayısı", "B": "Kenar sayısının 2 katı",
                 "C": "Kenar sayısı", "D": "Köşe sayısı + kenar sayısı"},
     "correct_answer": "B"},

    {"number": 9, "type": "fill", "points": 6,
     "text": "Kombinatorik formülleri",
     "fill_template": "n elemanlı bir kümeden k elemanlı kombinasyon seçimi C(n,k) = n! / (___ ! × ___ !).",
     "fill_answers": ["k", "n-k"]},
    {"number": 10, "type": "fill", "points": 6,
     "text": "Mantık eşdeğerlikleri",
     "fill_template": "De Morgan yasasına göre ¬(p ∧ q) ≡ ___ ∨ ___.",
     "fill_answers": ["¬p", "¬q"]},
    {"number": 11, "type": "fill", "points": 6,
     "text": "Küme işlemleri",
     "fill_template": "A ∩ B boş ise A ve B kümelerine ___ kümeler denir; "
                       "A ⊂ B iken A = B de oluyorsa A ve B kümeleri ___ dir.",
     "fill_answers": ["ayrık", "eşit"]},

    {"number": 12, "type": "open", "points": 50,
     "text": "n ≥ 1 için 1 + 2 + ... + n = n(n+1)/2 olduğunu matematiksel tümevarım ile kanıtlayınız.",
     "rubric": "Temel adım (10p) + Hipotez (10p) + Tümevarım adımı (20p) + Sonuç (10p)"},
]


# ─────────────────────────────────────────────────────────────────────────
# Exam C — TDE101 Türk Edebiyatı (Final)
# 5 MC + 2 fill + 3 open
# ─────────────────────────────────────────────────────────────────────────
TDE101_QUESTIONS = [
    {"number": 1, "type": "mc", "points": 4,
     "text": '"Sessiz Gemi" şiiri hangi şairimize aittir?',
     "options": {"A": "Yahya Kemal Beyatlı", "B": "Nazım Hikmet",
                 "C": "Orhan Veli Kanık", "D": "Cahit Sıtkı Tarancı"},
     "correct_answer": "A"},
    {"number": 2, "type": "mc", "points": 4,
     "text": "Tanzimat edebiyatının ilk romanı olarak kabul edilen eser hangisidir?",
     "options": {"A": "İntibah", "B": "Taaşşuk-ı Talat ve Fitnat",
                 "C": "Araba Sevdası", "D": "Mai ve Siyah"},
     "correct_answer": "B"},
    {"number": 3, "type": "mc", "points": 4,
     "text": "Divan edebiyatında nazım birimi olarak 'beyit' hangi biçimde tanımlanır?",
     "options": {"A": "Dört mısralık bent", "B": "İki mısralık birim",
                 "C": "Üç mısralık bent", "D": "Tek mısra"},
     "correct_answer": "B"},
    {"number": 4, "type": "mc", "points": 4,
     "text": 'Cumhuriyet döneminde "Kuyucaklı Yusuf" romanının yazarı kimdir?',
     "options": {"A": "Reşat Nuri Güntekin", "B": "Halide Edip Adıvar",
                 "C": "Sabahattin Ali", "D": "Yakup Kadri Karaosmanoğlu"},
     "correct_answer": "C"},
    {"number": 5, "type": "mc", "points": 4,
     "text": "Servet-i Fünun edebiyatının en önemli şairlerinden biri kimdir?",
     "options": {"A": "Namık Kemal", "B": "Tevfik Fikret",
                 "C": "Ziya Paşa", "D": "Mehmet Akif Ersoy"},
     "correct_answer": "B"},

    {"number": 6, "type": "fill", "points": 6,
     "text": "Yahya Kemal'den bir dize",
     "fill_template": '"Artık demir almak günü gelmişse ___den; / Meçhûle giden bir ___ kalkar bu limandan."',
     "fill_answers": ["zaman", "gemi"]},
    {"number": 7, "type": "fill", "points": 6,
     "text": "Edebiyat dönemleri",
     "fill_template": "Türk edebiyatında ilk tiyatro eseri ___ tarafından yazılan 'Şair Evlenmesi'dir. "
                       "Bu eser ___ edebiyatı döneminde kaleme alınmıştır.",
     "fill_answers": ["Şinasi", "Tanzimat"]},

    {"number": 8, "type": "open", "points": 20,
     "text": "Divan edebiyatı ile halk edebiyatı arasındaki üç temel farkı örneklerle açıklayınız.",
     "rubric": "Dil / nazım birimi / konu başlıklarından en az üçü (her biri 6-7p)."},
    {"number": 9, "type": "open", "points": 20,
     "text": "Tanzimat edebiyatının doğuşunu hazırlayan siyasî ve kültürel koşullar nelerdir?",
     "rubric": "Tanzimat Fermanı (5p) + Batılılaşma etkisi (7p) + gazete/eğitim kurumları (8p)."},
    {"number": 10, "type": "open", "points": 28,
     "text": "Cumhuriyet dönemi Türk şiirinde Orhan Veli'nin öncülük ettiği 'Garip Akımı' hangi yeniliklerle öne çıkar?",
     "rubric": "Akımın amacı (8p) + şiir diline etkileri (10p) + örnek dize / şair (10p)."},
]
# Point totals: 5×4 + 2×6 + 20 + 20 + 28 = 100


DEMOS = [
    {
        "key_name": "CSE201 — OOP Final",
        "course": "Nesne Yönelimli Programlama",
        "course_code": "CSE201",
        "exam_title": "CSE201 OOP — Final Sınavı",
        "exam_type": ExamType.mixed,
        "questions": CSE201_QUESTIONS,
    },
    {
        "key_name": "MAT221 — Ayrık Matematik Vize",
        "course": "Ayrık Matematik",
        "course_code": "MAT221",
        "exam_title": "MAT221 Ayrık Matematik — Vize",
        "exam_type": ExamType.mixed,
        "questions": MAT221_QUESTIONS,
    },
    {
        "key_name": "TDE101 — Türk Edebiyatı Final",
        "course": "Türk Edebiyatı",
        "course_code": "TDE101",
        "exam_title": "TDE101 Türk Edebiyatı — Final",
        "exam_type": ExamType.mixed,
        "questions": TDE101_QUESTIONS,
    },
]


async def _ensure_admin(db: AsyncSession) -> User:
    """Make sure an admin user exists so demo data has an owner."""
    res = await db.execute(select(User).where(User.email == "admin@university.edu"))
    admin = res.scalar_one_or_none()
    if admin:
        return admin
    admin = User(
        email="admin@university.edu",
        hashed_password=hash_password("admin123"),
        role=UserRole.admin,
    )
    db.add(admin)
    await db.commit()
    await db.refresh(admin)
    return admin


async def _wipe(db: AsyncSession) -> None:
    """Wipe exams + answer keys + jobs + results + history + logs. Keep users."""
    # Cascade deletes should take care of most of this, but be explicit.
    await db.execute(delete(OverrideHistory))
    await db.execute(delete(PipelineLog))
    await db.execute(delete(StudentResult))
    await db.execute(delete(EvaluationJob))
    await db.execute(delete(Exam))
    await db.execute(delete(AnswerKey))
    await db.commit()


async def _create_demo(db: AsyncSession, admin: User, demo: dict) -> str:
    """Create one demo AnswerKey + Exam pair. Returns the new exam_id."""
    ak = AnswerKey(
        name=demo["key_name"],
        course_name=demo["course"],
        questions=demo["questions"],
        created_by=admin.id,
    )
    db.add(ak)
    await db.commit()
    await db.refresh(ak)

    exam = Exam(
        title=demo["exam_title"],
        course_name=demo["course"],
        exam_type=demo["exam_type"],
        answer_key_id=ak.id,
        uploaded_by=admin.id,
    )
    db.add(exam)
    await db.commit()
    await db.refresh(exam)

    return str(exam.id), str(ak.id)


async def _run_one_demo(exam_id: str, ak_id: str) -> None:
    """Create a job + run the pipeline synchronously (awaits full completion)."""
    async with AsyncSessionLocal() as db:
        job = EvaluationJob(
            exam_id=uuid.UUID(exam_id),
            answer_key_id=uuid.UUID(ak_id),
            status=JobStatus.pending,
            progress_pct=0,
            progress_detail="Demo pipeline queued",
            started_at=datetime.now(timezone.utc),
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)
        job_id = str(job.id)

    print(f"  → Running pipeline for job {job_id} ...")
    await run_pipeline(job_id, exam_id, ak_id)
    print(f"  ✓ Job {job_id} complete.")


async def main() -> None:
    print("Ensuring tables + dev migrations...")
    await create_tables()
    await run_dev_migrations()

    async with AsyncSessionLocal() as db:
        admin = await _ensure_admin(db)
        print(f"Using admin: {admin.email} ({admin.id})")

        print("Wiping existing demo data...")
        await _wipe(db)

        print(f"Seeding {len(DEMOS)} demo exams...")
        created = []
        for demo in DEMOS:
            exam_id, ak_id = await _create_demo(db, admin, demo)
            created.append((demo["exam_title"], exam_id, ak_id))
            print(f"  ✓ Created exam '{demo['exam_title']}' (id={exam_id})")

    # Run pipelines outside the db session so each gets its own context.
    for title, exam_id, ak_id in created:
        print(f"\nEvaluating: {title}")
        await _run_one_demo(exam_id, ak_id)

    print("\n✅ Done — 3 demo exams seeded + evaluated.")


if __name__ == "__main__":
    asyncio.run(main())
