import os
import fitz  # PyMuPDF
import time
from supabase import create_client
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load your environment variables
load_dotenv(override=True)

# Re-initialize clients locally so it doesn't depend on main.py
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Define the folder path
DATA_FOLDER = r"D:\kuasaprestij\data"

# List of the files that failed earlier
failed_files = [
    "DSKP KSSM Pendidikan Muzik Tingkatan 3.pdf",
    "DSKP KSSM Pendidikan Muzik Tingkatan 4 dan 5.pdf",
    "DSKP KSSM Physics Form 4 and 5_Versi English.pdf",
    "DSKP KSSM Reka Bentuk dan Teknologi Tingkatan 1.pdf",
    "DSKP KSSM Reka Bentuk dan Teknologi Tingkatan 2.pdf",
    "DSKP KSSM Reka Bentuk dan Teknologi Tingkatan 3.pdf",
    "DSKP KSSM Science Form 3 v2.pdf",
    "DSKP KSSM Science Form 4 and 5_Versi English.pdf",
    "DSKP Mathematics Form 1.pdf",
    "DSKP Science Form 1.pdf",
    "DSKP_BCK_F2_Sep18.pdf"
]

def process_failed():
    for filename in failed_files:
        full_path = os.path.join(DATA_FOLDER, filename)
        
        if not os.path.exists(full_path):
            print(f"⚠️ Skipping (Not Found): {filename}")
            continue
            
        print(f"🚀 Processing: {filename}")
        
        # Using the same logic as ingest_textbook_locally
        doc = fitz.open(full_path)
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text("text")
            if len(text.strip()) < 100: continue
            
            enriched_text = f"Subject: {filename} | Page {page_num + 1}\n\n{text}"
            
            # --- SMART RATE LIMIT HANDLING BLOCK ---
            try:
                res = gemini_client.models.embed_content(
                    model="gemini-embedding-2-preview",
                    contents=enriched_text,
                    config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT", output_dimensionality=768)
                )
                vector = res.embeddings[0].values
                
                supabase.table("syllabus_embeddings").insert({
                    "content": enriched_text,
                    "metadata": {"source": "manual_recovery", "filename": filename},
                    "embedding": vector
                }).execute()
                
                # Base sleep increased to 2 seconds to prevent rapid API exhaustion
                time.sleep(2.0) 
                print(f"  -> Uploaded page {page_num + 1}")
                
            except Exception as e:
                # If we hit the 429 Rate Limit error, take a long break
                if "429" in str(e):
                    print(f"⚠️ Rate limit hit on page {page_num + 1}! Sleeping for 30 seconds to let the API cool down...")
                    time.sleep(30)
                else:
                    # For any other errors (like a network blip), pause briefly and move on
                    print(f"⚠️ Error on page {page_num + 1}: {e}")
                    time.sleep(2)

if __name__ == "__main__":
    process_failed()
    print("✅ All failed files have been processed and uploaded!")