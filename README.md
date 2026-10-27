# RenewMe

Next.js, TypeScript, Tailwind CSS, and Supabase subscription ledger.

## Run locally

```bash
npm install
npm run dev
```

Open `/subscriptions` (or `/`, which redirects there). The original Stitch screen and its previews remain preserved in `public/stitch-reference`; the live route uses native React components styled to match the export.

## Supabase setup

1. Copy `.env.example` to `.env.local` and add your Supabase project URL and publishable key.
2. Apply `supabase/migrations/202610220001_create_subscriptions.sql` to your Supabase project.
3. Enable email/password sign-in in Supabase Auth. Email confirmation redirects to `/auth/callback`.

The route shows the Stitch sample ledger in read-only preview mode until Supabase is configured. With Supabase configured, users can create an account or sign in; row-level security scopes reads and writes to the signed-in user. Subscription changes, status filters, search, editing, archiving, batch review, and CSV export are available in the native ledger UI.
