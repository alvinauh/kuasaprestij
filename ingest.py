import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

import os
import time
import re
import fitz  # PyMuPDF for lightning fast local text extraction
from dotenv import load_dotenv
from supabase import create_client, Client
from agents.llm_client import embed_text

load_dotenv(override=True)

# Initialize Clients
supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

def ingest_dskp_locally(file_path: str, subject: str, form_level: int):
    """Processes DSKP files locally via PyMuPDF, page by page."""
    print(f"\n🖥️  [LOCAL PARSE] Processing DSKP via Local PyMuPDF: {file_path}")

    try:
        doc = fitz.open(file_path)
        print(f"➡️  Document loaded. Total pages: {len(doc)}")
    except Exception as e:
        print(f"❌ Failed to read PDF locally: {e}")
        return

    successful_chunks = 0

    for page_num in range(len(doc)):
        page = doc[page_num]
        text_content = page.get_text("text")

        if len(text_content.strip()) < 100:
            continue

        enriched_text = (
            f"Subject: {subject} Form {form_level} DSKP Curriculum Requirement\n"
            f"Page: {page_num + 1}\n\n"
            f"{text_content.strip()}"
        )

        try:
            vector = embed_text(enriched_text)

            supabase.table("syllabus_embeddings").insert({
                "content": enriched_text,
                "metadata": {
                    "curriculum": "KSSM",
                    "subject": subject,
                    "form": form_level,
                    "page": page_num + 1,
                    "source_type": "dskp_matrix"
                },
                "embedding": vector
            }).execute()

            successful_chunks += 1
            time.sleep(2.0)
            print(f"  -> Uploaded page {page_num + 1}")

        except Exception as e:
            if "429" in str(e):
                print(f"⚠️ Rate limit hit on page {page_num + 1}! Sleeping 30s...")
                time.sleep(30)
            else:
                print(f"⚠️ Error on page {page_num + 1}: {e}")
                time.sleep(2)

    print(f"✅ [COMPLETED] Vectorized DSKP! Uploaded {successful_chunks} pages.")

def ingest_textbook_locally(file_path: str, subject: str, form_level: int):
    """Processes massive textbooks 100% locally on your desktop for free, page by page."""
    print(f"\n🖥️  [LOCAL PARSE] Processing Textbook via Local Silicon: {file_path}")
    print(f"📋 Metadata Mapped -> Subject: {subject} | Form: {form_level}")
    
    try:
        doc = fitz.open(file_path)
        print(f"➡️  Document loaded cleanly. Total volume: {len(doc)} pages.")
    except Exception as e:
        print(f"❌ Failed to read PDF locally: {e}")
        return

    successful_chunks = 0
    
    # Loop page by page through the entire textbook
    for page_num in range(len(doc)):
        page = doc[page_num]
        text_content = page.get_text("text") # Extract pure textual layer
        
        if len(text_content.strip()) < 100: # Skip blank/cover pages
            continue
            
        # Structure payload contextual map for the RAG agent
        enriched_text = f"Subject: {subject} Form {form_level} Textbook | Page {page_num + 1}\n\n{text_content}"
        
        try:
            vector = embed_text(enriched_text)

            supabase.table("syllabus_embeddings").insert({
                "content": enriched_text,
                "metadata": {
                    "curriculum": "KSSM",
                    "subject": subject,
                    "form": form_level,
                    "page": page_num + 1,
                    "source_type": "textbook_prose"
                },
                "embedding": vector
            }).execute()

            successful_chunks += 1
            print(f"  -> Uploaded page {page_num + 1}")

        except Exception as api_err:
            if "429" in str(api_err):
                print(f"⚠️ Rate limit hit on page {page_num + 1}! Sleeping 30s...")
                time.sleep(30)
            else:
                print(f"⚠️ API Error on Page {page_num+1}: {api_err}")
                time.sleep(2)

    print(f"✅ [COMPLETED] Vectorized textbook! Uploaded {successful_chunks} pages to Supabase.")

