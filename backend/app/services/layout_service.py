"""
Mock Layout/Segmentation Service.

Real implementation (by layout team) will use a trained CV model to detect
student answer regions on scanned exam sheets.

This mock returns per-student sheets with:
  - student_id, student_name, mc_answers, open_answers, fill_answers
  - handwriting_seed (derived from student_id — drives per-student font/color/rotation on the frontend)

For MC and fill answers we inject realistic mistakes / near-correct answers
some percentage of the time so the evaluation looks varied.
"""
import random
from typing import Dict, List, Optional


_FIRST_NAMES = [
    "Ahmet", "Mehmet", "Mustafa", "Ali", "Hüseyin", "İbrahim", "Hasan",
    "Ayşe", "Fatma", "Zeynep", "Emine", "Hatice", "Merve", "Büşra",
    "Emre", "Serkan", "Berkay", "Yusuf", "Ömer", "Berk",
]

_LAST_NAMES = [
    "Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım",
    "Öztürk", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Koç",
    "Kurt", "Özdemir", "Aydın", "Şimşek", "Bulut", "Karaca",
]

_MC_OPTIONS = ["A", "B", "C", "D"]

_OPEN_RESPONSES = [
    "Nesne yönelimli programlama; kalıtım, polimorfizm ve kapsülleme ilkelerine dayanır. "
    "Bu ilkeler sayesinde kodun yeniden kullanılabilirliği artar.",

    "Veri yapıları, bilgilerin bellekte organize biçimde saklanmasını sağlar. "
    "Dizi, bağlı liste, yığın ve kuyruk en temel veri yapılarıdır.",

    "Big-O notasyonu, bir algoritmanın giriş boyutuna göre çalışma süresini ifade eder. "
    "O(1) sabit, O(n) doğrusal, O(n²) ikinci dereceden karmaşıklık anlamına gelir.",

    "Veritabanı normalizasyonu, veri tekrarını azaltmak ve bütünlüğü sağlamak amacıyla "
    "tabloların belirli kurallara göre düzenlenmesi işlemidir.",

    "HTTP durum kodları sunucunun isteğe verdiği yanıtı özetler. "
    "200 başarı, 404 bulunamadı, 500 sunucu hatası anlamına gelir.",

    "Belirtilen konuya ilişkin bilgim yeterli değil, ancak temel kavramlar şunlardır...",
    "Bu soruyu cevaplamak için önce tanımı netleştirmek gerekir.",
]


def _seed_from_student_id(student_id: str) -> int:
    """Deterministic 32-bit seed for a student ID — used by frontend for handwriting style."""
    return hash(student_id) % (2**32)


def _noisy_fill_answer(correct: str, rng: random.Random) -> str:
    """
    Return a mostly-correct answer with occasional mistakes, to simulate real
    handwriting OCR noise + student errors:
      - 60% exact correct
      - 25% small typo
      - 10% plausible wrong word
      - 5% empty (student left blank)
    """
    roll = rng.random()
    if roll < 0.60:
        return correct
    if roll < 0.85:
        # Inject a small typo — swap or drop a letter
        if len(correct) < 3:
            return correct
        i = rng.randint(1, len(correct) - 2)
        if rng.random() < 0.5:
            # swap neighbors
            return correct[:i] + correct[i + 1] + correct[i] + correct[i + 2:]
        else:
            # drop a letter
            return correct[:i] + correct[i + 1:]
    if roll < 0.95:
        # Plausible wrong — return correct minus last syllable-ish
        if len(correct) > 4:
            return correct[:-2]
        return correct
    return ""  # blank


