-- Balance payments, cancellations and refunds through Gather. Additive: existing rows keep working.

-- Terms agreed on each quote, saved with it (never re-read from the venue later).
alter table quotes add column if not exists balance_due_days integer check (balance_due_days between 0 and 365);
alter table quotes add column if not exists cancellation_cutoff_days integer check (cancellation_cutoff_days between 0 and 365);
alter table quotes add column if not exists cancellation_terms text;

-- A checkout is now either the deposit (creates the booking) or the remaining balance (for a booking).
alter table checkouts add column if not exists kind text not null default 'deposit';
alter table checkouts drop constraint if exists checkouts_kind_check;
alter table checkouts add constraint checkouts_kind_check check (kind in ('deposit', 'balance'));
alter table checkouts add column if not exists booking_id uuid references bookings(id);
alter table checkouts add column if not exists payment_intent_id text;
alter table checkouts add column if not exists paid_at timestamptz;
-- The date hold applies to deposits only; a booking has at most one open balance payment.
drop index if exists checkouts_one_hold_per_day;
create unique index if not exists checkouts_one_hold_per_day on checkouts(listing_id, event_date) where status = 'pending' and kind = 'deposit';
create unique index if not exists checkouts_one_open_balance on checkouts(booking_id) where status = 'pending' and kind = 'balance';

-- Bookings: status, the terms copied from the accepted quote, payment and cancellation outcome.
alter table bookings add column if not exists status text not null default 'confirmed';
alter table bookings drop constraint if exists bookings_status_check;
alter table bookings add constraint bookings_status_check check (status in ('confirmed', 'cancelled'));
alter table bookings add column if not exists balance_due_date date;
alter table bookings add column if not exists cancellation_cutoff_days integer;
alter table bookings add column if not exists cancellation_terms text;
alter table bookings add column if not exists paid_in_full_at timestamptz;
alter table bookings add column if not exists cancelled_at timestamptz;
alter table bookings add column if not exists cancelled_by text check (cancelled_by in ('planner', 'owner'));
alter table bookings add column if not exists cancellation_outcome text check (cancellation_outcome in ('full_refund', 'deposit_retained', 'manual_review'));
alter table bookings add column if not exists retained_pence integer not null default 0;
-- A cancelled booking releases its date: only confirmed bookings hold a listing-day.
alter table bookings drop constraint if exists bookings_listing_id_event_date_key;
create unique index if not exists bookings_one_per_day on bookings(listing_id, event_date) where status = 'confirmed';

-- One refund per original payment. 'review' = waiting for a person to decide (older bookings without terms).
create table if not exists refunds (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references bookings(id),
  checkout_id         uuid not null unique references checkouts(id),
  amount_pence        integer not null check (amount_pence > 0),
  status              text not null default 'pending' check (status in ('review', 'pending', 'succeeded', 'failed', 'declined')),
  provider_refund_id  text unique,
  failure_reason      text,
  notified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists refunds_booking on refunds(booking_id);
alter table refunds enable row level security;
