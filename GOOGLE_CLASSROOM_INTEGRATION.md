# Google Classroom Integration

## What it does

Bidirectional sync between KuasaPrestij and Google Classroom:

| Direction | What moves |
|---|---|
| Google → KuasaPrestij | Student roster imported by email match |
| KuasaPrestij → Google | Mastery scores posted as assignment grades (0–100) |

---

## One-time setup

### 1. Google Cloud Console

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Google Classroom API** (APIs & Services → Library)
3. OAuth consent screen → External → add scopes:
   - `.../auth/classroom.courses.readonly`
   - `.../auth/classroom.rosters.readonly`
   - `.../auth/classroom.coursework.students`
   - `.../auth/classroom.profile.emails`
4. Credentials → **Create OAuth 2.0 Client ID** → Web application
5. Add authorised redirect URI: `https://api.kuasa.tech:8443/google/callback`
6. Copy the Client ID and Client Secret

### 2. Environment variables

Add to `/root/kuasaprestij/.env`:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=https://api.kuasa.tech:8443/google/callback
FRONTEND_URL=https://your-frontend-url/teacher
```

### 3. Supabase SQL migrations

Run in order in **Supabase → SQL Editor**:

1. `schema/student_management.sql` — RLS policies + helper RPCs for manual enrollment
2. `schema/google_classroom.sql` — `google_tokens` and `classroom_google_links` tables

### 4. Restart backend

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## How it works

### OAuth flow

```
Teacher clicks "Connect Google"
  → POST /google/auth_url  (Supabase JWT verified, teacher_id extracted)
  → Google OAuth screen
  → GET /google/callback?code=xxx&state={teacher_id}
  → Tokens stored in google_tokens table (access + refresh)
  → Redirect to FRONTEND_URL?google_connected=1
  → ClassroomsPanel detects param, sets connected=true
```

The refresh token is stored so tokens auto-renew without requiring the teacher to re-auth.

### Roster import flow

```
Teacher: Google button → Link course tab → picks a Google course
  → POST /google/link_course  (saves classroom_id ↔ google_course_id)

Teacher: Import roster tab → "Import roster" button
  → POST /google/import_roster
    1. Fetch students from Google Classroom API (email + name)
    2. List all Supabase auth.users, build email → user_id map
    3. For each Google student:
       - Matched by email → INSERT into classroom_members (upsert, no dupes)
       - No KuasaPrestij account → listed as "unmatched"
  → Returns { enrolled: [...], unmatched: [...] }
```

**Student matching requirement:** students must have signed up to KuasaPrestij using the same email address as their Google account. If they signed up with a different email, they appear as "unmatched" and need to register with the Google email.

### Grade push flow

```
Teacher: Sync grades tab → "Sync mastery scores" button
  → POST /google/push_grades
    1. Load classroom_members
    2. Fetch dskp_mastery scores → average per student → 0–100 %
    3. Match KuasaPrestij user_id → email → Google user_id
    4. GET/CREATE courseWork "KuasaPrestij Progress" (maxPoints=100)
    5. PATCH each studentSubmission with assignedGrade
  → Returns { succeeded: N, failed: N }
```

Grades appear in Google Classroom under an assignment called **"KuasaPrestij Progress"**, visible to students and parents.

---

## Architecture

### New files

| File | Purpose |
|---|---|
| `agents/google_classroom_agent.py` | Google API wrapper — OAuth, roster fetch, grade push |
| `schema/google_classroom.sql` | `google_tokens` + `classroom_google_links` tables with RLS |
| `schema/student_management.sql` | Teacher/admin enrollment RLS + `search_students_by_name` + `admin_update_profile` RPCs |

### New backend endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/google/auth_url` | Supabase JWT | Generate OAuth URL for teacher |
| GET | `/google/callback` | None (from Google) | Exchange code → store tokens → redirect |
| GET | `/google/status` | Supabase JWT | Check if connected |
| GET | `/google/courses` | Supabase JWT | List teacher's Google Classroom courses |
| POST | `/google/import_roster` | Supabase JWT | Import roster → enroll matched students |
| POST | `/google/link_course` | Supabase JWT | Save classroom ↔ Google course link |
| POST | `/google/push_grades` | Supabase JWT | Push mastery scores as grades |
| DELETE | `/google/disconnect` | Supabase JWT | Remove stored tokens |

### New Supabase tables

```sql
google_tokens (user_id PK, access_token, refresh_token, token_expiry, scopes)
classroom_google_links (classroom_id PK, google_course_id, google_course_name, last_synced_at)
```

### New frontend additions

- `ClassroomsPanel.tsx` — Google connection banner, per-classroom "Google" button, `GoogleClassroomDialog` (3-tab: link / import / sync grades)
- `services/api.ts` — `getGoogleAuthUrl`, `listGoogleCourses`, `importGoogleRoster`, `linkGoogleCourse`, `pushGradesToGoogle`, `disconnectGoogle`
- `integrations/supabase/types.ts` — `google_tokens` and `classroom_google_links` table types

### Also added this session (manual student management)

- Teachers: search students by name and add directly to classroom (no invite link needed)
- Teachers: edit student school/grade from roster view
- Teachers: remove students from classroom
- Admin: edit any user's name/school/grade
- Admin: manage classroom members (add/remove) from Classrooms panel

---

## Limitations and future work

- **Token security** — refresh tokens stored as plain text in Supabase. Consider encrypting with `pgcrypto` for production.
- **Student matching** — requires email match. If a student used a different email to register, they won't auto-enroll. Future: let teacher manually map Google student → KuasaPrestij account.
- **Grade granularity** — currently posts the student's *average mastery across all topics*. Could be extended to post per-subject grades as separate assignments.
- **Auto-sync** — grade sync is manual (button press). Could be automated via a nightly cron (Supabase Edge Function or backend scheduled job).
- **Google Workspace for Education** — the OAuth app needs to be verified by Google before it can be used by accounts outside your own Google Workspace org. Submit for verification once the feature is stable.
