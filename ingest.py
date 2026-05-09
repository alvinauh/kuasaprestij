import json
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from google import genai
from google.genai import types

load_dotenv()

# Initialize clients
supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def ingest_data():
    print("Loading Golden Dataset...")
    # Make sure sample_syllabus.json is in the 'data' folder
    with open("data/sample_syllabus.json", "r") as f:
        syllabus_data = json.load(f)

    for item in syllabus_data:
        print(f"Vectorizing: {item['curriculum']} - {item['topic']}...")
        
        # New 2026 SDK Syntax
        result = client.models.embed_content(
            model="gemini-embedding-2-preview",
            contents=item['content'],
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=768 # Matches your Supabase column
            )
        )
        
        # In the new SDK, results are objects, not dicts
        embedding = result.embeddings[0].values

        supabase.table("syllabus_embeddings").insert({
            "content": item["content"],
            "metadata": {
                "curriculum": item["curriculum"], 
                "subject": item["subject"], 
                "topic": item["topic"]
            },
            "embedding": embedding
        }).execute()

    print("\n✅ Ingestion Complete! The Engine now has memories.")

if __name__ == "__main__":
    ingest_data()