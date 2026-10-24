-- AI Controller personalization (tier 1 + 2).
-- teacher_profile: what the controller knows about each teacher — explicit settings plus
--   durable facts learned from chat ("remember I teach 4 Sains Tulen").
-- teacher_materials / teacher_material_chunks: the teacher's uploaded notes, chunked and
--   embedded (768-dim, same local model as syllabus_embeddings) so the controller can
--   ground replies and quizzes in them. Private per teacher: the backend uses the service
--   key and always filters by teacher_id; RLS is on with no policies so the anon/auth
--   keys can't read another teacher's material directly.

create table if not exists public.teacher_profile (
  teacher_id uuid primary key references public.profiles(id) on delete cascade,
  subjects text[] not null default '{}',
  form_levels int[] not null default '{}',
  preferred_language text,
  teaching_style text,
  facts jsonb not null default '[]'::jsonb,   -- [{fact, source: chat|explicit, created_at}]
  last_learned_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_materials (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  filename text not null,
  subject text,
  topic_hint text,
  chunk_count int not null default 0,
  char_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_teacher_materials_teacher
  on public.teacher_materials (teacher_id, created_at desc);

create table if not exists public.teacher_material_chunks (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.teacher_materials(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(768) not null
);
create index if not exists idx_teacher_material_chunks_teacher
  on public.teacher_material_chunks (teacher_id);

alter table public.teacher_profile enable row level security;
alter table public.teacher_materials enable row level security;
alter table public.teacher_material_chunks enable row level security;

-- Per-teacher similarity search. Exact scan within one teacher's chunks (a few hundred
-- rows at most), so no ANN index is needed.
create or replace function public.match_teacher_materials(
  p_teacher_id uuid,
  query_embedding vector(768),
  match_count int default 3
) returns table (material_id uuid, filename text, content text, similarity float)
language sql stable as $$
  select c.material_id, m.filename, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.teacher_material_chunks c
  join public.teacher_materials m on m.id = c.material_id
  where c.teacher_id = p_teacher_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_teacher_materials(uuid, vector, int) from anon, authenticated;

notify pgrst, 'reload schema';
