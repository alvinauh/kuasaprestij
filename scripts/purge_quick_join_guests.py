"""Delete Quick Join guest accounts (created by POST /quick_join) after an event.

Guests are auth users with an @guest.kuasa.tech email. Deleting the auth user
cascades their classroom membership; their live-arena answers and game scores
stay as anonymous history.

    venv/bin/python scripts/purge_quick_join_guests.py                 # dry run: list guests
    venv/bin/python scripts/purge_quick_join_guests.py --older-than-hours 2 --yes
    venv/bin/python scripts/purge_quick_join_guests.py --classroom <invite_code> --yes
"""
import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from supabase import create_client

QUICK_JOIN_EMAIL_DOMAIN = "guest.kuasa.tech"  # keep in sync with app/main.py

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--older-than-hours", type=float, default=0)
    ap.add_argument("--classroom", help="only guests enrolled in the class with this invite code")
    ap.add_argument("--yes", action="store_true", help="actually delete (default is a dry run)")
    args = ap.parse_args()

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    guests, page = [], 1
    while True:
        batch = sb.auth.admin.list_users(page=page, per_page=1000)
        if not batch:
            break
        guests += [u for u in batch if (u.email or "").endswith("@" + QUICK_JOIN_EMAIL_DOMAIN)
                   and (u.user_metadata or {}).get("role") != "teacher"]
        page += 1

    cutoff = datetime.now(timezone.utc) - timedelta(hours=args.older_than_hours)
    guests = [u for u in guests if _as_dt(u.created_at) <= cutoff]

    if args.classroom:
        room = sb.table("classrooms").select("id").eq("invite_code", args.classroom).limit(1).execute().data
        if not room:
            sys.exit(f"No classroom with invite code {args.classroom}")
        members = sb.table("classroom_members").select("student_id").eq("classroom_id", room[0]["id"]).execute().data
        member_ids = {m["student_id"] for m in members}
        guests = [u for u in guests if u.id in member_ids]

    for u in guests:
        name = (u.user_metadata or {}).get("full_name", "?")
        print(f"{'DELETE' if args.yes else 'would delete'}  {u.email}  ({name})  created {u.created_at}")
        if args.yes:
            sb.auth.admin.delete_user(u.id)
    print(f"{len(guests)} guest account(s) {'deleted' if args.yes else 'matched (dry run — add --yes)'}")


def _as_dt(v) -> datetime:
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(v).replace("Z", "+00:00"))


if __name__ == "__main__":
    main()
