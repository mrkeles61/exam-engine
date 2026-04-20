"""
Mock Evaluation Service — emits workspace + scan-viewer-grade data.

Each answer dict produced here is what the teacher review workspace AND the
realistic mock scan renderer read. For every answer we attach:

  Workspace metadata (already there before this rewrite):
    - bbox (normalized 0-1 coordinates on a page)
    - ocr_confidence / confidence / needs_review flags
    - MC: bubble_fills (darkness per option — A/B/C/D)
    - Open: rubric_breakdown, ai_reasoning, model_used

  Scan-viewer content (new for the demo):
    - question_text — printed question shown in the MC/fill/open region
    - option_texts — MC options as {"A": "Abstraction", ...}
    - handwritten_answer — what the student "wrote" for open-ended
    - fill_template / fill_blanks / correct_blanks — for fill-in-the-blank rendering
    - handwriting_seed — per-student, drives font/color/rotation on the frontend

Real implementation will replace this with: OpenCV bubble detection for MC,
Claude/GPT vision for open-ended and fill-in-the-blank rubric scoring. The
schema stays the same.
"""
import random
from typing import Any, Dict, List, Optional


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

_AI_REASONINGS = [
    "Öğrenci konunun temel tanımını doğru vermiş ve bir örnekle desteklemiştir. "
    "Ancak ikinci alt başlıktaki karşılaştırma eksik kalmış; iki yaklaşım arasındaki "
    "pratik farkı açıklamamıştır. Bu nedenle ilgili rubrik kaleminden kısmi puan verildi.",

    "Yanıt rubrik kalemlerinin ilk ikisini net biçimde karşılıyor. Üçüncü kalemde "
    "beklenen formül verilmiş fakat türetme adımları atlanmış; bu kısmi puana karşılık gelir. "
    "Genel anlatım akıcı ve terminoloji yerinde.",

    "Temel kavram doğru tanımlanmış; ancak cevapta istenen sayısal örnek eksik. "
    "Ayrıca 'zaman karmaşıklığı' ifadesi 'alan karmaşıklığı' ile karıştırılmış — "
    "rubrik bu kalemi tam olarak kabul etmiyor.",

    "Öğrenci doğru algoritmayı seçmiş ve adımları sıralamış. İki küçük hata dışında "
    "çözüm eksiksiz. Hatalardan biri notasyon (O(n) yerine n yazılmış) kaynaklı, "
    "diğeri ise son adımda yuvarlamaya dayalı.",

    "Yanıt beklenen rubrik kalemlerinin hiçbirini tam karşılamıyor. Kavramsal anlatım "
    "var ancak istenen teknik detay (örn. örnek kod, sözde kod veya sayısal örnek) yok. "
    "Kısmi puan verilmedi; yalnızca girişe puan ayrıldı.",
]

_RUBRIC_LABEL_SETS = [
    ["Temel kavramı doğru tanımlama", "Uygun örnek verme", "Teknik terimleri doğru kullanma"],
    ["Problemi doğru formüle etme", "Çözüm adımlarını sıralama", "Sonucu doğru yorumlama"],
    ["Tanım ve kapsam", "Karşılaştırmalı analiz", "Pratik örnek / uygulama"],
    ["Base case belirleme", "Recursive step açıklama", "Karmaşıklık analizi"],
]

# Default fallback answer key (40 MC questions) — used when an answer key isn't provided
_DEFAULT_MC_KEY = [
    "A","C","B","D","A","B","C","D","A","B",
    "C","A","D","B","C","A","D","B","C","A",
    "B","D","A","C","B","A","D","C","B","A",
    "C","D","B","A","C","D","A","B","C","D",
]


def _letter_grade(pct: float) -> str:
    if pct >= 90: return "AA"
    if pct >= 85: return "BA"
    if pct >= 80: return "BB"
    if pct >= 75: return "CB"
    if pct >= 70: return "CC"
    if pct >= 60: return "DC"
    if pct >= 50: return "DD"
    return "FF"


