import os
from datasets import load_dataset
from supabase import create_client
from dotenv import load_dotenv
from agents.llm_client import embed_text

load_dotenv(override=True)

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))


def run_hf_ingest():
    print("--- Downloading Dataset from HuggingFace ---")

    dataset = load_dataset("haizad/malaysia-textbook", split="train")
    print(f"Found {len(dataset)} textbook chunks. Beginning bulk ingestion...")

    success, skipped = 0, 0
    for i, item in enumerate(dataset):
        content = item.get('content', '').replace('\x00', '').replace('', '').strip()
        book_title = item.get('book', 'Unknown Textbook')

        if len(content) < 50:
            skipped += 1
            continue

        print(f"[{i+1}/{len(dataset)}] Vectorizing: {book_title[:40]}...")

        try:
            embedding = embed_text(content[:5000])

            supabase.table("syllabus_embeddings").upsert({
                "content": content,
                "metadata": {
                    "curriculum": "KSSM",
                    "subject": book_title,
                    "topic": "Core Material"
                },
                "embedding": embedding
            }).execute()

            success += 1

        except Exception as e:
            print(f"  Error on item {i+1} ({book_title[:30]}): {e}")

    print(f"\nBulk Ingestion Complete! {success} uploaded, {skipped} skipped (too short).")


if __name__ == "__main__":
    run_hf_ingest()
