-- AITA (AI Teacher Assistant) tables
-- Apply in Supabase SQL editor

-- ── RPH Documents ────────────────────────────────────────────────────────────
create table if not exists rph_documents (
    id            uuid primary key default gen_random_uuid(),
    teacher_id    uuid references auth.users(id) on delete cascade not null,
    title         text not null,
    mata_pelajaran text not null,
    tingkatan     text not null,
    tarikh        date,
    masa          text,
    bilangan_murid int,
    tema          text,
    tajuk         text not null,
    standard_kandungan  text[],
    standard_pembelajaran text[],
    objektif      text[],
    nilai_murni   text[],
    elemen_merentas_kurikulum text[],
    bahan_bantu_mengajar text[],
    fasa_induksi_set    jsonb,
    fasa_penyampaian    jsonb,
    fasa_amali          jsonb,
    fasa_penghasilan    jsonb,
    fasa_penutup        jsonb,
    impak         text,
    catatan       text,
    source_files  text[],
    share_token   uuid default gen_random_uuid(),
    status        text default 'draft' check (status in ('draft','complete')),
    created_at    timestamptz default now(),
    updated_at    timestamptz default now()
);

alter table rph_documents enable row level security;

create policy "Teachers manage own RPH"
    on rph_documents for all
    using (teacher_id = auth.uid());

create policy "Public share read"
    on rph_documents for select
    using (share_token is not null);

-- ── AITA Games ───────────────────────────────────────────────────────────────
create table if not exists aita_games (
    id          uuid primary key default gen_random_uuid(),
    teacher_id  uuid references auth.users(id) on delete cascade not null,
    rph_id      uuid references rph_documents(id) on delete set null,
    title       text not null,
    game_type   text not null check (game_type in (
                    'flappy','dino','catch','connector','sentence',
                    'kahoot','wordsearch')),
    config      jsonb not null default '{}',
    share_token uuid default gen_random_uuid(),
    created_at  timestamptz default now()
);

alter table aita_games enable row level security;

create policy "Teachers manage own games"
    on aita_games for all
    using (teacher_id = auth.uid());

create policy "Public game read by token"
    on aita_games for select
    using (share_token is not null);

-- ── Game Assignments ──────────────────────────────────────────────────────────
create table if not exists aita_game_assignments (
    id          uuid primary key default gen_random_uuid(),
    game_id     uuid references aita_games(id) on delete cascade not null,
    classroom_id uuid,
    teacher_id  uuid references auth.users(id) on delete cascade not null,
    due_at      timestamptz,
    created_at  timestamptz default now()
);

alter table aita_game_assignments enable row level security;

create policy "Teachers manage assignments"
    on aita_game_assignments for all
    using (teacher_id = auth.uid());

-- ── Game Scores ───────────────────────────────────────────────────────────────
create table if not exists aita_game_scores (
    id          uuid primary key default gen_random_uuid(),
    game_id     uuid references aita_games(id) on delete cascade not null,
    student_id  uuid,
    player_name text,
    score       int not null default 0,
    completed_at timestamptz default now()
);

alter table aita_game_scores enable row level security;

create policy "Anyone can post scores"
    on aita_game_scores for insert
    with check (true);

create policy "Teachers read scores for their games"
    on aita_game_scores for select
    using (
        game_id in (
            select id from aita_games where teacher_id = auth.uid()
        )
    );

-- ── RPH Teacher Shares ────────────────────────────────────────────────────────
create table if not exists rph_shares (
    id          uuid primary key default gen_random_uuid(),
    rph_id      uuid references rph_documents(id) on delete cascade not null,
    shared_by   uuid references auth.users(id) on delete cascade not null,
    share_token uuid default gen_random_uuid(),
    created_at  timestamptz default now()
);

alter table rph_shares enable row level security;

create policy "Teachers manage shares"
    on rph_shares for all
    using (shared_by = auth.uid());

-- updated_at trigger for rph_documents
create or replace function update_rph_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_rph_updated_at on rph_documents;
create trigger set_rph_updated_at
    before update on rph_documents
    for each row execute function update_rph_updated_at();
