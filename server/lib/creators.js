/**
 * Explore's curated creators.
 *
 * This file contains no video data. It names real, public YouTube channels by
 * their public handle; everything shown in Explore — video ids, titles,
 * thumbnails, view counts, publish dates — is read live from YouTube's own
 * public feed for that channel. Nothing is written by hand and nothing is
 * invented, so a creator whose feed cannot be read is simply left out rather
 * than filled in.
 *
 * The feed endpoint needs no API key, which is what makes Explore work before
 * YOUTUBE_API_KEY is configured. With a key, the route prefers live search.
 */

/** Public handles, with the topics each one is a reasonable source for. */
export const CREATORS = [
  { handle: 'hubermanlab',             name: 'Huberman Lab',             topics: ['sleep', 'longevity', 'mental', 'fitness'] },
  { handle: 'PeterAttiaMD',            name: 'Peter Attia MD',           topics: ['longevity', 'fitness', 'nutrition'] },
  { handle: 'JeffNippard',             name: 'Jeff Nippard',             topics: ['fitness', 'nutrition'] },
  { handle: 'RenaissancePeriodization', name: 'Renaissance Periodization', topics: ['fitness', 'nutrition'] },
  { handle: 'TheRunningChannel',       name: 'The Running Channel',      topics: ['fitness', 'vo2max'] },
  { handle: 'nutritionmadesimple',     name: 'Nutrition Made Simple!',   topics: ['nutrition', 'longevity'] },
  { handle: 'TheMovementSystem',       name: 'The Movement System',      topics: ['fitness', 'vo2max'] },
  { handle: 'SleepDoctor',             name: 'The Sleep Doctor',         topics: ['sleep'] },
]

/** Words that decide whether a video belongs to a topic chip. */
const TOPIC_WORDS = {
  sleep:     ['sleep', 'insomnia', 'circadian', 'nap', 'rest', 'melatonin', 'bedtime'],
  fitness:   ['train', 'workout', 'strength', 'muscle', 'cardio', 'run', 'lift', 'exercise', 'zone 2'],
  nutrition: ['protein', 'diet', 'nutrition', 'food', 'eat', 'carb', 'fat loss', 'calorie', 'supplement'],
  longevity: ['longevity', 'healthspan', 'aging', 'ageing', 'lifespan', 'live longer', 'vo2'],
  mental:    ['stress', 'anxiety', 'focus', 'dopamine', 'mood', 'mental', 'motivation', 'habit'],
  vo2max:    ['vo2', 'aerobic', 'endurance', 'cardio', 'zone 2', 'running'],
}

const FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id='
const CHANNEL_PAGE = 'https://www.youtube.com/@'

/** Resolved handle → channel id. Channel ids never change, so this is safe. */
const channelIds = new Map()
/** Parsed feeds, refreshed on the interval below. */
const feedCache = new Map()
const FEED_TTL_MS = 30 * 60 * 1000

async function get(url, signal) {
  const r = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JumboExplore/1.0)', 'Accept-Language': 'en' },
  })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.text()
}

/**
 * Turns a public handle into its channel id by reading the channel's own
 * page. Returns null rather than guessing when the page cannot be read.
 */
async function resolveChannelId(handle, signal) {
  if (channelIds.has(handle)) return channelIds.get(handle)
  try {
    const html = await get(`${CHANNEL_PAGE}${handle}`, signal)
    const id = html.match(/"(?:channelId|externalId)":"(UC[A-Za-z0-9_-]{22})"/)?.[1]
      ?? html.match(/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1]
      ?? null
    if (id) channelIds.set(handle, id)
    return id
  } catch {
    return null
  }
}

/** One `<entry>` from the channel feed, as the client's video shape. */
function parseEntries(xml, creator) {
  const out = []
  for (const block of xml.split('<entry>').slice(1)) {
    const id = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]
    const channelId = block.match(/<yt:channelId>([^<]+)<\/yt:channelId>/)?.[1]
    const title = block.match(/<media:title>([\s\S]*?)<\/media:title>/)?.[1]
      ?? block.match(/<title>([\s\S]*?)<\/title>/)?.[1]
    if (!id || !title) continue

    out.push({
      id,
      title: decode(title),
      description: decode(block.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1] ?? '').slice(0, 400),
      channelId: channelId ?? null,
      channelTitle: decode(block.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/)?.[1] ?? creator.name),
      publishedAt: block.match(/<published>([^<]+)<\/published>/)?.[1] ?? null,
      // Deterministic from the video id — YouTube's own still, not a guess.
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      // The feed carries no duration. Null, rather than an invented one.
      durationIso: null,
      viewCount: block.match(/<media:statistics\s+views="(\d+)"/)?.[1] ?? null,
      url: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    })
  }
  return out
}

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .trim()

