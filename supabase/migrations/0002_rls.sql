-- Row-level security.
--
-- How access works in Gather v1:
--   * The Next.js server is the only thing that talks to the database. It connects with a
--     privileged role (DATABASE_URL) and checks the signed-in user's role and ownership in
--     src/lib/services/* before every read or write. Those checks are covered by tests.
--   * RLS is switched ON for every table with NO policies for the `anon` and `authenticated`
--     roles. On Supabase that means the public REST/GraphQL API cannot read or write anything,
--     even if the anon key leaks. Default deny.
--   * When Supabase Auth replaces Gather's own sessions (see docs/DECISIONS.md), per-user
--     policies such as "owners can update their own listings" are added here.
--
-- The table owner (the server's connection) bypasses RLS, so this file does not change how
-- the app behaves; it closes the side door.

alter table profiles            enable row level security;
alter table sessions            enable row level security;
alter table listings            enable row level security;
alter table listing_facilities  enable row level security;
alter table listing_days        enable row level security;
alter table briefs              enable row level security;
alter table search_events       enable row level security;
alter table matches             enable row level security;
alter table enquiries           enable row level security;
alter table quotes              enable row level security;
alter table messages            enable row level security;
alter table checkouts           enable row level security;
alter table bookings            enable row level security;
alter table email_outbox        enable row level security;
alter table analytics_events    enable row level security;
alter table schema_migrations   enable row level security;
