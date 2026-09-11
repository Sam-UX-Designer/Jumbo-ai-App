import { Router } from 'express'
import { env, has } from '../lib/env.js'
import { GOAL_TOPIC, curatedVideos } from '../lib/creators.js'

export const youtube = Router()

const API = 'https://www.googleapis.com/youtube/v3'

/**
 * Explore reads real YouTube content by one of two routes.
 *
 *   1. YOUTUBE_API_KEY set  — live Data API v3 search, the widest discovery.
 *   2. no key, or the API failed — the curated creators' own public channel
 *      feeds, which need no key.
 *
 * Both return genuine, current videos. Nothing here is fixture data: if both
 * routes come up empty the response says so rather than inventing a feed.
 */

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
  const q = String(req.query.q ?? '').trim()
  const goals = String(req.query.goals ?? '').split(',').filter(Boolean)
  const topic = String(req.query.topic ?? '').trim() || goals.map((g) => GOAL_TOPIC[g]).find(Boolean) || null
  const limit = Math.min(Number(req.query.limit ?? 14) || 14, 25)
  const query = q || pickQuery(goals)

  // ── 1. Live search, when a key is configured ──────────────────────────
  if (has(env.youtubeKey)) {
    try {
      const videos = await apiSearch({ query, limit })
      if (videos.length) return res.json({ source: 'youtube', query, videos })
    } catch (err) {
      // Fall through: the curated feeds are a real second route, not a stub.
      console.warn('[youtube] search failed, using curated feeds:', err.message)
    }
  }

  // ── 2. The curated creators' own public feeds ─────────────────────────
  try {
    const videos = await curatedVideos({ topic, query: q, limit })
    if (videos.length) {
      return res.json({ source: 'curated', query: q || topic || 'Recommended', videos })
    }
    if (q) {
      // A genuine no-match, not a failure. Say so with an empty list.
      return res.json({ source: 'curated', query: q, videos: [] })
    }
  } catch (err) {
    console.warn('[youtube] curated feeds failed:', err.message)
  }

  res.status(502).json({
    error: 'youtube_unreachable',
    message: 'Videos could not be loaded just now.',
  })
})

/** YouTube Data API v3 search, plus a second call for duration and views. */
async function apiSearch({ query, limit }) {
  const search = new URL(`${API}/search`)
  search.searchParams.set('key', env.youtubeKey)
  search.searchParams.set('part', 'snippet')
  search.searchParams.set('type', 'video')
  search.searchParams.set('maxResults', String(limit))
  search.searchParams.set('videoEmbeddable', 'true')
  search.searchParams.set('relevanceLanguage', 'en')
  search.searchParams.set('q', query)

  const r = await fetch(search)
  const json = await r.json()
  if (!r.ok) throw new Error(json?.error?.message ?? `status ${r.status}`)

  const ids = (json.items ?? []).map((i) => i.id?.videoId).filter(Boolean)
  const details = ids.length ? await fetchDetails(ids) : new Map()

  return (json.items ?? []).filter((i) => i.id?.videoId).map((i) => {
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
  })
}

youtube.get('/channel/:id', async (req, res) => {
  if (!has(env.youtubeKey)) {
    return res.status(404).json({ error: 'not_found', message: 'Channel details are unavailable.' })
  }
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
