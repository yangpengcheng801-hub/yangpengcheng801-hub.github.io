-- 在 Supabase 控制台 → SQL Editor 中执行一次

create table if not exists cet4_sync (
  sync_id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table cet4_sync enable row level security;

create policy "cet4_sync_select" on cet4_sync for select using (true);
create policy "cet4_sync_insert" on cet4_sync for insert with check (true);
create policy "cet4_sync_update" on cet4_sync for update using (true);

-- 说明：sync_id 由同步码生成，请勿使用过于简单的密码。
-- 个人学习数据，anon key 仅用于此表。
