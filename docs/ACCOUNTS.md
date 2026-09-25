# Accounts

Live on Supabase project **Jumbo** (`onaijekfptajutpbuzqp`, ap-south-1).

## How signing in works

**Email and password, on one screen.** Signing in and signing up are the
same two fields, so they are the same form with a word changed. There is no
link to wait for in an inbox.

That was a deliberate change. A magic link works, but it costs a trip out of
the app to an inbox and back on *every single sign in*. A password is typed
once and then remembered by the phone's own keychain, so every sign in after
the first is a tap. That only happens if the markup is right — a real
`<form>`, a real submit button, `autocomplete="username"` on the email and
`current-password` / `new-password` on the password. Without those no
keychain offers to save anything. UC-71 holds the app to it.

**The app is behind the account.** `AuthGate` renders in front of
everything, onboarding included, so a link sent to somebody opens a door
rather than dropping them inside an app with no account of their own. When
Supabase is not configured the gate is transparent and Jumbo stays the
local-only app it was.

Email is still used for one thing: resetting a forgotten password. There is
no way around that one, and without it a forgotten password is a lost
account.

## Which screen you land on

| | |
|---|---|
| **Sign up** | Setup, from the beginning. Always |
| **Sign in**, account already set up | The app |
| **Sign in**, account never finished setup | Setup |

Sign-up marks the account as new in `localStorage` (`jumbo.newAccount`) and
the first pull spends that mark. The mark is needed because the app cannot
tell a new account from an old one by the browser alone: a device that used
Jumbo before accounts existed already holds `onboarded: true`, and without
the mark a brand new account sails past setup and lands on "Welcome back"
addressed to whoever used that browser last. The mark lives in
`localStorage` rather than memory because with email confirmation on the
account is made in one page load and the session arrives in another.

## Already done

| | |
|---|---|
| Table | `public.jumbo_state` — one row per person, `state jsonb`, `updated_at` |
| Row Level Security | On, with four policies scoped to `authenticated` |
| Isolation | Verified: signed-out sees 0 rows, each user sees only their own |
| Trigger | `updated_at` set by the database, not trusted from the client |
| Security advisors | Zero findings |
| Vercel | `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` on production and preview |
| Site URL | `https://jumbo-ai-app.vercel.app`, with `/**` on the redirect allow-list |

## The setting that decides how sign-up feels

**Authentication → Sign In / Providers → Email → Confirm email**

| | Confirm email **off** | Confirm email **on** |
|---|---|---|
| Sign-up | Straight into the app | "Check your inbox", then a click, then sign in |
| Cost | Anyone can sign up with an address that is not theirs | An address is proven before it holds a record |

The app handles both honestly and does not assume either: Supabase returns a
session when confirmation is off and an account with no session when it is
on, and the screen says whichever actually happened (UC-76). Either way the
link lands in setup, not back on a sign-in form.

**A new project ships with this ON**, which is why the first real sign-up
went to "check your inbox" rather than into the app. Turn it off for the
frictionless flow; leave it on for the safer one. Your call.

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

- Signing in **merges** the device's records with the account's rather than
  replacing either, so a meal logged on a phone and a workout logged on a
  laptop both survive. `src/lib/merge.ts` decides field by field;
  `tests/unit/merge.mjs` holds it to that across 18 cases.
- Records keyed by id or date are unioned. Where both devices wrote to the
  same day, the newer save takes that day.
- Preferences — the name, goals, theme — go to whichever side saved last,
  **except** on a device signing in to an account for the first time. There
  the account always wins, because the browser writes its own empty state to
  disk simply by starting up, and by the clock that blank copy would
  otherwise beat an account years old (UC-74).
- Records made on a device before it ever had an account still merge in on
  first sign-in. Losing that first week would be its own bug.
- **A device remembers whose records it holds** (`jumbo.accountId`). Two
  people sharing a laptop is why: signing out deliberately deletes nothing,
  so without this the next person to sign in would absorb what the last one
  left behind and push it to their own account (UC-75).
- Changes push two seconds after you stop making them.
- Signing out ends both sessions and deletes nothing.

## Known limits

Supabase sends the reset emails itself on the free tier, rate limited to a
few an hour. Fine for you and early users; add your own SMTP under **Project
Settings → Auth → SMTP** before a real launch. Free projects also pause
after about a week with no traffic.

Phone number and SMS one-time codes are not wired up. Supabase supports them
but does not send SMS itself — that needs a paid provider (Twilio,
MessageBird, Vonage, TextLocal, or any other through a Send SMS hook), and
sending to Indian numbers additionally needs DLT registration. Onboarding's
six-digit screen generates its code on the device and says plainly that no
SMS service is connected; it is the place that flow would plug in.

Still outstanding elsewhere: billing, and authentication on the AI routes.
See [PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md) 2.3 and 2.4.
