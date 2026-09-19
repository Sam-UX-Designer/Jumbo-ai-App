# JUMBO — production readiness

Written for someone deciding whether to put this in front of paying
customers. It is deliberately blunt about what is not here.

**Verdict: the product is complete and correct as an application. It is not
yet a service.** Everything a person does works and is kept. Nothing that
would let a stranger sign in, keep their data when they change phone, or
pay you, exists yet. The gap is in section 2, and it is not small.

`npm test` — 38 use cases, 214 checks, all passing. That covers the
application. It cannot cover what has not been built.

---

## 1. What genuinely works

Verified end to end, in a browser, in both themes:

- **Onboarding** — name, phone, goals, the three data choices, and the app
  at the end of it with what you typed still in place.
- **Recording** — meals, workouts, sleep, measurements and notes, all
  reachable from the centre button. Each one is saved, survives a reload,
  reaches the figures on Today, and can be removed with a confirmation.
- **The day** — health score, rings, key metrics, focus, streak, date
  selection, history.
- **AI** — Ask Jumbo, insights, and the Future narrative, over a real
  OpenRouter key, with product-level messages when the service fails.
- **Explore** — real YouTube content, search, filters, saving.
- **Profile and settings** — photo, name, goals, theme, reminders, privacy
  switches, export, clear. Everything persists.
- **Honesty about data** — an empty account shows no invented figures,
  sample data is labelled everywhere it appears and can never be reached by
  accident, and nothing that nobody measured is reported as a zero.
- **Privacy in practice** — no name, phone number, note or photo is in any
  request body. Only a statistical summary goes to the model.

## 2. What must exist before you sell it

These are not polish. Each one is a promise a buyer will assume you have
already made.

### 2.1 There are no accounts — data lives in one browser

Everything a person records is in `localStorage` on the device they typed
it into. There is no server-side record of any user.

This means: clearing site data erases everything, permanently. A new phone
starts empty. The same person on a laptop and a phone is two unrelated
users. There is no backup and no recovery. For a health product people are
meant to build months of history in, this is the single biggest gap.

**Needed:** accounts, a database, and sync. Everything else here is smaller
than this.

### 2.2 Sign-in is not real

The six-digit code is generated in the browser, shown on screen, and
compared against itself. No SMS is sent and the server is not involved. The
screen says so rather than pretending — but anyone can "verify" any number,
and the phone number identifies nothing.

**Needed:** an SMS provider, server-side code issue and verification,
sessions, rate limiting on the attempt.

### 2.3 Nobody can pay

There is no checkout, no Stripe, no subscription state. The plans screen
prices four tiers and says plainly that billing is not connected, and 15 of
its 50 listed benefits are marked "Coming soon" because the app cannot do
them yet.

**Needed:** a payment processor, a subscription record against an account,
and entitlement checks on the paid features. Also, either build the 15
unbuilt benefits or take them off the page before money changes hands.

### 2.4 The AI endpoints are open to the world

`/api/ai/chat`, `/insights`, `/future`, `/food` and `/selftest` have no
authentication and no rate limit. The OpenRouter key is correctly kept on
the server and never reaches the browser — but anyone who knows the URL can
call these endpoints in a loop and spend your credits. `/selftest` is a
plain GET that costs a model call each time it is hit.

**Needed:** authentication on the AI routes, a per-user rate limit, and a
spending cap. Treat this as urgent — it is a live cost exposure on a public
deployment, not a future risk.

### 2.5 No health app can actually connect in production

The OAuth code for Whoop, Oura, Fitbit, Withings and Garmin is written and
looks sound. None of them has credentials in the production environment, so
every one shows as "Unavailable" to every user today.

Apple Health and Health Connect cannot work on the web at all, by design —
they need a native iOS or Android app. The screen explains this honestly,
but a buyer expecting "connects to your wearable" should be told plainly
that on the web it connects to nothing right now.

**Needed:** developer accounts and OAuth credentials with each vendor, plus
a native wrapper for Apple Health and Health Connect.

### 2.6 Provider tokens are stored somewhere that gets wiped

Server sessions, which hold the OAuth tokens, are written to `/tmp` on
Vercel. That is cleared between cold starts. The code says so itself:
*"Swap the two functions below for a real database in production."* Once
2.5 is done, connected sources will silently disconnect.

### 2.7 Terms of Service and Privacy Policy do not exist

Both links raise a "not yet" message. For a product that handles health
data and is about to take money, these are not optional, and in most
markets a privacy policy is a legal requirement before launch.

## 3. Smaller gaps worth knowing

| Gap | Effect |
|---|---|
| No crash reporting | A user hitting an error tells you nothing; you find out when they complain |
| No product analytics | No retention, funnel or feature-use data |
| Not installable, no offline | No manifest, no service worker. A health app people open daily should be installable |
| `favicon.png` is 917 KB, `jumbo-mascot.png` is 1.5 MB | Wasteful on every page load; re-export at display size |
| Bundle is 410 KB (126 KB gzipped) | Acceptable, not excellent. Route-splitting would help first paint |
| No CI | The suite exists but nothing runs it automatically on a push |

## 4. Fixed while auditing

Four real defects, all found by the suite and now fixed:

1. **A logged workout did not count as movement.** Saved, listed on Capture,
   then ignored by every figure on Today — so someone without a wearable
   logged a two-hour ride and was told they had done nothing.
2. **A saved state of `null` crashed the app on boot** — a white screen with
   no way back.
3. **No error boundary existed.** Any render error anywhere unmounted the
   whole application, navigation included. There is now a boundary per
   screen with an honest message, and the tab bar survives it.
4. **The client trusted the API's shape completely.** An insight or
   narrative missing one array blanked the screen. Both are now normalised
   at the API layer.

## 5. If you want the shortest path to sellable

In order, because each depends on the last:

1. Accounts, database, sync (2.1) — nothing else matters without it
2. Real sign-in (2.2)
3. Auth and rate limits on the AI routes (2.4) — or do this first, it is
   cheap and it is costing money now
4. Terms and Privacy Policy (2.7)
5. Payments and entitlements (2.3)
6. Wearable credentials, and a native wrapper if Apple Health matters (2.5,
   2.6)

Items 1, 2 and 5 are backend work the current codebase has no equivalent
of. Budget accordingly, and be careful not to describe the app to a buyer
as "connects to Apple Health" or "subscriptions" until they exist.
