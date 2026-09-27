# Getting around

Five destinations, and one action floating clear of them.

| | |
|---|---|
| **Home** | The day's score, rings and metrics |
| **Log** | What you have recorded, and the ways to add that the + does not cover |
| **Lifestyle** | Where your patterns lead |
| **Explore** | Things worth watching |
| **Profile** | Account, settings, data |

The green **+** floats bottom-right and raises the quick-add menu: Meal,
Workout, Sleep, Measure, Note, Training, and a way to today's records.

## How it got here

1. The + was the middle tab. That meant the day's records had no tab —
   the only way to them was a quiet item at the bottom of the add menu.
2. The + came out of the bar, and a **Capture** tab went in: a grid of
   the same five kinds the + already offers, one tap further away. Two
   doors to one room — and it pushed Explore off the bar to make space.
3. Capture is gone. Adding is the +. Explore has its tab back.

## What Log keeps from Capture

Only what the + cannot do, in one row near the top:

| | |
|---|---|
| **Type a meal** | Instead of photographing it |
| **Voice log** | Where the browser supports dictation |
| **Training** | Plans and today's suggestion |

Equal columns rather than a scrolling chip rail. A rail hides whatever is
last behind the screen edge, and last was Training — the feature once
reported as "not showing on mobile" because it sat below the fold. The
design system also forbids wrapping a chip row, so dividing the width is
how all three stay in view on a 320px phone.

"Search food" and "Type manually" were both on Capture and called the same
function. They are one button now.

## Links saved before the change

Notifications and events already stored in people's browsers still carry
`route: 'capture'`. The type no longer allows it, and a route nothing
renders is a blank screen. `setRoute` in `App.tsx` — the one function every
screen change passes through — maps it to Log. UC-89 was checked against a
build without that mapping, where tapping an old notification left an empty
screen.

## The floating +

- **It sits above the Ask Jumbo composer, not on it.** Its `bottom` is
  `nav-h + dock-h`, and `--dock-h` is published by `AskDock` and removed
  when that unmounts, so on screens with no composer it drops to the bar.
  UC-88 measures the gap.
- **It sits outside the `<nav>` element.** Walking the navigation landmark
  should not turn up a control that goes nowhere.

## The test harness

`goTo(page, screen)` knows `today`, `log`, `future`, `explore` and
`profile`. An unknown name — `capture` included — throws, rather than
silently landing on the first tab and letting a test pass for the wrong
reason. That throw is how every stale reference in the suite was found.
