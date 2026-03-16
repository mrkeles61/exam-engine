"""
Mock Evaluation Service.

Real implementation will send answer text to an LLM (GPT-4 / Claude) for
open-ended grading and use exact matching for MC.
This mock returns deterministic-ish scores based on student_id seed.
"""
import random
from typing import List, Optional

_OPEN_FEEDBACKS = [
    "Temel kavramları doğru ifade etmiş, ancak örnekler yetersiz kalmıştır.",
    "Kapsamlı ve iyi organize edilmiş bir yanıt. Teknik terimler doğru kullanılmış.",
    "Konu genel hatlarıyla anlaşılmış fakat kritik detaylar eksik.",
    "Yanıt çok kısa, yeterli açıklama yapılmamıştır.",
    "Mükemmel yanıt. Tüm alt başlıklar eksiksiz ele alınmış.",
    "Kısmen doğru. Bazı kavramlar yanlış kullanılmış veya karıştırılmış.",
    "Örnekler yerinde ve açıklamalar tutarlı.",
    "Yanıtta ciddi kavram hataları var, konunun özü kavranamamış görünüyor.",
]

# Default fallback answer key (40 MC questions)
_DEFAULT_MC_KEY = [
    "A","C","B","D","A","B","C","D","A","B",
    "C","A","D","B","C","A","D","B","C","A",
    "B","D","A","C","B","A","D","C","B","A",
    "C","D","B","A","C","D","A","B","C","D",
]


def _letter_grade(pct: float) -> str:
    if pct >= 90:
        return "AA"
    elif pct >= 85:
        return "BA"
    elif pct >= 80:
        return "BB"
    elif pct >= 75:
        return "CB"
    elif pct >= 70:
        return "CC"
    elif pct >= 60:
        return "DC"
    elif pct >= 50:
        return "DD"
    else:
        return "FF"


def evaluate_student(
    student_sheet: dict,
    mc_answer_key: Optional[List[str]] = None,
    open_questions: Optional[List[dict]] = None,
) -> dict:
    """
    Evaluate a single student sheet and return a result dict.

    mc_answer_key: list of correct letters (same length as student's mc_answers)
    open_questions: list of {rubric, points} dicts
    """
    rng = random.Random(hash(student_sheet["student_id"]) % (2**32))

    # --- MC scoring ---
    mc_answers = student_sheet.get("mc_answers", [])
    key = mc_answer_key or _DEFAULT_MC_KEY
    mc_total = float(len(key))
    mc_details = []

    correct_count = 0
    for i, (student_ans, correct_ans) in enumerate(zip(mc_answers, key)):
        is_correct = student_ans == correct_ans
        if is_correct:
            correct_count += 1
        mc_details.append({
            "question_number": i + 1,
            "question_type": "mc",
            "student_answer": student_ans,
            "correct_answer": correct_ans,
            "is_correct": is_correct,
            "score": 1.0 if is_correct else 0.0,
            "max_score": 1.0,
            "feedback": None,
            "confidence": None,
        })

    mc_score = float(correct_count)

    # --- Open-ended scoring ---
    open_answers = student_sheet.get("open_answers", [])
    open_max_per_q = 10.0
    open_total = float(len(open_answers)) * open_max_per_q
    open_score = 0.0
    open_details = []

    for i, answer_text in enumerate(open_answers):
        score = round(rng.uniform(5.0, 10.0), 1)
        open_score += score
        confidence = round(rng.uniform(0.70, 0.95), 3)
        feedback = rng.choice(_OPEN_FEEDBACKS)

        rubric = ""
        if open_questions and i < len(open_questions):
            rubric = open_questions[i].get("rubric", "")
            open_max_per_q_override = open_questions[i].get("points", 10.0)
        else:
            open_max_per_q_override = 10.0

        open_details.append({
            "question_number": len(mc_answers) + i + 1,
            "question_type": "open",
            "student_answer": answer_text[:200],  # truncate for storage
            "correct_answer": rubric or None,
            "is_correct": None,
            "score": score,
            "max_score": open_max_per_q_override,
            "feedback": feedback,
            "confidence": confidence,
        })

    # --- Aggregate ---
    grand_total = mc_total + open_total
    grand_score = mc_score + open_score
    total_pct = (grand_score / grand_total * 100) if grand_total > 0 else 0.0
    grade = _letter_grade(total_pct)

    return {
        "student_id": student_sheet["student_id"],
        "student_name": student_sheet["student_name"],
        "mc_score": mc_score,
        "mc_total": mc_total,
        "open_score": round(open_score, 2),
        "open_total": open_total,
        "total_pct": round(total_pct, 2),
        "grade": grade,
        "answers": mc_details + open_details,
    }
