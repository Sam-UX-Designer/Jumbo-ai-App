# Sharing a card

Three things can be shared as a picture: a finished training session, a
day's health score, and a meal.

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

| Card | Hero | Beneath it |
|---|---|---|
| Session | Minutes | Movements done / total, effort |
| Day | Health score out of 100 | Sleep, move, food, recovery |
| Meal | Calories | Protein, carbs, fat, and the photo if there is one |

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
