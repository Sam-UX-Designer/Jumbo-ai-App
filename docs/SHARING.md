# Sharing a card

Four things can be shared as a picture: a finished training session, a
day's health score, the day's food, and a single meal.

**It is a widget, not a poster.** What people actually post is their own
photograph — the shoes on the road, the shadow on the pavement — with a
small card from the app sitting on it, the way Apple's Fitness widgets do.
A full-bleed card made by Jumbo would replace the picture somebody wanted
to share. A widget sits on it and lets them keep it.

So the sheet offers **Add your photo** first, and draws the card over it.
With no photo it falls back to Jumbo's own gradient rather than refusing.

## Why it is not a one-tap jump into Instagram

Instagram's own hook is `instagram-stories://share`. It needs URL schemes
declared in a native app's `Info.plist`, and since October 2022 a Facebook
App ID passed with the request. Neither exists in a browser tab. Code that
claims to open Instagram Stories from a web page either does nothing or
lands the person on instagram.com.

So Jumbo uses `navigator.share` with a file, which opens iOS and Android's
own share sheet with Instagram in it. **Two taps, not one.** When Jumbo
ships as a native app, `src/lib/share.ts` is the only file that changes.

The button says "Share", not "Share to Instagram". A button that names an
app it cannot actually open tells a small lie every time somebody taps it.

Desktop browsers mostly have no share sheet for files. There the image
saves to downloads instead, which is the same two steps in the other order.
`canShareImage()` decides by handing the browser a real file and asking,
rather than sniffing the user agent — several browsers have
`navigator.share` and refuse anything but a URL.

## Two ways out

| | |
|---|---|
| **Share** | The whole 1080×1920 story to the phone's share sheet, where Instagram takes it as a story background. One flow |
| **Sticker** | The card alone, on transparency, at its own size. Saves to the camera roll, to place over a story by hand |

The sticker exists because the web cannot place something *inside* an
Instagram story automatically. Apple's Fitness widgets do it through the
native `stickerImage` parameter, which is part of the same native-only API
described above.

## What the cards say

| Card | Lead | Beneath it |
|---|---|---|
| Session | Minutes | Movements done / total, effort |
| Day | **The rings**, beside the score | Sleep, move, food, recovery |
| Today's food | Each meal as logged: plate, what was in it, which meal | How many items. Calories only if asked for |
| Meal | Calories | Protein, carbs, fat |

### Why the day card has rings

A viewer reads four arcs in an instant and reads "39 out of 100" not at
all. That is why Apple's rings travel between apps and a bare number never
has — the ring is legible at thumbnail size, before a single word is read.
Same order and colours as the app, outside in.

**An unmeasured ring is the faint track and nothing else.** Drawing it as
a closed-nothing arc would be the same lie as printing a zero: a day
nobody took a heart reading on would look like a day of no recovery.

### Why the food card does not lead with calories

The literature on diet and fitness trackers is consistent that
calorie-forward design is the part that harms people already vulnerable to
disordered eating, and the standing recommendation is to build around food
rather than numbers. A share card is the worst possible place to break
that: it leaves the app, it is seen by people who never chose to look at
it, and a number on it invites comparison from strangers.

So the plate leads. The total is a checkbox in the share sheet, **off by
default**, that a person turns on for their own post. UC-87 fails if that
default ever flips.

### The food card mirrors the app's own list

One row per meal, not per food: the photograph, then what was in it, then
which meal it was. A strip of photographs above a separate list of names
was the first attempt and read as neither — you could not tell which plate
went with which food.

A meal that was typed rather than photographed gets a plain tile and the
words "Typed in", so the row is honest about where it came from instead of
leaving a hole where the others have a picture. Past four meals the card
says "+ n more" rather than growing past the story frame.

**Unmeasured is an em dash, never a zero.** A day card where nothing read
your heart rate shows `—` under RECOVERY and a line saying what the dash
means. This is the same rule the rest of the app follows, and it matters
more here, not less: the card leaves Jumbo and is read by people who cannot
ask what the number meant.

A day with nothing recorded has no share button at all (UC-86).

## Where the controls are

| | |
|---|---|
| Day | Top-right of the score card on Today |
| Session | On each row of "Sessions you have done" |
| Meal | Inside a meal, under the items |

## Files

- `src/lib/shareCard.ts` — draws the PNG
- `src/lib/share.ts` — the share sheet, and the download fallback
- `src/components/ShareSheet.tsx` — preview and buttons

The preview is not decoration. What gets shared is a picture of somebody's
health, and the last chance to decide against it has to come before the
share sheet opens, not after Instagram has the file.
