# Artwork

Every image in Jumbo — the mascot, profile photos, illustrations, the brand
mark and the health-source logos — is a **placeholder** today. Each one is a
real file in `public/assets/`, sized and positioned exactly where the finished
artwork will sit, and marked so nobody mistakes it for final work.

Replacing a placeholder is a file copy. No code change, no rebuild of the
component, no layout to re-tune.

---

## How to replace one

1. Find the asset in the table below and note its **file path**.
2. Export your artwork at the size given, in the format given.
3. Save it over the existing file at that path, keeping the same filename.
4. Commit. That is the whole job.

**If your export has a different extension** (a `.png` where the placeholder
is a `.svg`, say) — add the new file and change that asset's one `file:` line
in [`src/lib/assets.ts`](../src/lib/assets.ts). It is the only place in the
codebase that names an image path.

### Hosting the artwork elsewhere

Leave it alone and the app serves everything from its own `public/assets`
folder. To serve the finished files straight from GitHub instead, set one
environment variable:

```
VITE_ASSET_BASE_URL=https://raw.githubusercontent.com/Sam-UX-Designer/Jumbo-ai-App/main/public/assets
```

Every path in the table is then resolved against that base, keeping the same
folder structure.

---

## The assets

Sizes are the **minimum** to export at. Everything is drawn into a fixed slot,
so a larger file is fine and a smaller one will look soft on a retina screen.

### Brand

| File | Format | Export at | Where it appears |
|---|---|---|---|
| `brand/jumbo-mark.svg` | SVG or PNG, transparent | 512 × 512 | Sidebar on tablet and desktop · onboarding header · home-screen icon |
| `brand/jumbo-wordmark.svg` | SVG preferred, transparent | 720 × 180 (4:1) | Onboarding welcome screen |

### Mascot

| File | Format | Export at | Where it appears |
|---|---|---|---|
| `mascot/jumbo-mascot.svg` | SVG or PNG, transparent | 512 × 512 square | Future screen, in the circular area at the top |

The app draws the circle, the glow and the float animation around it. Supply
the character on a transparent background, centred, with a little breathing
room — it is scaled to 86% of the circle. It floats gently at all times and
picks up a faster loop plus a pulse ring while the AI is working.

### People

| File | Format | Export at | Where it appears |
|---|---|---|---|
| `avatar/user-placeholder.svg` | SVG or PNG, transparent | 256 × 256 square | Top right of every screen, and the profile card, for anyone with no photo of their own |

This is the *fallback* only. Once someone adds a photo on the You screen it
replaces this everywhere. The photo is cropped square, scaled to 256 px and
kept on that device — it is never uploaded and never sent to the AI.

### Illustrations

| File | Format | Export at | Where it appears |
|---|---|---|---|
| `illustrations/onboarding-welcome.svg` | SVG or PNG | 1200 × 800 (3:2) | Onboarding welcome. Cropped to fill, up to 264 px tall — keep the subject central |
| `illustrations/future-path.svg` | SVG or PNG | 1200 × 400 (3:1) | Banner at the top of the Future screen |
| `illustrations/ready-rocket.svg` | SVG or PNG, transparent | 800 × 800 (1:1) | The last onboarding screen, "you're ready" |
| `illustrations/celebration.svg` | SVG or PNG, transparent | 800 × 800 (1:1) | After a meal is saved from a photo |

### Content

| File | Format | Export at | Where it appears |
|---|---|---|---|
| `content/video-thumbnail.svg` | SVG or PNG | 640 × 360 (16:9) | Explore, when YouTube returns a video with no thumbnail of its own |
| `content/meal-photo.svg` | SVG or PNG | 256 × 256 (1:1) | The meal rows under "Logged today" |

### Health source logos

| File | Provider |
|---|---|
| `providers/apple-health.svg` | Apple Health |
| `providers/health-connect.svg` | Health Connect |
| `providers/whoop.svg` | WHOOP |
| `providers/oura.svg` | Oura |
| `providers/fitbit.svg` | Fitbit |
| `providers/withings.svg` | Withings |
| `providers/garmin.svg` | Garmin |

Export at 128 × 128, transparent, drawn inside the square with a little
padding. They appear at 38–44 px in onboarding and on the You screen.

> **These must come from each company's own brand assets** and follow that
> company's usage rules. The placeholders are deliberately generic initials —
> Jumbo never draws an approximation of somebody else's mark. Filenames are
> keyed to the provider ids the server returns, so a new provider needs a new
> row in `src/lib/assets.ts` as well as a file here.

---

## Things to know when you draw them

- **Both themes.** The app has a designed light theme, not an inversion.
  Anything that is not a photograph should be transparent or theme-neutral, so
  it sits on `#08090A` and on `#FAFBF8` equally well. The slot paints its own
  surface behind the file.
- **Nothing is stretched.** Each slot crops to the aspect ratio in the table.
  Give the subject margin so a crop never clips it.
- **A missing file does not break a screen.** If an asset fails to load, the
  slot collapses to a plain surface at the same size rather than showing a
  broken-image icon. So a half-finished set is safe to commit.
- **Layout does not shift on delivery.** Every slot has a fixed size and
  aspect ratio in CSS, so swapping a placeholder for the real file changes
  nothing but the pixels.
- **Reduced motion is respected.** The mascot float and the artwork entrances
  are disabled for anyone who asks their device for less motion, so nothing
  should depend on movement to read.

## Not covered yet

**Creator avatars.** The reference design shows a small photo of each
YouTube creator on the video rows. Jumbo does not fetch channel images today —
`YoutubeVideo` carries no channel thumbnail — and rather than ship a fake face
there is no slot for it. To add one: have `/api/youtube/search` return the
channel thumbnail alongside each video, add a `creator` entry to
`src/lib/assets.ts`, and render it in `VideoRow`.
