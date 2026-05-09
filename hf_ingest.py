import os
from datasets import load_dataset
from google import genai
from google.genai import types
from supabase import create_client
from dotenv import load_dotenv

load_dotenv(override=True)

# 1. Setup Clients
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def run_hf_ingest():
    print("--- Downloading Dataset from HuggingFace ---")
    
    dataset = load_dataset("haizad/malaysia-textbook", split="train")
    print(f"Found {len(dataset)} textbook chunks. Beginning bulk ingestion...")
    
    for item in dataset:
        # SCRUB THE TEXT: Remove Postgres-breaking null bytes
        content = item.get('content', '').replace('\x00', '').replace('\u0000', '')
        book_title = item.get('book', 'Unknown Textbook')
        
        print(f"Vectorizing: {book_title[:40]}...") 

        # Generate Embedding
        res = client.models.embed_content(
            model="gemini-embedding-2-preview",
            contents=content[:5000], 
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=768
            )
        )
        embedding = res.embeddings[0].values

        # Push to Supabase
        supabase.table("syllabus_embeddings").upsert({
            "content": content,
            "metadata": {
                "curriculum": "KSSM",
                "subject": book_title,
                "topic": "Core Material"
            },
            "embedding": embedding
        }).execute()

    print("\n✅ Bulk Ingestion Complete! The Engine is now fully loaded.")

if __name__ == "__main__":
    run_hf_ingest()