def get_student_sheets(
    exam_id: str,
    num_mc: int = 40,
    num_open: int = 3,
    mc_answer_key: Optional[List[str]] = None,
    fill_answer_key: Optional[List[List[str]]] = None,
    ms_answer_key: Optional[List[List[str]]] = None,
    match_answer_key: Optional[List[List[List[int]]]] = None,
    match_right_lengths: Optional[List[int]] = None,
) -> List[dict]:
    """
    Return 5-8 mock StudentSheet dicts for the given exam.

    Each sheet has:
      - student_id: str (format 2021XXXXXX)
      - student_name: str
      - mc_answers: List[str]       (length = num_mc)
      - open_answers: List[str]     (length = num_open)
      - fill_answers: List[Dict[str,str]]  (per fill question, blanks keyed by index "1","2",...)
      - handwriting_seed: int
      - detection_confidence: float

    When a `mc_answer_key` is provided, we bias the mock so ~60-80% of answers
    are correct (with the rest being realistic mistakes) — makes the demo feel
    less random than pure uniform-random.
    """
    rng = random.Random(hash(exam_id) % (2**32))
    count = rng.randint(5, 8)
    sheets = []

    for _ in range(count):
        first = rng.choice(_FIRST_NAMES)
        last = rng.choice(_LAST_NAMES)
        year = rng.randint(2019, 2023)
        suffix = rng.randint(100000, 999999)
        student_id = f"{year}{suffix}"

        # MC answers — biased toward correct when we have a key
        if mc_answer_key:
            mc_answers: List[str] = []
            for correct in mc_answer_key[:num_mc]:
                if rng.random() < rng.uniform(0.55, 0.85):
                    mc_answers.append(correct)
                else:
                    # pick a wrong option at random
                    wrong = [o for o in _MC_OPTIONS if o != correct]
                    mc_answers.append(rng.choice(wrong))
        else:
            mc_answers = [rng.choice(_MC_OPTIONS) for _ in range(num_mc)]

        open_answers = [rng.choice(_OPEN_RESPONSES) for _ in range(num_open)]

        # Fill answers — per question, per blank, noisy-correct
        fill_sheets: List[dict] = []
        if fill_answer_key:
            for q_blanks in fill_answer_key:
                q_result: dict = {}
                for idx, correct_text in enumerate(q_blanks, start=1):
                    q_result[str(idx)] = _noisy_fill_answer(correct_text, rng)
                fill_sheets.append(q_result)

        # Multi-select answers — deterministically noisy around the correct set.
        # Keyed by 1-based question index within the ms group (e.g. {"1": ["A","C"], ...}).
        # Per-student seed derived from student_id keeps results stable across re-runs.
        ms_sheets: Dict[str, List[str]] = {}
        if ms_answer_key:
            ms_rng = random.Random(_seed_from_student_id(student_id) ^ 0xA5A5)
            for i, correct_letters in enumerate(ms_answer_key, start=1):
                correct_set = list(correct_letters or [])
                # 55% full correct; 30% drop one; 15% add a stray wrong.
                roll = ms_rng.random()
                if not correct_set:
                    ms_sheets[str(i)] = []
                elif roll < 0.55:
                    ms_sheets[str(i)] = list(correct_set)
                elif roll < 0.85 and len(correct_set) > 1:
                    drop = ms_rng.randrange(len(correct_set))
                    ms_sheets[str(i)] = [l for j, l in enumerate(correct_set) if j != drop]
                else:
                    all_letters = ["A", "B", "C", "D", "E"]
                    wrongs = [l for l in all_letters if l not in correct_set]
                    picks = list(correct_set)
                    if wrongs:
                        picks.append(ms_rng.choice(wrongs))
                    ms_sheets[str(i)] = picks

        # Matching answers — deterministically noisy around the correct pairs.
        # Keyed by 1-based question index within the match group:
        # {"1": [[0,2],[1,0],...], ...}
        match_sheets: Dict[str, List[List[int]]] = {}
        if match_answer_key:
            match_rng = random.Random(_seed_from_student_id(student_id) ^ 0x5A5A)
            for i, correct_pairs in enumerate(match_answer_key, start=1):
                pairs = [[int(a), int(b)] for a, b in (correct_pairs or []) if len((a, b)) == 2]
                roll = match_rng.random()
                if not pairs:
                    match_sheets[str(i)] = []
                elif roll < 0.55:
                    match_sheets[str(i)] = [list(p) for p in pairs]
                elif roll < 0.85 and len(pairs) >= 2:
                    # Swap the right-sides of two pairs (common student mistake)
                    a_idx, b_idx = match_rng.sample(range(len(pairs)), 2)
                    swapped = [list(p) for p in pairs]
                    swapped[a_idx][1], swapped[b_idx][1] = swapped[b_idx][1], swapped[a_idx][1]
                    match_sheets[str(i)] = swapped
                else:
                    # Drop one pair entirely
                    drop = match_rng.randrange(len(pairs))
                    match_sheets[str(i)] = [list(p) for j, p in enumerate(pairs) if j != drop]

        sheets.append({
            "student_id": student_id,
            "student_name": f"{first} {last}",
            "mc_answers": mc_answers,
            "open_answers": open_answers,
            "fill_answers": fill_sheets,
            "ms_answers": ms_sheets,
            "match_answers": match_sheets,
            "handwriting_seed": _seed_from_student_id(student_id),
            "detection_confidence": round(rng.uniform(0.88, 0.99), 4),
        })

    return sheets