# Flow-layout tunables — shared between frontend preview and backend seeder.
# 2-column masonry: mc/ms/fill pack shortest-column-first into two columns;
# match/open span the full content width.
_PAGE_TOP_PAGE1 = 0.28   # reserve top 28% of page 1 for IKU header
_PAGE_TOP_OTHER = 0.08   # subsequent pages start at 8%
_PAGE_BOTTOM = 0.94
_LEFT_X = 0.06
_GUTTER = 0.02
_COL_WIDTH = round((1 - 2 * _LEFT_X - _GUTTER) / 2, 4)   # ≈ 0.43
_FULL_WIDTH = round(1 - 2 * _LEFT_X, 4)                  # ≈ 0.88
_VERTICAL_GAP = 0.01     # between questions

_WIDE_TYPES = {"match", "open"}

_HEIGHT_BY_TYPE = {
    "mc": 0.075,
    "ms": 0.085,
    "fill": 0.11,
    "match": 0.22,
    # open is dynamic — handled inline in _height_for
}


def _height_for(q: dict) -> float:
    """Estimated normalized height for a question in flow-layout."""
    qtype = q.get("question_type") or q.get("type") or "mc"
    if qtype == "open":
        space = q.get("space_size") or 0
        try:
            space = int(space)
        except (TypeError, ValueError):
            space = 0
        h = 0.24 + 0.04 * space
    else:
        h = _HEIGHT_BY_TYPE.get(qtype, 0.1)
    if q.get("image_url"):
        h += 0.08
    return h


def _flow_bbox(answers_in_order: List[dict]) -> None:
    """
    Assign a `bbox` to every answer using a 2-column masonry packer:
      - mc / ms / fill pack into left/right columns (shortest-column-first).
      - match / open span the full content width and "close" both columns.

    Mutates the list in place, sorted by question_number. Page 1 reserves a
    tall header band; subsequent pages start near the top margin.
    """
    ordered = sorted(answers_in_order, key=lambda a: a.get("question_number", 0))
    page = 1
    y_left = _PAGE_TOP_PAGE1
    y_right = _PAGE_TOP_PAGE1
    for ans in ordered:
        h = _height_for(ans)
        is_wide = ans.get("question_type") in _WIDE_TYPES
        if is_wide:
            y = max(y_left, y_right)
            if y + h > _PAGE_BOTTOM:
                page += 1
                y = _PAGE_TOP_OTHER
                y_left = _PAGE_TOP_OTHER
                y_right = _PAGE_TOP_OTHER
            ans["bbox"] = {
                "page": page,
                "x": _LEFT_X,
                "y": round(y, 4),
                "w": _FULL_WIDTH,
                "h": round(h, 4),
            }
            new_y = y + h + _VERTICAL_GAP
            y_left = new_y
            y_right = new_y
        else:
            use_left = y_left <= y_right
            y = y_left if use_left else y_right
            if y + h > _PAGE_BOTTOM:
                page += 1
                y = _PAGE_TOP_OTHER
                y_left = _PAGE_TOP_OTHER
                y_right = _PAGE_TOP_OTHER
                use_left = True
            ans["bbox"] = {
                "page": page,
                "x": _LEFT_X if use_left else round(_LEFT_X + _COL_WIDTH + _GUTTER, 4),
                "y": round(y, 4),
                "w": _COL_WIDTH,
                "h": round(h, 4),
            }
            new_y = y + h + _VERTICAL_GAP
            if use_left:
                y_left = new_y
            else:
                y_right = new_y


def _segmentation_confidence(student_id: str, question_number: int) -> float:
    """
    Deterministic per-(student, question) bbox-placement confidence in [0.88, 0.99].
    Most land >= 0.93; ~1 in 6 sits in the 0.88–0.92 band so the teacher sees variance.
    """
    seed = abs(hash(f"{student_id}|seg|{question_number}")) % (2**32)
    r = random.Random(seed)
    # 82% chance of "clean" band (0.93..0.99), 18% chance of "watch" band (0.88..0.92)
    if r.random() < 0.82:
        return round(r.uniform(0.93, 0.99), 3)
    return round(r.uniform(0.88, 0.92), 3)


