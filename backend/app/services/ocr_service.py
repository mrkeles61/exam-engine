"""
Mock OCR Service.

Real implementation (by OCR team) will call Tesseract or a cloud OCR API.
This mock returns realistic-looking PageResult dicts for any PDF path.
"""
import random
from typing import List


_LOREM_FRAGMENTS = [
    "Sınav kağıdı sayfası - öğrenci cevapları aşağıda yer almaktadır.",
    "Çoktan seçmeli bölüm: Her soru için yalnızca bir seçenek işaretleyiniz.",
    "Ad Soyad: ________________  Öğrenci No: ________________",
    "1) A  2) C  3) B  4) D  5) A  6) B  7) C  8) D  9) A  10) B",
    "11) C  12) A  13) D  14) B  15) C  16) A  17) D  18) B  19) C  20) A",
    "Açık uçlu bölüm — Yanıtlarınızı aşağıdaki boşluklara yazınız.",
    "Soru 1: Veri yapılarının önemi ve kullanım alanlarını açıklayınız.",
    "Öğrenci yanıtı: Veri yapıları, programlamada verilerin organize edilmesini sağlar...",
    "Soru 2: Nesne yönelimli programlamanın temel kavramlarını sıralayınız.",
    "Soru 3: Algoritma karmaşıklığını Big-O notasyonu ile ifade ediniz.",
]


def run_ocr(pdf_path: str) -> List[dict]:
    """
    Given any PDF path, return a list of PageResult dicts.

    Real OCR team replaces this function with an actual Tesseract / cloud call.
    """
    random.seed(hash(pdf_path) % (2**32))
    num_pages = random.randint(4, 8)

    pages = []
    for page_num in range(1, num_pages + 1):
        # Simulate varying OCR confidence per page
        confidence = round(random.uniform(0.85, 0.98), 4)
        # Combine random lorem fragments into raw_text
        fragments = random.sample(_LOREM_FRAGMENTS, k=random.randint(4, 7))
        raw_text = "\n".join(fragments)

        pages.append({
            "page_number": page_num,
            "raw_text": raw_text,
            "confidence": confidence,
            "engine_used": "tesseract",
            "word_count": len(raw_text.split()),
            "processing_time_ms": random.randint(120, 480),
        })

    return pages
