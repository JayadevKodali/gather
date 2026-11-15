-- Account security: email verification, sign-in cooldown, and single-use tokens for reset and verification.

-- Accounts made before verification existed (including the seeded reviewer accounts) count as verified.
alter table profiles add column if not exists email_verified_at timestamptz;
update profiles set email_verified_at = created_at where email_verified_at is null;

-- Failed sign-ins per email address (whether or not an account exists), shared by every server instance.
create table if not exists login_attempts (
  email          text primary key,
  failures       integer not null default 0,
  window_start   timestamptz not null default now(),
  locked_until   timestamptz,
  updated_at     timestamptz not null default now()
);
alter table login_attempts enable row level security;

-- Password-reset and email-verification links. Only a SHA-256 hash of each token is stored.
create table if not exists auth_tokens (
  token_hash   text primary key,
  profile_id   uuid not null references profiles(id) on delete cascade,
  purpose      text not null check (purpose in ('reset', 'verify')),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists auth_tokens_profile on auth_tokens(profile_id, purpose, created_at desc);
alter table auth_tokens enable row level security;
