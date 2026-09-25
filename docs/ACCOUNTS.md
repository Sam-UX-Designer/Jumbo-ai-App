# Accounts

Live on Supabase project **Jumbo** (`onaijekfptajutpbuzqp`, ap-south-1).

## Already done

| | |
|---|---|
| Table | `public.jumbo_state` — one row per person, `state jsonb`, `updated_at` |
| Row Level Security | On, with four policies scoped to `authenticated` |
| Isolation | Verified: signed-out sees 0 rows, each user sees only their own |
| Trigger | `updated_at` set by the database, not trusted from the client |
| Security advisors | Zero findings |
| Vercel | `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set on production and preview |

## The one thing left, and it is not optional

**Supabase Dashboard → Authentication → URL Configuration**

| Field | Value |
|---|---|
| Site URL | `https://jumbo-ai-app.vercel.app` |
| Redirect URLs | `https://jumbo-ai-app.vercel.app/**` |

A new project defaults its Site URL to `http://localhost:3000`. Supabase
checks the address an email link returns to against that allow-list, and
sends people to the Site URL when it does not match. Leave it as it is and
every sign-in link lands on a dead localhost page.

While you are on that screen, **Authentication → Sign In / Providers →
Email**: leave the email provider on, and turn **Confirm email** off if you
want the first link to sign somebody in rather than only confirm them.

## Why the key is in the browser

`VITE_` variables are compiled into the JavaScript every visitor downloads,
so the publishable key is public. That is what it is for, the same way a
Maps key is. What keeps one person out of another's health record is Row
Level Security, and this was checked rather than assumed:

```
anon, not signed in  ->  0 row(s): nothing
alice                ->  1 row(s): alice
bob                  ->  1 row(s): bob
```

**The `service_role` key is a different thing entirely.** It bypasses every
policy above. Nothing in this app uses it, and it must never go into a
`VITE_` variable or this repository.

## How sync behaves

- One email field, no password. The same link creates the account if there
  is not one and signs in if there is.
- Signing in **merges** the device's records with the account's rather than
  replacing either, so a meal logged on a phone and a workout logged on a
  laptop both survive. `src/lib/merge.ts` decides field by field;
  `tests/unit/merge.mjs` holds it to that across 18 cases.
- Records keyed by id or date are unioned. Where both devices wrote to the
  same day, the newer save takes that day. Preferences take the newer device.
- Changes push two seconds after you stop making them.
- Signing out ends both sessions and deletes nothing.

## Known limits

Supabase sends the sign-in emails itself on the free tier, rate limited to a
few an hour. Fine for you and early users; add your own SMTP under **Project
Settings → Auth → SMTP** before a real launch. Free projects also pause
after about a week with no traffic.

Still outstanding elsewhere: billing, and authentication on the AI routes.
See [PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md) 2.3 and 2.4.
