-- Why the AI brief reader didn't run for a brief (null when it ran, or when the rules reader was chosen).
-- Short reason only, e.g. "HTTP 401 (check OPENAI_API_KEY)". Never brief text or keys.
alter table briefs add column if not exists extractor_error text;

-- Email log: allow "skipped" (synthetic *.test reviewer addresses are never sent to a real provider),
-- and keep Resend's message id so a delivery can be looked up in the Resend dashboard.
alter table email_outbox drop constraint if exists email_outbox_status_check;
alter table email_outbox add constraint email_outbox_status_check check (status in ('logged', 'sent', 'failed', 'skipped'));
alter table email_outbox add column if not exists provider_id text;
