# Operations: keep-alive and pausing

## Daily keep-alive (Supabase Free)
- `vercel.json` schedules `GET /api/cron/keepalive` daily at **10:00 UTC** (Vercel Hobby runs it once a day, sometimes up to an hour late).
- The route answers only with `Authorization: Bearer <CRON_SECRET>`. Vercel adds that header automatically when the
  project has a `CRON_SECRET` environment variable. Without the variable the route refuses every call (503),
  and a wrong or missing header gets 401. It runs one read-only `select 1 from listings limit 1` and returns `{ "ok": true }`.
  There are no writes, emails, AI calls or payment calls.
- **Setup:** in Vercel → Settings → Environment Variables add `CRON_SECRET` (type **Secret**, Production), a random
  value of 32+ characters (for example the output of `openssl rand -hex 32`), then redeploy.
- **Check it ran:** Vercel → project → **Settings → Cron Jobs** shows the job and lets you **Run** it now. The
  invocation appears in **Logs** (filter `/api/cron/keepalive`, look for `keep-alive ok`).
- It's a safeguard, not a guarantee: Supabase can still pause a Free project.

## If Supabase pauses anyway
Supabase dashboard → the `gather` project → **Resume project**. Data and settings come back. Supabase emails the owner
about a week before pausing.