async function creatorVideos(creator, signal) {
  const cached = feedCache.get(creator.handle)
  if (cached && Date.now() - cached.at < FEED_TTL_MS) return cached.videos

  const channelId = await resolveChannelId(creator.handle, signal)
  if (!channelId) return []
  try {
    const videos = parseEntries(await get(`${FEED}${channelId}`, signal), creator)
    feedCache.set(creator.handle, { at: Date.now(), videos })
    return videos
  } catch {
    return cached?.videos ?? []
  }
}

const matchesTopic = (video, topic) => {
  const words = TOPIC_WORDS[topic]
  if (!words) return true
  const hay = `${video.title} ${video.description}`.toLowerCase()
  return words.some((w) => hay.includes(w))
}

const matchesQuery = (video, terms) => {
  const hay = `${video.title} ${video.description} ${video.channelTitle}`.toLowerCase()
  return terms.every((t) => hay.includes(t))
}

/**
 * The curated feed. Creators are read in parallel and interleaved so the
 * result is not three videos from whoever published most recently.
 *
 * `topic` narrows by subject, `query` by free text. Both filter what the
 * creators actually published; neither can conjure a video that does not
 * exist, so an over-narrow search legitimately returns nothing.
 */
export async function curatedVideos({ topic = null, query = '', limit = 14, timeoutMs = 6000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const pool = topic && topic !== 'for-you'
    ? CREATORS.filter((c) => c.topics.includes(topic))
    : CREATORS
  const chosen = pool.length ? pool : CREATORS

  let lists
  try {
    lists = await Promise.all(chosen.map((c) => creatorVideos(c, controller.signal).catch(() => [])))
  } finally {
    clearTimeout(timer)
  }

  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
  const filtered = lists.map((videos) => videos.filter((v) => {
    if (terms.length && !matchesQuery(v, terms)) return false
    if (topic && topic !== 'for-you' && !matchesTopic(v, topic)) return false
    return true
  }))

  // Round-robin across creators: one each, then a second each, and so on.
  const out = []
  for (let i = 0; out.length < limit; i += 1) {
    const before = out.length
    for (const videos of filtered) {
      if (videos[i]) out.push(videos[i])
      if (out.length >= limit) break
    }
    if (out.length === before) break
  }
  return out
}

/**
 * The latest videos from specific channels, by channel id.
 *
 * Explore's "Following" tab is a list of channel ids the person collected
 * from videos they saw. Those ids address YouTube's own public feed directly,
 * so the tab shows what those channels have actually published rather than
 * whichever of their videos happen to be in the current search — and it needs
 * no API key, like the curated feeds above.
 */
export async function channelVideos({ channelIds: ids = [], limit = 14, timeoutMs = 6000 } = {}) {
  const wanted = ids.filter((id) => /^UC[A-Za-z0-9_-]{22}$/.test(id)).slice(0, 12)
  // Nothing to ask for is not a failure to reach anything.
  if (!wanted.length) return { videos: [], unreachable: false }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let read
  try {
    read = await Promise.all(wanted.map(async (id) => {
      // Prefixed so a channel id can never collide with a creator handle.
      const key = `ch:${id}`
      const cached = feedCache.get(key)
      if (cached && Date.now() - cached.at < FEED_TTL_MS) return { ok: true, videos: cached.videos }
      try {
        // The feed names the channel, so nothing has to be supplied for it.
        const videos = parseEntries(await get(`${FEED}${id}`, controller.signal), { name: '' })
        feedCache.set(key, { at: Date.now(), videos })
        return { ok: true, videos }
      } catch {
        // A stale copy is still real; only a channel with nothing cached is
        // genuinely unread.
        return cached ? { ok: true, videos: cached.videos } : { ok: false, videos: [] }
      }
    }))
  } finally {
    clearTimeout(timer)
  }

  // Newest first across all of them, which is what a subscription feed is.
  const videos = read.flatMap((r) => r.videos)
    .sort((a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')))
    .slice(0, limit)

  // Not one feed could be read. That is a failure to report, not a person
  // whose creators have published nothing.
  return { videos, unreachable: read.every((r) => !r.ok) }
}

/** The topic a goal maps to, for the "For you" search. */
export const GOAL_TOPIC = {
  energy: 'mental', fitness: 'fitness', sleep: 'sleep',
  nutrition: 'nutrition', aging: 'longevity', consistency: 'fitness',
}
