import { Router } from 'express'
import { env, has } from '../lib/env.js'

export const youtube = Router()

const API = 'https://www.googleapis.com/youtube/v3'

/**
 * Real YouTube Data API v3. No invented creators, no invented videos.
 * Without a key the endpoint says so plainly instead of returning fixtures.
 */
const setupRequired = (res) =>
  res.status(501).json({
    error: 'setup_required',
    missing: ['YOUTUBE_API_KEY'],
    message:
      'Explore reads real videos from the YouTube Data API. Set YOUTUBE_API_KEY on the server to turn it on. Jumbo will not invent creators or videos.',
    docs: 'https://developers.google.com/youtube/v3/getting-started',
  })

/** Goal to search intent. Every query is a real topic, not a creator name. */
const GOAL_QUERIES = {
  energy: ['daily energy levels science', 'afternoon energy dip circadian'],
  fitness: ['zone 2 training explained', 'strength training for beginners science'],
  sleep: ['sleep science bedtime consistency', 'how to improve deep sleep'],
  nutrition: ['protein intake evidence', 'building a balanced plate dietitian'],
  aging: ['vo2 max healthspan', 'longevity exercise evidence'],
  consistency: ['building exercise habits science', 'training consistency deload'],
}

youtube.get('/search', async (req, res) => {
  if (!has(env.youtubeKey)) return setupRequired(res)

  const q = String(req.query.q ?? '').trim()
  const goals = String(req.query.goals ?? '').split(',').filter(Boolean)
  const query = q || pickQuery(goals)

  try {
    const search = new URL(`${API}/search`)
    search.searchParams.set('key', env.youtubeKey)
    search.searchParams.set('part', 'snippet')
    search.searchParams.set('type', 'video')
    search.searchParams.set('maxResults', String(Math.min(Number(req.query.limit ?? 12), 25)))
    search.searchParams.set('videoEmbeddable', 'true')
    search.searchParams.set('relevanceLanguage', 'en')
    search.searchParams.set('q', query)

    const r = await fetch(search)
    const json = await r.json()
    if (!r.ok) {
      return res.status(502).json({
        error: 'youtube_error',
        status: r.status,
        message: json?.error?.message ?? 'YouTube rejected the request.',
      })
    }

    const ids = (json.items ?? []).map((i) => i.id?.videoId).filter(Boolean)
    const details = ids.length ? await fetchDetails(ids) : new Map()

    res.json({
      source: 'youtube',
      query,
      videos: (json.items ?? []).map((i) => {
        const id = i.id.videoId
        const d = details.get(id) ?? {}
        return {
          id,
          title: i.snippet.title,
          description: i.snippet.description,
          channelId: i.snippet.channelId,
          channelTitle: i.snippet.channelTitle,
          publishedAt: i.snippet.publishedAt,
          thumbnail: i.snippet.thumbnails?.medium?.url ?? i.snippet.thumbnails?.default?.url ?? null,
          durationIso: d.duration ?? null,
          viewCount: d.viewCount ?? null,
          url: `https://www.youtube.com/watch?v=${id}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
        }
      }),
    })
  } catch (err) {
    res.status(502).json({ error: 'network', message: err.message })
  }
})

youtube.get('/channel/:id', async (req, res) => {
  if (!has(env.youtubeKey)) return setupRequired(res)
  try {
    const url = new URL(`${API}/channels`)
    url.searchParams.set('key', env.youtubeKey)
    url.searchParams.set('part', 'snippet,statistics')
    url.searchParams.set('id', req.params.id)
    const r = await fetch(url)
    const json = await r.json()
    if (!r.ok || !json.items?.length) {
      return res.status(404).json({ error: 'not_found', message: json?.error?.message ?? 'Channel not found.' })
    }
    const c = json.items[0]
    res.json({
      id: c.id,
      title: c.snippet.title,
      description: c.snippet.description,
      thumbnail: c.snippet.thumbnails?.default?.url ?? null,
      subscriberCount: c.statistics?.subscriberCount ?? null,
      videoCount: c.statistics?.videoCount ?? null,
      url: `https://www.youtube.com/channel/${c.id}`,
    })
  } catch (err) {
    res.status(502).json({ error: 'network', message: err.message })
  }
})

async function fetchDetails(ids) {
  const url = new URL(`${API}/videos`)
  url.searchParams.set('key', env.youtubeKey)
  url.searchParams.set('part', 'contentDetails,statistics')
  url.searchParams.set('id', ids.join(','))
  const r = await fetch(url)
  if (!r.ok) return new Map()
  const json = await r.json()
  return new Map((json.items ?? []).map((i) => [i.id, {
    duration: i.contentDetails?.duration ?? null,
    viewCount: i.statistics?.viewCount ?? null,
  }]))
}

function pickQuery(goals) {
  const pool = goals.flatMap((g) => GOAL_QUERIES[g] ?? [])
  if (!pool.length) return 'evidence based health and fitness'
  return pool[Math.floor(Math.random() * pool.length)]
}
