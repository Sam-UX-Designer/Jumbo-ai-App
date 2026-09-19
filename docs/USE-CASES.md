# JUMBO — use cases under test

Every case here is executed by `npm test`. The identifiers match the ones
the suite prints, so a failure names the promise that broke rather than a
line of code.

```bash
npm run build && npm test          # all of it
node tests/e2e/run.mjs logging     # one group
```

The suite drives the **built application** in a real browser against a
stand-in API that answers the same shapes the production server answers.
That keeps it honest about the interface and the state layer — the parts
that hold a person's records — without depending on OpenRouter, YouTube or
a wearable vendor being reachable. Where a case is about a *failing*
service, it routes that call itself and says so.

**What the suite cannot tell you** is in
[PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md). A green run means the
app behaves correctly as built; it does not mean the product is finished.

---

## Onboarding — `tests/e2e/cases/onboarding.mjs`

| ID | Use case | Why it matters |
|---|---|---|
| UC-01 | A new person can complete setup and reach the app | The name and goals they typed are still there at the end |
| UC-02 | Sample data is never given to someone who did not ask | A stranger's health record wearing your name is worse than an empty screen |
| UC-03 | Sample data can be chosen deliberately, and left again | It is a real feature when it is a choice |
| UC-04 | Leaving sample data asks first and can be cancelled | The person may be about to find an empty app; say so before it happens |

## Recording and retrieving — `tests/e2e/cases/logging.mjs`

Every record is checked three ways: it is written, it survives a reload,
and it reaches the figures on Today. The third is not pedantry — a workout
was once saved and listed on Capture while every number on Today ignored it.

| ID | Use case |
|---|---|
| UC-10 | A logged workout is saved, survives reload, and counts toward the day |
| UC-11 | A logged meal is saved and reaches the nutrition figures |
| UC-12 | A measurement is saved and kept |
| UC-13 | A note is saved against the right day |
| UC-14 | Several records on one day all register, newest first, never sorted by category |
| UC-15 | A record can be removed, is confirmed first, and stays removed |
| UC-16 | Yesterday's records do not leak into today |
| UC-17 | Sleep can be logged by hand and counts toward the day |
| UC-18 | Every kind can be reached and saved from the + button, and the form does not reopen on return |
| UC-19 | A hand-written night is used when nothing measured one |

## Profile, preferences and data controls — `tests/e2e/cases/settings.mjs`

A setting that does not survive a reload is worse than no setting: the
person believes they changed something. Each case changes a value through
the interface and reads it back from storage.

| ID | Use case |
|---|---|
| UC-20 | The profile name can be changed and is kept |
| UC-21 | The theme can be switched, repaints, and is kept |
| UC-22 | A privacy switch changes behaviour and is kept |
| UC-23 | Goals can be changed and are kept |
| UC-24 | A person can export everything the app holds on them |
| UC-25 | The plans screen does not pretend to take money |

## AI, content and failure — `tests/e2e/cases/ai-and-content.mjs`

| ID | Use case | Why it matters |
|---|---|---|
| UC-30 | Ask Jumbo holds a conversation | The question and the answer both appear |
| UC-31 | A failing AI service produces a product-level message | A failed request must not look like a hung one, and the app must stay usable |
| UC-32 | With AI switched off at the server, nothing leaks | No key names, env vars or stack traces reach a person |
| UC-33 | The AI is never asked to interpret an empty account | A pattern found in nothing could only have been invented |
| UC-34 | What is sent to the AI contains no invented zeroes | `0` means "no steps" for steps and "no heart" for a heart rate |
| UC-35 | No health data leaves the device with a name attached | Name and phone number never appear in a request body |
| UC-36 | Explore lists content, and a saved item stays saved |
| UC-37 | Explore search and filters respond |
| UC-38 | With no content service, Explore explains itself |
| UC-39 | A malformed API response cannot blank the app | One bad field must not cost the person the whole product |

## Integrity across the app — `tests/e2e/cases/integrity.mjs`

These sweep every screen, in both themes, in both data modes.

| ID | Use case |
|---|---|
| UC-40 | An empty account shows no invented numbers, in either theme |
| UC-41 | An account with one record stays honest on every screen |
| UC-42 | Sample mode is labelled on every screen that shows it |
| UC-43 | The app survives a corrupted, empty or foreign saved state |
| UC-44 | Records are not lost when state is written repeatedly |
| UC-45 | Every screen is reachable and none is a dead end |
| UC-46 | Every control has an accessible name and meets the 28px minimum |
| UC-47 | The app works from a 320px phone to a desktop window, with no sideways scroll |

---

## Adding a case

Cases are plain functions. `r.run` isolates each one, so a case that throws
records itself as a failure and the suite carries on.

```js
await r.run('UC-50', 'What a person should be able to do', async () => {
  const { ctx, page } = await openApp(browser, origin, account())
  await goTo(page, 'capture')
  r.check('the thing they need is there', await page.locator('.thing').count() > 0)
  await ctx.close()
})
```

Helpers live in `tests/e2e/harness.mjs`: `account()` builds a saved state,
`aMeal()`, `aWorkout()` and `aSleep()` build records in the shape the app really
stores, `saved(page)` reads storage back, `goTo` navigates by the tab bar,
`clickClear` clicks something the fixed composer may be sitting over, and
`quickAdd` opens the centre button's menu and picks a kind.

Keep the fixtures matching the real contracts. Two bugs in this suite's
first run were fixtures that had drifted from the API, and a fixture that
lies is worse than no test.
