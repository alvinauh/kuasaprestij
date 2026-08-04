# KuasaPrestij — Intelligence Fabric (monorepo)

AI-powered adaptive assessment engine for Malaysian secondary-school students (KSSM curriculum).

This repository is a **fresh-history monorepo** combining the two previously-separate repos:

```
backend/   FastAPI + LangGraph multi-agent pipeline (was: kuasaprestij)
frontend/  React + TanStack Router app (was: learn-play-shine-96)
```

> History note: the backend was rebased to a clean root here — its original git
> history (4.6 GB, with >100 MB syllabus PDFs) is not carried over and is not
> pushable to GitHub. Large data (DSKP PDFs), virtualenvs, `node_modules`, and all
> `.env` secrets are git-ignored; ingest data and fill env files locally.

## Backend — `backend/`

FastAPI service (`app/main.py`) driving a LangGraph agent pipeline. See
`backend/CLAUDE.md` for full architecture, the agent pipeline, Supabase tables, and
endpoints.

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in keys
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Frontend — `frontend/`

Vite dev server (React + TanStack Router). Talks to the backend via
`VITE_API_BASE_URL`.

```bash
cd frontend
npm install
cp .env.example .env   # fill in publishable keys + API base URL
npm run dev
```

## Teacher AI Controller

The teacher dashboard home is a chat interface (`frontend` → AI Controller tab)
backed by `backend/agents/teacher_agent.py` (`POST /teacher/chat`): a planner that
reads live class mastery, generates DSKP-grounded slides/questions, assigns tasks,
and remembers what was assigned.
