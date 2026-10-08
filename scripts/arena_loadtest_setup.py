"""Create / tear down a throwaway teacher + classroom for scripts/arena_loadtest.mjs.

    venv/bin/python scripts/arena_loadtest_setup.py setup <cfg.json>
    venv/bin/python scripts/arena_loadtest_setup.py teardown <cfg.json>

Teardown deletes every live round, answer, game score, key, PIN, member and
guest account tied to the test classroom, then the classroom and the teacher.
"""
import json
import os
import secrets
import sys

from dotenv import load_dotenv
from supabase import create_client

QUICK_JOIN_EMAIL_DOMAIN = "guest.kuasa.tech"  # keep in sync with app/main.py

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def setup(path: str) -> None:
    tag = secrets.token_hex(3)
    email = f"zz-loadtest-teacher-{tag}@example.test"
    password = secrets.token_urlsafe(18)
    user = sb.auth.admin.create_user({
        "email": email, "password": password, "email_confirm": True,
        "user_metadata": {"full_name": "ZZ Load Test Teacher", "role": "teacher"},
    }).user
    invite = "ZZLT" + "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(4))
    room = sb.table("classrooms").insert({
        "name": "ZZ Load Test", "subject": "Mathematics",
        "invite_code": invite, "teacher_id": user.id,
    }).execute().data[0]
    cfg = {"teacher_id": user.id, "teacher_email": email, "teacher_password": password,
           "classroom_id": room["id"], "invite_code": invite}
    with open(path, "w") as f:
        json.dump(cfg, f)
    print(f"teacher {email} / classroom {room['id']} / code {invite}")


def teardown(path: str) -> None:
    with open(path) as f:
        cfg = json.load(f)
    cid = cfg["classroom_id"]
    sids = [r["id"] for r in sb.table("classroom_live_sessions").select("id").eq("classroom_id", cid).execute().data]
    if sids:
        for t in ("classroom_game_scores", "classroom_live_answers", "classroom_live_keys"):
            sb.table(t).delete().in_("live_session_id", sids).execute()
        sb.table("classroom_live_sessions").delete().in_("id", sids).execute()
    sb.table("arena_pins").delete().eq("classroom_id", cid).execute()

    member_ids = [m["student_id"] for m in
                  sb.table("classroom_members").select("student_id").eq("classroom_id", cid).execute().data]
    deleted = 0
    for uid in member_ids:
        u = sb.auth.admin.get_user_by_id(uid).user
        if u and (u.email or "").endswith("@" + QUICK_JOIN_EMAIL_DOMAIN):
            sb.auth.admin.delete_user(uid)
            deleted += 1
    sb.table("classroom_members").delete().eq("classroom_id", cid).execute()
    sb.table("classrooms").delete().eq("id", cid).execute()
    sb.auth.admin.delete_user(cfg["teacher_id"])
    print(f"removed {len(sids)} rounds, {deleted} guest accounts, classroom and teacher")


if __name__ == "__main__":
    {"setup": setup, "teardown": teardown}[sys.argv[1]](sys.argv[2])
