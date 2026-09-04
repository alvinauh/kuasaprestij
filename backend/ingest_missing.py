"""One-shot ingest for the 26 PDFs never started + 1 incomplete from the previous run."""
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from ingest import ingest_dskp_locally, ingest_textbook_locally

MISSING = [
    # filename, subject, form_level, is_dskp
    ("02 DSKP KSSM Tingkatan 1 Matematik.pdf",                              "Mathematics",              1, True),
    ("042_DSKP_KSSM_B_Inggeris_Ting3.pdf",                                  "Bahasa Inggeris",          3, True),
    ("058 DSKP KSSM Tingkatan 2 Matematik v2 2_021117_Cover.pdf",           "Mathematics",              2, True),
    ("059 DSKP KSSM Tingkatan 2 Sains v2 10 Nov.pdf",                       "Science",                  2, True),
    ("06 DSKP KSSM Tingkatan 1 Pendidikan Moral.pdf",                       "Pendidikan Moral",         1, True),
    ("062 DSKP KSSM Tingkatan 2 Pendidikan Moral v2.pdf",                   "Pendidikan Moral",         2, True),
    ("063_DSKP_KSSM_Geografi_Ting4_5.pdf",                                  "Geografi",                 4, True),
    ("066_DSKP_KSSM_KESUSASTERAAN CINA TING 4_5.pdf",                       "Kesusasteraan Cina",       4, True),
    ("10 DSKP KSSM Science Form 2.pdf",                                     "Science",                  2, True),
    ("3. 011 DSKP KSSM PENDIDIKAN SENI VISUAL TINGKATAN 3.pdf",             "Pendidikan Seni Visual",   3, True),
    ("9 DSKP KSSM Mathematics Form 2.pdf",                                  "Mathematics",              2, True),
    ("DSKP KSSM Pendidikan Jasmani dan Pendidikan Kesihatan Tingkatan 3.pdf","PJK",                     3, True),
    ("DSKP KSSM Reka Bentuk dan Teknologi Tingkatan 3.pdf",                 "RBT",                      3, True),  # incomplete
    ("PENDIDIKAN MUZIK TING 2.pdf",                                         "Pendidikan Muzik",         2, True),
    ("T1 BT GEO - GEOGRAFI.pdf",                                            "Geografi",                 1, False),
    ("T1 BT RBT- REKA BENTUK DAN TEKNOLOGI_TINGKATAN 1.pdf",               "RBT",                      1, False),
    ("T1 T2 BT BI PULSE 2 STUDENT'S BOOK-1.pdf",                           "Bahasa Inggeris",          1, False),
    ("T2 BT GEO - GEOGRAFI.pdf",                                            "Geografi",                 2, False),
    ("T2 BT MAT - MATEMATIK.pdf",                                           "Mathematics",              2, False),
    ("T4 BT KIM DLP - CHEMISTRY.pdf",                                       "Chemistry",                4, False),
    ("T4 BT PSV - PENDIDIKAN SENI VISUAL.pdf",                             "Pendidikan Seni Visual",   4, False),
    ("T4-T5 BT BCK-BAHASA CINA KOMUNIKASI.pdf",                            "Bahasa Cina",              4, False),
    ("T5 BT BIO DLP - BIOLOGY.pdf",                                         "Biology",                  5, False),
    ("T5 BT SN DLP - SCIENCE.pdf",                                          "Science",                  5, False),
    ("TING.2-PENDIDIKAN JASMANI DAN PENDIDIKAN KESIHATAN TINGKATAN 2 KSSM INDEKS 1-1.pdf", "PJK", 2, True),
    ("TING.3-PENDIDIKAN JASMANI DAN PENDIDIKAN KESIHATAN TINGKATAN 3 KSSM INDEKS 1.pdf",   "PJK", 3, True),
    ("TING.4-PENDIDIKAN JASMANI DAN PENDIDIKAN KESIHATAN TINGKATAN 4 KSSM INDEKS 1.pdf",   "PJK", 4, True),
]

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

if __name__ == "__main__":
    total = len(MISSING)
    for i, (filename, subject, form_level, is_dskp) in enumerate(MISSING, 1):
        full_path = os.path.join(DATA_DIR, filename)
        print(f"\n[{i}/{total}] {'DSKP' if is_dskp else 'Textbook'}: {filename}")
        if not os.path.exists(full_path):
            print(f"  ⚠️  File not found, skipping.")
            continue
        if is_dskp:
            ingest_dskp_locally(full_path, subject, form_level)
        else:
            ingest_textbook_locally(full_path, subject, form_level)

    print("\n✅ Missing-file ingest complete.")
