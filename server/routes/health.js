import { Router } from 'express'
import { accessTokenFor, sessionFrom } from './oauth.js'
import { PROVIDERS } from '../lib/providers.js'
import { getSession, updateSession } from '../lib/store.js'

export const health = Router()

const iso = (d) => new Date(d).toISOString().slice(0, 10)
const daysAgo = (n) => iso(Date.now() - n * 86_400_000)

/**
 * Per-provider adapters.
 *
 * Endpoint paths follow each vendor's published Web API at the time of
 * writing. Vendors do move them, so every adapter reports a structured error
 * instead of throwing, and the UI shows that error rather than inventing data.
 */
const ADAPTERS = {
  async oura(token, since) {
    const base = PROVIDERS.oura.apiBase
    const q = `start_date=${since}&end_date=${iso(Date.now())}`
    const get = (path) =>
      fetch(`${base}${path}?${q}`, { headers: { Authorization: `Bearer ${token}` } })

    const [sleepRes, activityRes, readinessRes] = await Promise.all([
      get('/usercollection/daily_sleep'),
      get('/usercollection/daily_activity'),
      get('/usercollection/daily_readiness'),
    ])
    if (!sleepRes.ok) throw httpError('oura', sleepRes)

    const sleep = (await sleepRes.json()).data ?? []
    const activity = activityRes.ok ? ((await activityRes.json()).data ?? []) : []
    const readiness = readinessRes.ok ? ((await readinessRes.json()).data ?? []) : []

    const byDay = new Map()
    const touch = (day) => {
      if (!byDay.has(day)) byDay.set(day, { date: day, sources: ['oura'] })
      return byDay.get(day)
    }
    sleep.forEach((d) => {
      const r = touch(d.day)
      const c = d.contributors ?? {}
      if (typeof d.score === 'number') r.sleepScore = d.score
      if (typeof c.total_sleep === 'number') r.sleepQuality = c.total_sleep
    })
    activity.forEach((d) => {
      const r = touch(d.day)
      if (typeof d.steps === 'number') r.steps = d.steps
      if (typeof d.active_calories === 'number') r.activeCalories = d.active_calories
    })
    readiness.forEach((d) => {
      const r = touch(d.day)
      const c = d.contributors ?? {}
      if (typeof c.hrv_balance === 'number') r.hrvBalance = c.hrv_balance
      if (typeof c.resting_heart_rate === 'number') r.restingHrScore = c.resting_heart_rate
    })
    return [...byDay.values()]
  },

  async whoop(token, since) {
    const base = PROVIDERS.whoop.apiBase
    const start = new Date(since).toISOString()
    const get = (path) =>
      fetch(`${base}${path}?start=${encodeURIComponent(start)}&limit=25`, {
        headers: { Authorization: `Bearer ${token}` },
      })

    const [sleepRes, recoveryRes, workoutRes] = await Promise.all([
      get('/v1/activity/sleep'),
      get('/v1/recovery'),
      get('/v1/activity/workout'),
    ])
    if (!sleepRes.ok) throw httpError('whoop', sleepRes)

    const sleep = (await sleepRes.json()).records ?? []
    const recovery = recoveryRes.ok ? ((await recoveryRes.json()).records ?? []) : []
    const workouts = workoutRes.ok ? ((await workoutRes.json()).records ?? []) : []

    const byDay = new Map()
    const touch = (day) => {
      if (!byDay.has(day)) byDay.set(day, { date: day, sources: ['whoop'] })
      return byDay.get(day)
    }
    sleep.forEach((s) => {
      const r = touch(iso(s.end ?? s.start))
      const ms = s.score?.stage_summary?.total_in_bed_time_milli
      if (typeof ms === 'number') r.sleepHours = round(ms / 3_600_000, 2)
      if (typeof s.score?.sleep_performance_percentage === 'number') {
        r.sleepEfficiency = Math.round(s.score.sleep_performance_percentage)
      }
    })
    recovery.forEach((rec) => {
      const r = touch(iso(rec.created_at))
      if (typeof rec.score?.hrv_rmssd_milli === 'number') r.hrv = Math.round(rec.score.hrv_rmssd_milli)
      if (typeof rec.score?.resting_heart_rate === 'number') r.restingHR = Math.round(rec.score.resting_heart_rate)
    })
    workouts.forEach((w) => {
      const r = touch(iso(w.start))
      const mins = (new Date(w.end) - new Date(w.start)) / 60_000
      r.workout = { type: w.sport_name ?? 'Workout', minutes: Math.round(mins), source: 'whoop' }
    })
    return [...byDay.values()]
  },

  async fitbit(token, since) {
    const base = PROVIDERS.fitbit.apiBase
    const today = iso(Date.now())
    const get = (path) => fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })

    const [stepsRes, sleepRes, rhrRes] = await Promise.all([
      get(`/1/user/-/activities/steps/date/${since}/${today}.json`),
      get(`/1.2/user/-/sleep/date/${since}/${today}.json`),
      get(`/1/user/-/activities/heart/date/${since}/${today}.json`),
    ])
    if (!stepsRes.ok) throw httpError('fitbit', stepsRes)

    const steps = (await stepsRes.json())['activities-steps'] ?? []
    const sleep = sleepRes.ok ? ((await sleepRes.json()).sleep ?? []) : []
    const hr = rhrRes.ok ? ((await rhrRes.json())['activities-heart'] ?? []) : []

    const byDay = new Map()
    const touch = (day) => {
      if (!byDay.has(day)) byDay.set(day, { date: day, sources: ['fitbit'] })
      return byDay.get(day)
    }
    steps.forEach((d) => { touch(d.dateTime).steps = Number(d.value) })
    sleep.forEach((s) => {
      const r = touch(s.dateOfSleep)
      if (typeof s.minutesAsleep === 'number') r.sleepHours = round(s.minutesAsleep / 60, 2)
      if (typeof s.efficiency === 'number') r.sleepEfficiency = s.efficiency
    })
    hr.forEach((d) => {
      const v = d.value?.restingHeartRate
      if (typeof v === 'number') touch(d.dateTime).restingHR = v
    })
    return [...byDay.values()]
  },

  async withings(token) {
    const base = PROVIDERS.withings.apiBase
    const body = new URLSearchParams({
      action: 'getmeas',
      meastypes: '1,6,5,8,88',
      category: '1',
      startdate: String(Math.floor((Date.now() - 180 * 86_400_000) / 1000)),
      enddate: String(Math.floor(Date.now() / 1000)),
    })
    const r = await fetch(`${base}/measure`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!r.ok) throw httpError('withings', r)
    const json = await r.json()
    if (json.status !== 0) throw new Error(`Withings returned status ${json.status}`)

    const TYPE = { 1: 'weightKg', 6: 'bodyFatPct', 5: 'leanMassKg', 8: 'fatMassKg', 88: 'boneMassKg' }
    const byDay = new Map()
    ;(json.body?.measuregrps ?? []).forEach((g) => {
      const day = iso(g.date * 1000)
      if (!byDay.has(day)) byDay.set(day, { date: day, sources: ['withings'] })
      const rec = byDay.get(day)
      g.measures.forEach((m) => {
        const key = TYPE[m.type]
        if (key) rec[key] = round(m.value * 10 ** m.unit, 2)
      })
    })
    return [...byDay.values()]
  },
}