def master_hybrid_pipeline(folder_path: str):
    print(f"🔍 Initializing Master Hybrid Ingestion Scanner over '{folder_path}'...")
    
    if not os.path.exists(folder_path):
        print(f"❌ Target directory missing.")
        return
        
    all_files = [f for f in os.listdir(folder_path) if f.lower().endswith('.pdf')]
    print(f"📚 Detected {len(all_files)} total syllabus targets.")
    
    for current_file in all_files:
        full_path = os.path.join(folder_path, current_file)
        filename_clean = current_file.lower()
        
        # --- 1. ADVANCED MALAYSIAN SUBJECT MAPPER ---
        subject = "General Elective"
        
        # Unpacks abbreviations cleanly to resolve your "General Elective" sorting issue
        if any(x in filename_clean for x in ["physics", "fizik"]): subject = "Physics"
        elif any(x in filename_clean for x in ["sejarah", "sej"]): subject = "Sejarah"
        elif any(x in filename_clean for x in ["perniagaan", "business"]): subject = "Perniagaan"
        elif any(x in filename_clean for x in ["biology", "biologi", "bio"]): subject = "Biology"
        elif any(x in filename_clean for x in ["matematik", "mathematics", "math", "mt"]): 
            if "tambahan" in filename_clean or "additional" in filename_clean:
                subject = "Additional Mathematics"
            else:
                subject = "Mathematics"
        elif any(x in filename_clean for x in ["sains", "science", "sn"]): 
            if "tambahan" in filename_clean or "additional" in filename_clean:
                subject = "Additional Science"
            else:
                subject = "Science"
        elif any(x in filename_clean for x in ["kimia", "chemistry", "kim"]): subject = "Chemistry"
        elif any(x in filename_clean for x in ["geografi", "geo"]): subject = "Geografi"
        elif any(x in filename_clean for x in ["rbt", "reka bentuk"]): subject = "RBT"
        elif any(x in filename_clean for x in ["ask", "sains komputer"]): subject = "Asas Sains Komputer"
        elif any(x in filename_clean for x in ["pendidikan islam", "pi "]): subject = "Pendidikan Islam"
        elif any(x in filename_clean for x in ["muzik", "pmzk"]): subject = "Pendidikan Muzik"
        elif any(x in filename_clean for x in ["seni visual", "psv"]): subject = "Pendidikan Seni Visual"
        elif any(x in filename_clean for x in ["jasmani", "kesihatan", "pjk"]): subject = "PJK"
        elif "bahasa arab" in filename_clean: subject = "Bahasa Arab"
        elif "bahasa cina" in filename_clean: subject = "Bahasa Cina"
        elif "bahasa iban" in filename_clean: subject = "Bahasa Iban"
        elif any(x in filename_clean for x in ["bahasa melayu", "_bm_", " bm ", "_bm.", " bm.", "melayu"]): subject = "Bahasa Melayu"
        elif "english" in filename_clean: subject = "Bahasa Inggeris"

        # --- 2. ADVANCED FORM LEVEL DETECTOR ---
        form_level = 4
        # Capture variants: T1, T2, T3, Ting.2, Form 4, Tingkatan 5, or solo numbers
        form_match = re.search(r'(?:form|f|tingkatan|ting\.|t)?\s*([1-5])', filename_clean)
        if form_match:
            form_level = int(form_match.group(1))
            
        # --- 3. HYBRID ROUTER LOGIC ---
        # Explicit routing barrier: files containing 'dskp' use cloud resources, others stay local
        if "dskp" in filename_clean:
            ingest_dskp_locally(full_path, subject, form_level)
        else:
            ingest_textbook_locally(full_path, subject, form_level)

    print("\n🎉 ALL CURRENT ASSETS PROCESSED THROUGH THE SYSTEM MESH!")

if __name__ == "__main__":
    # OPTION A IS NOW ACTIVE: This will scan all files in the 'data' folder.
    # Be sure to run `TRUNCATE TABLE syllabus_embeddings;` in Supabase first!
    master_hybrid_pipeline("data")

    # --- OPTION B: TARGET SPECIFIC FILE FOR ISOLATED TESTING (DISABLED) ---
    # specific_target = os.path.join("data", "DSKP KSSM Asas Sains Komputer Tingkatan 1.pdf")
    # ingest_dskp_locally(file_path=specific_target, subject="Asas Sains Komputer", form_level=1)