def _bubble_fills(selected_letter: str, rng: random.Random, options: List[str]) -> dict:
    """
    Realistic bubble fill darkness per option (0 = empty, 1 = fully filled).
    The selected letter is dark (0.75–0.95); stray marks on others stay under 0.15.
    """
    fills = {opt: round(rng.uniform(0.02, 0.15), 3) for opt in options}
    if selected_letter in fills:
        fills[selected_letter] = round(rng.uniform(0.75, 0.95), 3)
    return fills


def _rubric_breakdown(total_score: float, max_score: float, rng: random.Random) -> list:
    """Generate a 3-item rubric whose per-item scores sum to total_score."""
    labels = rng.choice(_RUBRIC_LABEL_SETS)
    per_item_max = max_score / 3.0
    base = total_score / 3.0
    raw = [max(0.0, min(per_item_max, base + rng.uniform(-per_item_max * 0.4, per_item_max * 0.4)))
           for _ in range(3)]
    s = sum(raw) or 1.0
    scores = [round(r / s * total_score, 1) for r in raw]
    drift = round(total_score - sum(scores), 2)
    scores[-1] = round(scores[-1] + drift, 1)

    items = []
    for label, score in zip(labels, scores):
        ratio = score / per_item_max if per_item_max > 0 else 0.0
        if ratio >= 0.85: status = "pass"
        elif ratio >= 0.40: status = "partial"
        else: status = "fail"
        items.append({
            "label": label, "score": score,
            "max_score": round(per_item_max, 2),
            "status": status,
        })
    return items


# ── Fill scoring ─────────────────────────────────────────────────────────

def _score_fill(
    student_blanks: Dict[str, str],
    correct_blanks: List[str],
    max_score: float,
) -> tuple[float, float]:
    """
    Returns (score, confidence).
    Correct blanks give 1/N of max_score each. Typos count as partial (half).
    """
    if not correct_blanks:
        return (0.0, 0.5)
    n = len(correct_blanks)
    per = max_score / n
    total = 0.0
    confidences = []
    for idx, correct in enumerate(correct_blanks, start=1):
        student = (student_blanks.get(str(idx), "") or "").strip().lower()
        target = correct.strip().lower()
        if not student:
            confidences.append(0.3)
            continue
        if student == target:
            total += per
            confidences.append(0.95)
        elif _is_close(student, target):
            total += per * 0.5  # partial credit for near-miss
            confidences.append(0.65)
        else:
            confidences.append(0.55)
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.5
    return (round(total, 2), round(avg_conf, 3))


def _is_close(a: str, b: str) -> bool:
    """Loose similarity — 1 char difference or length close enough."""
    if abs(len(a) - len(b)) > 2:
        return False
    # Very simple Levenshtein-ish — if >75% of chars match
    matches = sum(1 for c in a if c in b)
    return matches / max(len(a), 1) >= 0.75


# ── Multi-select (ms) scoring ────────────────────────────────────────────

def _score_ms(
    question: dict,
    student_picks: List[str],
    max_score: float,
) -> tuple[float, float]:
    """
    Multi-select scoring:
      score = (|picks ∩ correct| / |correct|) × max_score
              − penalty_per_item × |picks ∖ correct|
      floored at 0, capped at max_score.

    Returns (score, confidence). Confidence proxies closeness to full credit.
    """
    correct = set((question.get("ms_correct") or []))
    picks = set(student_picks or [])
    if not correct:
        return (0.0, 0.5)
    hit = len(picks & correct)
    wrong = len(picks - correct)
    penalty = float(question.get("penalty_per_item") or 0.0)
    raw = (hit / len(correct)) * max_score - penalty * wrong
    score = max(0.0, min(max_score, raw))
    confidence = 0.5 + 0.5 * (score / max_score if max_score > 0 else 0.0)
    return (round(score, 2), round(confidence, 3))


# ── Matching scoring ─────────────────────────────────────────────────────

