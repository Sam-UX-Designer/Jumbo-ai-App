# Native health integrations

Apple Health and Android Health Connect are **platform SDKs, not web APIs**.
A browser cannot read them, and no amount of front-end work changes that. So
Jumbo does not offer a fake "one tap" web connection for them. Instead:

- **In a browser** the two sources appear with a clear "Needs the Jumbo app"
  state that explains why, and every other source stays available over OAuth.
- **In the native shell** the same tiles connect for real through a bridge the
  shell injects on `window.JumboNative`.

## The bridge contract

The web app looks for this object at startup. If it is absent, native sources
stay unavailable. Nothing is simulated.

```ts
interface JumboNativeBridge {
  /** "ios" | "android" */
  platform: 'ios' | 'android'

  /** Which native store this shell can talk to. */
  available(): Promise<{ healthkit: boolean; healthConnect: boolean }>

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
  source: string          // e.g. "HealthKit" or "Health Connect"
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

## Android shell

1. Add the Health Connect client dependency and declare the read permissions
   you need in the manifest.
2. Request them through the Health Connect permission contract.
3. Bridge into the web view with `@JavascriptInterface`, or a Capacitor plugin.

Reference: https://developer.android.com/health-and-fitness/guides/health-connect

## Rules the shell must respect

- Never report a permission as granted that the system did not grant.
- Never synthesise a value for a type the person declined. Return nothing for
  it and let Jumbo show the gap.
- Reads are user-initiated or triggered by a real background delivery. No
  polling loops.
