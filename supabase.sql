-- The Night Shift — run this once in Supabase (SQL Editor → New query → paste → Run)

create table if not exists entries (
  person     text        not null,   -- 'connor', 'jack', ...
  date       date        not null,   -- the morning you woke up
  score      int         not null,   -- Garmin sleep score, 0–100
  minutes    int,                    -- total sleep in minutes (nullable)
  updated_at timestamptz not null default now(),
  primary key (person, date)         -- one row per person per night; re-logging overwrites
);

-- Row Level Security is ON. The policies below are intentionally open:
-- anyone holding the public anon key can read and write. That's fine for a
-- 7-person group. If you want a lock, see the "Optional passphrase" note in the README.
alter table entries enable row level security;

create policy "anyone can read"   on entries for select using (true);
create policy "anyone can insert" on entries for insert with check (true);
create policy "anyone can update" on entries for update using (true) with check (true);

-- Let the browser receive live updates when someone else logs a night.
alter publication supabase_realtime add table entries;