def _score_match(
    question: dict,
    student_pairs: List[List[int]],
    max_score: float,
) -> tuple[float, float]:
    """
    Matching scoring — exact-pair credit.
      score = (matched / |correct_pairs|) × max_score
              − penalty_per_item × wrong_pairs
      floored at 0, capped at max_score.
    """
    correct_raw = question.get("match_pairs") or []
    correct = {(int(p[0]), int(p[1])) for p in correct_raw if len(p) >= 2}
    student_set = {(int(p[0]), int(p[1])) for p in (student_pairs or []) if len(p) >= 2}
    if not correct:
        return (0.0, 0.5)
    matched = len(student_set & correct)
    wrong = len(student_set - correct)
    penalty = float(question.get("penalty_per_item") or 0.0)
    raw = (matched / len(correct)) * max_score - penalty * wrong
    score = max(0.0, min(max_score, raw))
    confidence = 0.5 + 0.5 * (score / max_score if max_score > 0 else 0.0)
    return (round(score, 2), round(confidence, 3))


# ── Main evaluator ───────────────────────────────────────────────────────

def evaluate_student(
    student_sheet: dict,
    mc_answer_key: Optional[List[str]] = None,
    open_questions: Optional[List[dict]] = None,
    fill_questions: Optional[List[dict]] = None,
    mc_questions: Optional[List[dict]] = None,
    ms_questions: Optional[List[dict]] = None,
    match_questions: Optional[List[dict]] = None,
) -> dict:
    """
    Evaluate a single student sheet and return a result dict.
    Now emits full rendering-ready content for the scan viewer.

    Parameters:
      mc_questions: list of dicts like {"text": "...", "options": {"A": "..."}, "correct_answer": "B"}
                     one per MC question, matches length of student's mc_answers.
      fill_questions: list of {"fill_template": "...", "fill_answers": [...], "points": ..., "text": "..."}
      open_questions: list of {"rubric": "...", "points": ..., "text": "..."}
    """
    rng = random.Random(hash(student_sheet["student_id"]) % (2**32))
    handwriting_seed = student_sheet.get("handwriting_seed") or (hash(student_sheet["student_id"]) % (2**32))

    # ── MC scoring ─────────────────────────────────────────────────────
    mc_answers_raw = student_sheet.get("mc_answers", [])
    key = mc_answer_key or _DEFAULT_MC_KEY
    num_mc = len(key) if mc_answer_key else min(len(mc_answers_raw), len(_DEFAULT_MC_KEY))
    mc_answers = mc_answers_raw[:num_mc]
    mc_details: List[dict] = []
    mc_score_sum = 0.0
    mc_total = 0.0

    for i, (student_ans, correct_ans) in enumerate(zip(mc_answers, key)):
        is_correct = student_ans == correct_ans

        # Question content (includes per-question points from the answer key)
        q_meta = mc_questions[i] if mc_questions and i < len(mc_questions) else {}
        per_q_max = float(q_meta.get("points", 1.0))
        mc_total += per_q_max
        if is_correct:
            mc_score_sum += per_q_max
        q_text = q_meta.get("text") or f"Çoktan seçmeli soru {i + 1}"
        q_options = q_meta.get("options") or {"A": "Seçenek A", "B": "Seçenek B", "C": "Seçenek C", "D": "Seçenek D"}
        option_letters = list(q_options.keys()) or ["A", "B", "C", "D"]

        bubble_fills = _bubble_fills(student_ans, rng, option_letters)
        selected_darkness = bubble_fills.get(student_ans, 0.0)
        bubble_confidence = round(min(0.99, selected_darkness + rng.uniform(0.0, 0.05)), 3)
        needs_review = bubble_confidence < 0.82 or selected_darkness < 0.70

        mc_details.append({
            "question_number": i + 1,
            "question_type": "mc",
            "label": f"Q{i + 1}",
            "student_answer": student_ans,
            "correct_answer": correct_ans,
            "is_correct": is_correct,
            "score": per_q_max if is_correct else 0.0,
            "max_score": per_q_max,
            "feedback": None,
            "confidence": bubble_confidence,
            "ocr_confidence": round(rng.uniform(0.88, 0.98), 3),
            "segmentation_confidence": _segmentation_confidence(student_sheet["student_id"], i + 1),
            "bbox": None,  # set by _flow_bbox below
            "bubble_fills": bubble_fills,
            "ai_reasoning": None,
            "model_used": None,
            "rubric_breakdown": None,
            "override_applied": False,
            "needs_review": needs_review,
            # Rendering content
            "question_text": q_text,
            "option_texts": q_options,
            "handwriting_seed": handwriting_seed,
            "image_url": q_meta.get("image_url"),
            "space_size": q_meta.get("space_size", 0) or 0,
        })

    mc_score = round(mc_score_sum, 2)

    # ── Fill scoring ───────────────────────────────────────────────────
    fill_sheets = student_sheet.get("fill_answers") or []
    fill_details: List[dict] = []
    fill_total = 0.0
    fill_score_sum = 0.0

    if fill_questions:
        for i, fq in enumerate(fill_questions):
            per_q_max = float(fq.get("points", 4.0))
            fill_total += per_q_max
            template = fq.get("fill_template") or ""
            correct_list = fq.get("fill_answers") or []

            student_blanks = fill_sheets[i] if i < len(fill_sheets) else {}
            # Backfill for any missing blanks
            for j, c in enumerate(correct_list, start=1):
                student_blanks.setdefault(str(j), "")

            score, confidence = _score_fill(student_blanks, correct_list, per_q_max)
            fill_score_sum += score
            ocr_conf = round(rng.uniform(0.62, 0.88), 3)
            needs_review = confidence < 0.70 or ocr_conf < 0.75

            correct_blanks = {str(j): correct_list[j - 1] for j in range(1, len(correct_list) + 1)}

            fill_details.append({
                "question_number": num_mc + i + 1,
                "question_type": "fill",
                "label": fq.get("text", f"Boşluk doldurma {i + 1}")[:40],
                "student_answer": " | ".join(f"{k}:{v}" for k, v in student_blanks.items()),
                "correct_answer": " | ".join(f"{k}:{v}" for k, v in correct_blanks.items()),
                "is_correct": score >= per_q_max * 0.95,
                "score": score,
                "max_score": per_q_max,
                "feedback": None,
                "confidence": confidence,
                "ocr_confidence": ocr_conf,
                "segmentation_confidence": _segmentation_confidence(student_sheet["student_id"], num_mc + i + 1),
                "bbox": None,  # set by _flow_bbox below
                "bubble_fills": None,
                "ai_reasoning": None,
                "model_used": None,
                "rubric_breakdown": None,
                "override_applied": False,
                "needs_review": needs_review,
                # Rendering content
                "question_text": fq.get("text"),
                "fill_template": template,
                "fill_blanks": student_blanks,
                "correct_blanks": correct_blanks,
                "handwriting_seed": handwriting_seed,
                "image_url": fq.get("image_url"),
                "space_size": fq.get("space_size", 0) or 0,
            })

    # ── Multi-select (ms) scoring ─────────────────────────────────────
    ms_sheets = student_sheet.get("ms_answers") or {}
    # ms_sheets format: {"1": ["A","C"], "2": ["B"]} keyed by question_number within the ms group
    ms_details: List[dict] = []
    ms_total = 0.0
    ms_score_sum = 0.0

    if ms_questions:
        for i, mq in enumerate(ms_questions):
            per_q_max = float(mq.get("points", 1.0))
            ms_total += per_q_max

            # Student picks come from the sheet by 1-based index within this group
            key = str(i + 1)
            student_picks_raw = ms_sheets.get(key) if isinstance(ms_sheets, dict) else None
            if student_picks_raw is None and isinstance(ms_sheets, list):
                student_picks_raw = ms_sheets[i] if i < len(ms_sheets) else []
            student_picks = list(student_picks_raw or [])

            score, confidence = _score_ms(mq, student_picks, per_q_max)
            ms_score_sum += score
            ocr_conf = round(rng.uniform(0.85, 0.97), 3)
            needs_review = confidence < 0.75

            correct_letters = list(mq.get("ms_correct") or [])
            q_text = mq.get("text") or f"Çoklu seçim {i + 1}"
            q_options = mq.get("options") or {"A": "Seçenek A", "B": "Seçenek B", "C": "Seçenek C", "D": "Seçenek D"}

            ms_details.append({
                "question_number": num_mc + len(fill_details) + i + 1,
                "question_type": "ms",
                "label": (q_text or f"Çoklu seçim {i + 1}")[:40],
                "student_answer": ",".join(student_picks),
                "correct_answer": ",".join(correct_letters),
                "is_correct": set(student_picks) == set(correct_letters),
                "score": score,
                "max_score": per_q_max,
                "feedback": None,
                "confidence": confidence,
                "ocr_confidence": ocr_conf,
                "segmentation_confidence": _segmentation_confidence(student_sheet["student_id"], num_mc + len(fill_details) + i + 1),
                "bbox": None,  # set by _flow_bbox below
                "bubble_fills": None,
                "ai_reasoning": None,
                "model_used": None,
                "rubric_breakdown": None,
                "override_applied": False,
                "needs_review": needs_review,
                # Rendering content
                "question_text": q_text,
                "option_texts": q_options,
                "ms_student_answers": student_picks,
                "ms_correct": correct_letters,
                "handwriting_seed": handwriting_seed,
                "image_url": mq.get("image_url"),
                "space_size": mq.get("space_size", 0) or 0,
            })

    # ── Matching scoring ───────────────────────────────────────────────
    match_sheets = student_sheet.get("match_answers") or {}
    match_details: List[dict] = []
    match_total = 0.0
    match_score_sum = 0.0

    if match_questions:
        for i, mq in enumerate(match_questions):
            per_q_max = float(mq.get("points", 1.0))
            match_total += per_q_max

            key = str(i + 1)
            student_pairs_raw = match_sheets.get(key) if isinstance(match_sheets, dict) else None
            if student_pairs_raw is None and isinstance(match_sheets, list):
                student_pairs_raw = match_sheets[i] if i < len(match_sheets) else []
            student_pairs = [list(p) for p in (student_pairs_raw or []) if len(p) >= 2]

            score, confidence = _score_match(mq, student_pairs, per_q_max)
            match_score_sum += score
            ocr_conf = round(rng.uniform(0.80, 0.95), 3)
            needs_review = confidence < 0.75

            left_items = list(mq.get("match_left") or [])
            right_items = list(mq.get("match_right") or [])
            correct_pairs = [list(p) for p in (mq.get("match_pairs") or []) if len(p) >= 2]
            q_text = mq.get("text") or f"Eşleştirme {i + 1}"

            match_details.append({
                "question_number": num_mc + len(fill_details) + len(ms_details) + i + 1,
                "question_type": "match",
                "label": (q_text or f"Eşleştirme {i + 1}")[:40],
                "student_answer": ";".join(f"{a}->{b}" for a, b in student_pairs),
                "correct_answer": ";".join(f"{a}->{b}" for a, b in correct_pairs),
                "is_correct": {tuple(p) for p in student_pairs} == {tuple(p) for p in correct_pairs},
                "score": score,
                "max_score": per_q_max,
                "feedback": None,
                "confidence": confidence,
                "ocr_confidence": ocr_conf,
                "segmentation_confidence": _segmentation_confidence(student_sheet["student_id"], num_mc + len(fill_details) + len(ms_details) + i + 1),
                "bbox": None,  # set by _flow_bbox below
                "bubble_fills": None,
                "ai_reasoning": None,
                "model_used": None,
                "rubric_breakdown": None,
                "override_applied": False,
                "needs_review": needs_review,
                # Rendering content
                "question_text": q_text,
                "match_left": left_items,
                "match_right": right_items,
                "match_pairs": correct_pairs,
                "match_student_pairs": student_pairs,
                "handwriting_seed": handwriting_seed,
                "image_url": mq.get("image_url"),
                "space_size": mq.get("space_size", 0) or 0,
            })

    # ── Open-ended scoring ────────────────────────────────────────────
    open_answers_text = student_sheet.get("open_answers", [])
    open_max_per_q_default = 10.0
    open_total = 0.0
    open_score_sum = 0.0
    open_details: List[dict] = []

    for i, answer_text in enumerate(open_answers_text):
        if open_questions and i < len(open_questions):
            rubric_text = open_questions[i].get("rubric") or None
            per_q_max = float(open_questions[i].get("points", open_max_per_q_default))
            q_label = open_questions[i].get("text") or f"Açık uçlu {i + 1}"
            q_text = open_questions[i].get("text")
        else:
            rubric_text = None
            per_q_max = open_max_per_q_default
            q_label = f"Açık uçlu {i + 1}"
            q_text = None

        score = round(rng.uniform(per_q_max * 0.40, per_q_max * 0.95), 1)
        open_score_sum += score
        open_total += per_q_max

        confidence = round(rng.uniform(0.65, 0.95), 3)
        ocr_conf = round(rng.uniform(0.78, 0.96), 3)
        needs_review = confidence < 0.78 or ocr_conf < 0.82

        open_meta = open_questions[i] if open_questions and i < len(open_questions) else {}
        open_details.append({
            "question_number": num_mc + len(fill_details) + len(ms_details) + len(match_details) + i + 1,
            "question_type": "open",
            "label": q_label[:40] if q_label else f"Açık uçlu {i + 1}",
            "student_answer": answer_text,
            "correct_answer": rubric_text,
            "is_correct": None,
            "score": score,
            "max_score": per_q_max,
            "feedback": rng.choice(_OPEN_FEEDBACKS),
            "confidence": confidence,
            "ocr_confidence": ocr_conf,
            "segmentation_confidence": _segmentation_confidence(student_sheet["student_id"], num_mc + len(fill_details) + len(ms_details) + len(match_details) + i + 1),
            "bbox": None,  # set by _flow_bbox below
            "bubble_fills": None,
            "ai_reasoning": rng.choice(_AI_REASONINGS),
            "model_used": "Claude Sonnet 4.5 (mock)",
            "rubric_breakdown": _rubric_breakdown(score, per_q_max, rng),
            "override_applied": False,
            "needs_review": needs_review,
            # Rendering content
            "question_text": q_text,
            "handwritten_answer": answer_text,
            "handwriting_seed": handwriting_seed,
            "image_url": open_meta.get("image_url"),
            "space_size": open_meta.get("space_size", 0) or 0,
        })

    # ── Flow-layout bboxes ─────────────────────────────────────────────
    # Assign page/y positions in document order so questions of mixed types
    # share pages instead of each type getting its own page.
    all_answers = mc_details + fill_details + ms_details + match_details + open_details
    _flow_bbox(all_answers)

    # ── Aggregate ─────────────────────────────────────────────────────
    # ms folds into the "mc" bucket (both are bubble-style auto-graded).
    # match folds into the "open" bucket (handwritten pairs, partial credit model).
    grand_total = mc_total + fill_total + open_total + ms_total + match_total
    grand_score = mc_score + fill_score_sum + open_score_sum + ms_score_sum + match_score_sum
    total_pct = (grand_score / grand_total * 100) if grand_total > 0 else 0.0
    grade = _letter_grade(total_pct)

    return {
        "student_id": student_sheet["student_id"],
        "student_name": student_sheet["student_name"],
        "mc_score": round(mc_score + ms_score_sum, 2),
        "mc_total": round(mc_total + ms_total, 2),
        "open_score": round(open_score_sum + fill_score_sum + match_score_sum, 2),
        "open_total": round(open_total + fill_total + match_total, 2),
        "total_pct": round(total_pct, 2),
        "grade": grade,
        "answers": mc_details + fill_details + ms_details + match_details + open_details,
    }
