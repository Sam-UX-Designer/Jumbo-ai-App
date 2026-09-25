# Turning on accounts

Until the two variables below exist, Jumbo works exactly as it always has:
records live in one browser, and the app says so on the Profile screen
rather than offering a sign-in that cannot reach anything. Nothing here is
half-on.

Four steps, about ten minutes.

## 1. Make the Supabase project

[supabase.com](https://supabase.com) → **New project**. Free tier is enough.
Pick a region near your users; everything else can stay as it comes.

## 2. Create the table

Dashboard → **SQL Editor** → **New query**. Paste all of
[`supabase/schema.sql`](../supabase/schema.sql) and press Run. It is safe to
run twice.

**Do not skip the policies in that file.** Supabase's anon key is meant to
be public and ships inside the app, exactly like a Google Maps key. What
keeps one person out of another's health record is Row Level Security, and
nothing else. With RLS off, that public key reads every row in the table.
The file turns it on and writes the four policies; if you ever rebuild the
table by hand, do the same.

## 3. Turn on email links

Dashboard → **Authentication** → **Sign In / Providers** → Email. Leave
**Enable Email provider** on, and **turn off** "Confirm email" if you want
the first link to sign people straight in rather than only confirming them.

Then **Authentication → URL Configuration**:

| Field | Value |
|---|---|
| Site URL | `https://jumbo-ai-app.vercel.app` |
| Redirect URLs | `https://jumbo-ai-app.vercel.app/**` |

Without the redirect URL the link in the email lands on an error page.

Supabase sends these emails itself on the free tier, rate limited to a few
an hour. That is fine for you and for early users; before any real launch,
add your own SMTP under **Project Settings → Auth → SMTP** or the limit
will bite.

## 4. Give Vercel the two keys

Dashboard → **Project Settings → API**. Copy the **Project URL** and the
**anon / public** key.

In Vercel → your project → **Settings → Environment Variables**, add both to
Production and Preview:

```
VITE_SUPABASE_URL       = https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY  = eyJhbGciOi...
```

Redeploy. That is it.

**Never add the `service_role` key.** It bypasses every policy above. It is
not needed by anything in this app, and a `VITE_` variable is compiled into
the JavaScript every visitor downloads.

## What happens then

- Welcome offers **I already have an account**, and Profile offers to sign in.
- One email field, no password. The link creates the account if there is not
  one, and signs in if there is, so nobody has to know which they are doing.
- On signing in, the device's records and the account's are **merged**, not
  swapped. A meal logged on a phone and a workout logged on a laptop both
  survive. `src/lib/merge.ts` decides field by field; `tests/unit/merge.mjs`
  holds it to that.
- Changes push two seconds after you stop making them.
- Signing out ends both sessions and deletes nothing.

## What this still is not

Sync is per record, not per keystroke, and the newer save wins where two
devices wrote to the same day. Two people editing the same account at the
same second is not something Jumbo handles gracefully, and it is not
something a personal health app usually meets.

There is still no billing, and the AI routes are still unauthenticated. See
[PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md) sections 2.3 and 2.4.
