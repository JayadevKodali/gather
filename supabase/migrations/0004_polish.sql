-- Polish pass: email bodies in the outbox, admin contact audit trail, venue photos.
-- Additive only (the preview deployment shares the production database).

-- The plain-text body of each notification, so the demo outbox and the audit trail show what was sent.
alter table email_outbox add column if not exists body_text text;

-- Amara contacting an owner or planner from "Needs attention". One row per draft; it becomes the audit record.
create table if not exists admin_contacts (
  id               uuid primary key default gen_random_uuid(),
  admin_id         uuid not null references profiles(id),
  kind             text not null check (kind in ('enquiry_waiting', 'draft_listing', 'unmatched_brief')),
  target_id        uuid not null,
  recipient_id     uuid not null references profiles(id),
  recipient_role   text not null check (recipient_role in ('planner', 'owner')),
  subject          text not null,
  body             text not null,
  status           text not null default 'draft' check (status in ('draft', 'sent', 'logged', 'skipped', 'failed', 'cancelled')),
  outbox_id        uuid references email_outbox(id),
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);
create index if not exists admin_contacts_target on admin_contacts (kind, target_id, created_at desc);
alter table admin_contacts enable row level security;

-- Owner-uploaded venue photos. Files live in object storage (Supabase Storage in connected mode, local disk in
-- demo mode); this table holds the metadata. Position 0 is the cover.
create table if not exists listing_photos (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references listings(id) on delete cascade,
  storage_key   text not null unique,
  width         int not null check (width > 0),
  height        int not null check (height > 0),
  bytes         int not null check (bytes > 0),
  position      int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists listing_photos_listing on listing_photos (listing_id, position);
alter table listing_photos enable row level security;
