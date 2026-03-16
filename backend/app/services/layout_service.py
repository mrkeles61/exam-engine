"""
Mock Layout/Segmentation Service.

Real implementation (by layout team) will use a trained CV model to detect
student answer regions on scanned exam sheets.
This mock returns 5-8 StudentSheet objects per exam.
"""
import random
from typing import List

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


def get_student_sheets(exam_id: str, num_mc: int = 40, num_open: int = 3) -> List[dict]:
    """
    Return 5-8 mock StudentSheet dicts for the given exam.

    Each sheet has:
      - student_id: str (format 2021XXXXXX)
      - student_name: str
      - mc_answers: List[str]  (length = num_mc)
      - open_answers: List[str]  (length = num_open)
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

        mc_answers = [rng.choice(_MC_OPTIONS) for _ in range(num_mc)]
        open_answers = [rng.choice(_OPEN_RESPONSES) for _ in range(num_open)]

        sheets.append({
            "student_id": student_id,
            "student_name": f"{first} {last}",
            "mc_answers": mc_answers,
            "open_answers": open_answers,
            "detection_confidence": round(rng.uniform(0.88, 0.99), 4),
        })

    return sheets
