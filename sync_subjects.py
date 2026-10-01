import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(override=True)

# Initialize Supabase Client
supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

print("🔄 Scanning syllabus_embeddings for ingested subjects...")
# Select metadata column to extract processed subjects
res = supabase.table("syllabus_embeddings").select("metadata").execute()

if not res.data:
    print("❌ No ingested syllabus data found inside 'syllabus_embeddings'!")
else:
    # Extract unique subjects from your JSONB metadata field
    ingested_subjects = set()
    for row in res.data:
        meta = row.get("metadata", {})
        if meta and "subject" in meta:
            ingested_subjects.add(meta["subject"])
            
    print(f"📚 Detected {len(ingested_subjects)} ingested subjects in vector store: {list(ingested_subjects)}")
    
    # Check what subjects currently exist in the daily report table
    current_report_res = supabase.table("student_daily_report").select("subject").execute()
    existing_subjects = {row["subject"] for row in current_report_res.data} if current_report_res.data else set()
    
    # Insert clean default records for any missing subject
    inserted_count = 0
    for subject in ingested_subjects:
        if subject not in existing_subjects:
            print(f"➕ Registering subject in student_daily_report: {subject}")
            supabase.table("student_daily_report").insert({
                "subject": subject,
                "progress": 0,
                "class_average": 0,
                "topics_mastered": []
            }).execute()
            inserted_count += 1
            
    print(f"\n🎉 Sync complete! Automatically added {inserted_count} new subjects to your teacher insights dashboard.")
