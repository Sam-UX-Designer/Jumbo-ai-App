# Getting around

Five destinations, and one action floating clear of them.

| | |
|---|---|
| **Home** | The day's score, rings and metrics |
| **Log** | What you have recorded — the diary |
| **Lifestyle** | Where your patterns lead |
| **Capture** | Where a new record starts |
| **Profile** | Account, settings, data |

The green **+** floats bottom-right. It raises the quick-add menu.

## Why the + came out of the bar

It used to be the middle tab. That cost a destination: **Capture had no
tab, because the + was standing in its slot.** The only way to the day's
records was a quiet item at the bottom of the add menu, found by people
who already knew it was there. A screen reachable only by accident is not
a screen.

Adding is an action, not a place. So the bar carries destinations and the
+ lifts out of the row.

Two consequences worth knowing:

- **It floats above the Ask Jumbo composer, not on it.** Its `bottom` is
  `nav-h + dock-h`, and `--dock-h` is published by `AskDock` and removed
  when that unmounts, so on screens with no composer it drops to the bar.
  Landing on the composer would be UC-49's bug in a different coat, so
  UC-88 measures the gap rather than trusting it.
- **It sits outside the `<nav>` element**, not just outside the row.
  Walking the navigation landmark should not turn up a control that goes
  nowhere.

## Log and Capture are one component

`src/screens/Capture.tsx` takes `view: 'add' | 'log'`. They are the two
halves that screen always had — the ways to add something, and the record
of what was added — and they now have a tab each. They share the day, the
records and every sheet behind them, so they stay one component rather
than two that have to be kept in step by hand.

## Explore

It came off the bar to make room, and it is not orphaned: Home carries a
row into it, Profile carries another, and the sidebar on a wide screen
lists it outright. A content feed matters less as a tab than the record of
your own day.

## The test harness

`goTo(page, screen)` knows `today`, `log`, `future`, `capture`, `profile`
and `explore`. An unknown name throws rather than silently landing on the
first tab — a test that passes for the wrong reason is worse than one that
fails.
