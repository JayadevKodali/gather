-- Gather v1 schema. Runs unchanged on Supabase Postgres and on PGlite (demo mode).
-- Money is whole pence (integers). Statuses and layouts are fixed choices (CHECK constraints).
-- A NULL means "unknown / not confirmed".

create table if not exists profiles (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  full_name     text not null,
  role          text not null check (role in ('planner', 'owner', 'admin')),
  password_hash text,                       -- Gather's own auth (scrypt). See docs/DECISIONS.md.
  is_synthetic  boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists sessions (
  token_hash  text primary key,             -- SHA-256 of the cookie token; the raw token is never stored
  profile_id  uuid not null references profiles(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create table if not exists listings (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,  -- stable fixture ID, e.g. v01-loom-room
  owner_id           uuid not null references profiles(id),
  name               text not null,
  description        text not null default '',
  borough            text not null,
  neighbourhood      text not null default '',
  venue_type         text not null,
  suits              text[] not null default '{}', -- event types the venue suits best
  capacity_standing  integer check (capacity_standing > 0),
  capacity_seated    integer check (capacity_seated > 0),
  capacity_mixed     integer check (capacity_mixed > 0),
  pricing_model      text not null check (pricing_model in ('hire_fee', 'min_spend', 'per_head')),
  price_pence        integer not null check (price_pence > 0),
  access_notes       text not null default '',
  is_published       boolean not null default false,
  is_synthetic       boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists listings_owner_idx on listings(owner_id);

-- One row per facility per listing: Available / Unavailable / Not confirmed,
-- plus how an optional extra is charged.
create table if not exists listing_facilities (
  listing_id   uuid not null references listings(id) on delete cascade,
  code         text not null,
  state        text not null check (state in ('yes', 'no', 'unknown')),
  charge       text not null default 'included' check (charge in ('included', 'priced', 'to_confirm')),
  price_pence  integer check (price_pence >= 0),
  note         text not null default '',
  primary key (listing_id, code),
  check (charge <> 'priced' or price_pence is not null)
);

-- Day-level availability. No row = not confirmed = not bookable.
create table if not exists listing_days (
  listing_id  uuid not null references listings(id) on delete cascade,
  day         date not null,
  state       text not null check (state in ('open', 'blocked')),
  primary key (listing_id, day)
);

create table if not exists briefs (
  id               uuid primary key default gen_random_uuid(),
  planner_id       uuid not null references profiles(id),
  raw_text         text not null,
  extractor        text not null,           -- 'rules' or 'llm'
  ai_fields        jsonb,                   -- what the extractor proposed (kept separately)
  confirmed        jsonb,                   -- what the planner confirmed (validated server-side)
  answers          jsonb not null default '[]',  -- follow-up questions and answers
  status           text not null default 'needs_info' check (status in ('needs_info', 'ready', 'searched')),
  first_matched_at timestamptz,             -- set once, the first time an eligible shortlist exists
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists briefs_planner_idx on briefs(planner_id);

create table if not exists search_events (
  id            uuid primary key default gen_random_uuid(),
  brief_id      uuid not null references briefs(id) on delete cascade,
  result_count  integer not null,
  created_at    timestamptz not null default now()
);

-- Snapshot of the latest shortlist shown for a brief.
create table if not exists matches (
  brief_id    uuid not null references briefs(id) on delete cascade,
  listing_id  uuid not null references listings(id),
  rank        integer not null,
  score       integer not null,
  estimate_pence integer,
  reasons     jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (brief_id, listing_id)
);

create table if not exists enquiries (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,    -- e.g. ENQ-7K3D
  brief_id         uuid not null references briefs(id),
  planner_id       uuid not null references profiles(id),
  listing_id       uuid not null references listings(id),
  event_date       date not null,
  guests           integer not null check (guests > 0),
  layout           text not null check (layout in ('standing', 'seated', 'mixed')),
  brief_snapshot   jsonb not null,
  selected_extras  jsonb not null default '[]',
  status           text not null default 'awaiting_venue' check (status in
                     ('awaiting_venue', 'info_requested', 'quoted', 'declined_by_venue', 'declined_by_planner', 'booked')),
  first_reply_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists enquiries_planner_idx on enquiries(planner_id);
create index if not exists enquiries_listing_idx on enquiries(listing_id);

create table if not exists quotes (
  id             uuid primary key default gen_random_uuid(),
  enquiry_id     uuid not null references enquiries(id) on delete cascade,
  reference      text not null unique,      -- e.g. Q-7K3D-2 (enquiry code + version)
  version        integer not null check (version > 0),
  lines          jsonb not null,            -- [{label, amount_pence}] stored as sent, never edited
  total_pence    integer not null check (total_pence > 0),
  deposit_pence  integer not null,
  status         text not null default 'active' check (status in ('active', 'superseded', 'declined', 'paid')),
  sent_at        timestamptz not null default now(),
  unique (enquiry_id, version),
  check (deposit_pence > 0 and deposit_pence <= total_pence)
);
-- Only one payable quote per enquiry at a time.
create unique index if not exists quotes_one_active on quotes(enquiry_id) where status = 'active';

create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  enquiry_id  uuid not null references enquiries(id) on delete cascade,
  author_id   uuid not null references profiles(id),
  body        text not null check (length(body) between 1 and 4000),
  quote_id    uuid references quotes(id),   -- which quote version this message discusses, if any
  created_at  timestamptz not null default now()
);

-- A checkout is a payment attempt. A pending checkout is a hold on the listing-day.
create table if not exists checkouts (
  id                   uuid primary key default gen_random_uuid(),
  quote_id             uuid not null references quotes(id),
  enquiry_id           uuid not null references enquiries(id),
  listing_id           uuid not null references listings(id),
  event_date           date not null,
  provider             text not null check (provider in ('demo', 'stripe')),
  provider_session_id  text unique,
  amount_pence         integer not null check (amount_pence > 0),
  currency             text not null default 'GBP' check (currency = 'GBP'),
  status               text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  failure_reason       text,
  expires_at           timestamptz not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- At most one active hold per listing per day.
create unique index if not exists checkouts_one_hold_per_day on checkouts(listing_id, event_date) where status = 'pending';

create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique,      -- e.g. BK-7K3D
  enquiry_id     uuid not null unique references enquiries(id),
  quote_id       uuid not null unique references quotes(id),
  checkout_id    uuid not null unique references checkouts(id),
  listing_id     uuid not null references listings(id),
  planner_id     uuid not null references profiles(id),
  event_date     date not null,
  total_pence    integer not null,
  deposit_pence  integer not null,
  confirmed_at   timestamptz not null default now(),
  unique (listing_id, event_date)           -- never two bookings for one listing-day
);

create table if not exists email_outbox (
  id          uuid primary key default gen_random_uuid(),
  to_email    text not null,
  to_role     text not null,
  template    text not null,
  subject     text not null,
  link        text not null,
  provider    text not null,                -- 'outbox' (demo, not sent) or 'resend'
  status      text not null check (status in ('logged', 'sent', 'failed')),
  error       text,
  created_at  timestamptz not null default now()
);

-- Product analytics. Never stores message bodies or brief text.
create table if not exists analytics_events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  profile_id  uuid references profiles(id) on delete set null,
  props       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists analytics_events_name_idx on analytics_events(name, created_at);

create table if not exists schema_migrations (
  name        text primary key,
  applied_at  timestamptz not null default now()
);
