# Native health integrations

Apple Health is a **platform SDK, not a web API**. A browser cannot read it,
and no amount of front-end work changes that. So Jumbo does not offer a fake
"one tap" web connection for it. Instead:

- **In a browser** it appears with a clear "Needs the Jumbo app" state that
  explains why, and every other source stays available over OAuth.
- **In the iOS shell** the same tile connects for real through a bridge the
  shell injects on `window.JumboNative`.

Jumbo does not offer Health Connect or Google Fit. Google closed the Google
Fit APIs to new apps in May 2024 and is switching them off at the end of
2026, so a Google Fit button could never work; Health Connect was removed
with it.

## The bridge contract

The web app looks for this object at startup. If it is absent, native sources
stay unavailable. Nothing is simulated.

```ts
interface JumboNativeBridge {
  /** "ios" | "android" */
  platform: 'ios' | 'android'

  /** Which native store this shell can talk to. */
  available(): Promise<{ healthkit: boolean }>

  /**
   * Triggers the real system permission sheet.
   * Resolves with the permissions the person actually granted — never assume
   * the full set was approved.
   */
  requestPermissions(types: HealthType[]): Promise<{ granted: HealthType[]; denied: HealthType[] }>

  /** Reads records the user has granted, inclusive of both dates (YYYY-MM-DD). */
  read(request: {
    types: HealthType[]
    from: string
    to: string
  }): Promise<NativeDay[]>

  /** Optional. Fires when the store reports new data in the background. */
  onUpdate?(cb: () => void): () => void
}

type HealthType =
  | 'sleep' | 'steps' | 'activeMinutes' | 'workouts'
  | 'restingHeartRate' | 'hrv' | 'vo2max'
  | 'weight' | 'bodyFat' | 'leanMass' | 'nutrition'

interface NativeDay {
  date: string            // YYYY-MM-DD
  sleepHours?: number
  sleepEfficiency?: number
  bedtimeHour?: number    // 24h decimal, 23.5 = 23:30
  steps?: number
  activeMinutes?: number
  restingHR?: number
  hrv?: number            // ms, RMSSD or SDNN — say which in `source`
  vo2max?: number
  weightKg?: number
  bodyFatPct?: number
  leanMassKg?: number
  workout?: { type: string; minutes: number; intensity?: 1 | 2 | 3 }
  source: string          // e.g. "HealthKit"
}
```

## iOS shell

1. Enable the **HealthKit** capability in Xcode.
2. Add `NSHealthShareUsageDescription` to `Info.plist` explaining, in the
   person's language, what Jumbo reads and why. Apple rejects vague strings.
3. Request read access for the quantity and category types matching the
   `HealthType` list above. Jumbo never writes to HealthKit.
4. Expose the bridge to the web view with a `WKScriptMessageHandler`, or use
   Capacitor and register a plugin that resolves the same shape.

Reference: https://developer.apple.com/documentation/healthkit

## Rules the shell must respect

- Never report a permission as granted that the system did not grant.
- Never synthesise a value for a type the person declined. Return nothing for
  it and let Jumbo show the gap.
- Reads are user-initiated or triggered by a real background delivery. No
  polling loops.
