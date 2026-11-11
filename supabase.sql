-- Jalankan di Supabase: SQL Editor -> New query -> Run
create table todos (
  id bigint generated always as identity primary key,
  title text not null,
  priority text not null default 'sedang',
  due_date date,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table todos enable row level security;

-- Tanpa login: siapa saja boleh baca, tambah, ubah, dan hapus
create policy "akses publik" on todos
  for all to anon
  using (true) with check (true);