const round = (v, dp) => Number(v.toFixed(dp))
const httpError = (id, res) => Object.assign(new Error(`${id} responded ${res.status}`), { status: res.status })

/* ------------------------------------------------------------------ sync */
health.post('/sync', async (req, res) => {
  const s = await sessionFrom(req, res)
  const connected = Object.keys(s.providers ?? {})
  if (!connected.length) {
    return res.json({ connected: [], days: [], errors: [], syncedAt: Date.now() })
  }

  const since = daysAgo(Number(req.body?.days ?? 180))
  const merged = new Map()
  const errors = []

  for (const id of connected) {
    const adapter = ADAPTERS[id]
    if (!adapter) {
      errors.push({ provider: id, message: 'No data adapter for this provider yet.' })
      continue
    }
    const token = await accessTokenFor(s.id, id)
    if (!token) {
      errors.push({ provider: id, message: 'Access token expired and could not be refreshed. Reconnect this source.' })
      continue
    }
    try {
      const rows = await adapter(token, since)
      rows.forEach((row) => {
        const existing = merged.get(row.date)
        merged.set(row.date, existing
          ? { ...existing, ...row, sources: [...new Set([...(existing.sources ?? []), ...(row.sources ?? [])])] }
          : row)
      })
      const rec = s.providers[id]
      rec.lastSyncAt = Date.now()
    } catch (err) {
      errors.push({ provider: id, message: err.message, status: err.status ?? null })
    }
  }

  await updateSession(s.id, { providers: s.providers })
  const days = [...merged.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
  res.json({ connected, days, errors, syncedAt: Date.now() })
})

/** What the browser is allowed to know about its own session. */
health.get('/session', async (req, res) => {
  const s = await sessionFrom(req, res)
  const full = await getSession(s.id)
  res.json({
    connected: Object.entries(full.providers ?? {}).map(([id, v]) => ({
      id, connectedAt: v.connectedAt, lastSyncAt: v.lastSyncAt, scope: v.scope ?? null,
    })),
  })
})
