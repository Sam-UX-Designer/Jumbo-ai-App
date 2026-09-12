import { useCallback, useEffect, useMemo, useState } from 'react'
import '../styles/explore.css'
import { AiOrb, Icon } from '../components/Icon'
import { AssetImage } from '../components/Asset'
import {
  Empty, SectionHead, Segmented, Sheet, UnavailableNotice, useToast,
} from '../components/UI'
import { useStore } from '../state/store'
import { api, compactCount, isoDurationMinutes, type YoutubeVideo } from '../lib/api'
import type { GoalKey } from '../data/types'
import { haptic } from '../lib/feedback'

type Tab = 'for-you' | 'saved' | 'following'

const GOAL_LABEL: Record<GoalKey, string> = {
  energy: 'More energy', fitness: 'Get fitter', sleep: 'Sleep better',
  nutrition: 'Eat better', aging: 'Healthy ageing', consistency: 'Be consistent', custom: 'Your goal',
}

/**
 * The topic chips. 'for-you' is the goals-driven search; the rest are real
 * queries sent to YouTube, so a chip always produces genuine results or a
 * genuine error.
 */
const TOPICS: Array<{ id: string; label: string; query: string | null }> = [
  { id: 'for-you',   label: 'For you',   query: null },
  { id: 'sleep',     label: 'Sleep',     query: 'sleep quality and HRV science' },
  { id: 'fitness',   label: 'Fitness',   query: 'strength training and zone 2 for health' },
  { id: 'nutrition', label: 'Nutrition', query: 'protein and nutrition for lean mass' },
  { id: 'longevity', label: 'Longevity', query: 'longevity and healthspan research' },
  { id: 'mental',    label: 'Mental',    query: 'stress, recovery and mental health habits' },
]

type Sort = 'relevant' | 'recent' | 'longest'

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: 'relevant', label: 'Most relevant' },
  { value: 'recent',   label: 'Most recent' },
  { value: 'longest',  label: 'Longest first' },
]

export function Explore() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('for-you')
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState<YoutubeVideo[]>([])
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState<{ kind: 'setup' | 'error'; message: string; missing?: string[]; docs?: string } | null>(null)
  const [open, setOpen] = useState<YoutubeVideo | null>(null)
  const [resolvedQuery, setResolvedQuery] = useState('')
  // True when the results came from the curated creators' own channel feeds
  // rather than a live search. Explore says which, rather than implying one.
  const [curated, setCurated] = useState(false)
  const [topic, setTopic] = useState('for-you')
  const [sort, setSort] = useState<Sort>('relevant')
  const [showFilters, setShowFilters] = useState(false)

  // Memoised: a fresh array here would change `load`'s identity on every
  // render, and the effect below would refetch forever.
  const goals = useMemo(
    () => (state.goals.length ? state.goals : (['fitness'] as GoalKey[])),
    [state.goals],
  )
  const personalise = state.settings.creatorPersonalisation

  const load = useCallback(async (q?: string, topicId?: string) => {
    setLoading(true)
    setProblem(null)
    const r = await api.youtube({
      q: q || undefined,
      topic: topicId && topicId !== 'for-you' ? topicId : undefined,
      goals: personalise && !q ? goals : undefined,
      limit: 14,
    })
    setLoading(false)
    if (r.ok) {
      setVideos(r.data.videos)
      setResolvedQuery(r.data.query)
      setCurated(r.data.source === 'curated')
    } else {
      setVideos([])
      setProblem(
        r.kind === 'setup'
          ? { kind: 'setup', message: r.message, missing: r.missing, docs: r.docs }
          : { kind: 'error', message: r.message },
      )
    }
  }, [goals, personalise])

  useEffect(() => { void load() }, [load])

  const followed = state.followedChannels

  /**
   * What was saved, drawn from the person's own library rather than from
   * whatever the last search returned. An id saved before the video itself
   * was kept still resolves if that video happens to be on screen.
   */
  const savedVideos = useMemo(
    () => state.savedVideos
      .map((id) => state.savedVideoData[id] ?? videos.find((v) => v.id === id))
      .filter((v): v is YoutubeVideo => Boolean(v))
      .reverse(),
    [state.savedVideos, state.savedVideoData, videos],
  )

  /**
   * The followed channels' own feeds, fetched for the tab. Filtering the
   * current results would only ever show the followed creators who happen to
   * be in this search, which is not what following means.
   */
  const [followedVideos, setFollowedVideos] = useState<YoutubeVideo[]>([])
  const [followingLoading, setFollowingLoading] = useState(false)
  /** True when the feeds could not be read — distinct from nothing published. */
  const [followingFailed, setFollowingFailed] = useState(false)
  const [followingNonce, setFollowingNonce] = useState(0)

  useEffect(() => {
    if (tab !== 'following' || !followed.length) {
      setFollowedVideos([]); setFollowingFailed(false); return
    }
    let cancelled = false
    setFollowingLoading(true)
    setFollowingFailed(false)
    void (async () => {
      const r = await api.channels(followed)
      if (cancelled) return
      setFollowingLoading(false)
      setFollowedVideos(r.ok ? (r.data.videos ?? []) : [])
      setFollowingFailed(!r.ok)
    })()
    return () => { cancelled = true }
  }, [tab, followed, followingNonce])

  const pool = tab === 'for-you' ? videos : tab === 'saved' ? savedVideos : followedVideos
  // Saved reads from storage, so only the two fetched tabs can be waiting.
  const busy = tab === 'following' ? followingLoading : tab === 'saved' ? false : loading

  // Sorting is done here, on results YouTube actually returned. Nothing is
  // reordered into existence.
  const shown = useMemo(() => {
    const list = [...pool]
    if (sort === 'recent') {
      list.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    } else if (sort === 'longest') {
      list.sort((a, b) => (isoDurationMinutes(b.durationIso) ?? 0) - (isoDurationMinutes(a.durationIso) ?? 0))
    }
    return list
  }, [pool, sort])

  const featured = tab === 'for-you' ? shown[0] : undefined
  const trending = tab === 'for-you' ? shown.slice(1, 5) : []
  const rest = featured ? shown.slice(5) : shown

  const pickTopic = (t: (typeof TOPICS)[number]) => {
    haptic('selection')
    setTopic(t.id)
    setTab('for-you')
    setQuery('')
    void load(undefined, t.id)
  }

  return (
    <div className="stack stack-5">
      <header className="scr-head">
        <h1 className="scr-head__title">Explore</h1>
        <p className="scr-head__sub">
          Real videos from YouTube, chosen against your goals. Their views are their own.
        </p>
      </header>

      <form
        className="searchbar"
        onSubmit={(e) => { e.preventDefault(); haptic('selection'); setTopic(''); void load(query.trim()) }}
      >
        <Icon name="search" size={18} style={{ color: 'var(--ink-3)', flex: 'none' }} />
        <input
          className="searchbar__input" value={query}
          placeholder="Search videos, topics or creators…"
          aria-label="Search videos, topics or creators"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button" className="icon-btn" aria-label="Clear search"
            onClick={() => { setQuery(''); setTopic('for-you'); void load() }}
          >
            <Icon name="close" size={17} />
          </button>
        )}
        <button
          type="button"
          className={`icon-btn icon-btn--edge${showFilters ? ' is-on' : ''}`}
          aria-label="Filter and sort"
          aria-expanded={showFilters}
          onClick={() => { haptic('selection'); setShowFilters((f) => !f) }}
        >
          <Icon name="filter" size={18} />
        </button>
      </form>

      <div className="rail" role="group" aria-label="Topics">
        {TOPICS.map((t) => (
          <button
            key={t.id} className="chip" aria-pressed={topic === t.id}
            onClick={() => pickTopic(t)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="card card--quiet stack stack-3">
          <span className="eyebrow">Sort results</span>
          <Segmented
            ariaLabel="Sort results"
            value={sort}
            onChange={(v) => { haptic('selection'); setSort(v as Sort) }}
            options={SORTS}
          />
          <p className="t-caption dim2">
            Sorting reorders what YouTube returned. It does not change the search.
          </p>
        </div>
      )}

      <Segmented
        ariaLabel="Explore section"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: 'for-you', label: 'Discover' },
          { value: 'saved', label: `Saved ${state.savedVideos.length}` },
          { value: 'following', label: `Following ${followed.length}` },
        ]}
      />

      <p className="source-note" role="note">
        <Icon name="info" size={15} />
        Third-party content. Popularity is not evidence, and nothing here feeds your insights
        or your Future.
      </p>

      {problem?.kind === 'setup' && (
        <UnavailableNotice
          title="Explore isn’t available right now"
          message="Videos can’t be loaded at the moment. Anything you have saved is still here, and the rest of Jumbo is unaffected."
          onRetry={() => void load(query.trim(), topic)}
        />
      )}
      {tab === 'following' && followingFailed && (
        <UnavailableNotice
          title="Your creators’ videos couldn’t load"
          message="Jumbo couldn’t reach them just now. Anything you have saved is still here."
          onRetry={() => setFollowingNonce((n) => n + 1)}
        />
      )}
      {problem?.kind === 'error' && (
        <UnavailableNotice
          title="Videos couldn’t load"
          message="Explore needs a connection to fetch the latest from your creators. Anything you have saved is still here."
          onRetry={() => void load(query.trim(), topic)}
        />
      )}

      {tab === 'for-you' && !problem && (
        <p className="source-note">
          <AiOrb size="sm" />
          {curated
            ? <>The latest from creators Jumbo follows for {goals.map((g) => GOAL_LABEL[g]).join(', ').toLowerCase()}, pulled from their own channels.</>
            : personalise
              ? <>Searched for <span className="strong" style={{ color: 'var(--ink-2)' }}>“{resolvedQuery || query}”</span> because your goals are {goals.map((g) => GOAL_LABEL[g]).join(', ').toLowerCase()}.</>
              : <>Personalisation is off, so this is a general search. Turn it on in Profile to match your goals.</>}
        </p>
      )}

      {/* ────────────────────────────── the one to watch first */}
      {!loading && featured && (
        <section className="section">
          <SectionHead title="Featured" />
          <button className="feature" onClick={() => setOpen(featured)}>
            <span className="feature__art">
              <AssetImage
                asset="videoThumbnail" src={featured.thumbnail} alt=""
                rounded="none" className="feature__img"
              />
              <span className="feature__badge">Featured</span>
              <span className="feature__play" aria-hidden="true">
                <Icon name="play" size={26} />
              </span>
              {isoDurationMinutes(featured.durationIso) !== null && (
                <span className="feature__len num">{isoDurationMinutes(featured.durationIso)} min</span>
              )}
              <span className="feature__over">
                <span className="feature__title">{featured.title}</span>
                <span className="feature__by">
                  {featured.channelTitle}
                  {compactCount(featured.viewCount) ? ` · ${compactCount(featured.viewCount)} views` : ''}
                </span>
              </span>
            </span>
          </button>
        </section>
      )}

      {/* ────────────────────────────── the next few, at a glance */}
      {!loading && trending.length > 0 && (
        <section className="section">
          <SectionHead title="Trending for you" />
          <ul className="trend-rail">
            {trending.map((v) => (
              <li key={v.id}>
                <button className="trend" onClick={() => setOpen(v)}>
                  <AssetImage
                    asset="videoThumbnail" src={v.thumbnail} alt=""
                    rounded="none" className="trend__img"
                  />
                  <span className="trend__title t-caption strong">{v.title}</span>
                  <span className="t-micro dim2">{v.channelTitle}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <SectionHead
          title={tab === 'for-you' ? 'Recommended videos' : tab === 'saved' ? 'Saved' : 'From people you follow'}
          sub={tab === 'for-you' && shown.length ? `${shown.length} results` : undefined}
          action={
            shown.length > 1 ? (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => { haptic('selection'); setShowFilters((f) => !f) }}
              >
                {SORTS.find((o) => o.value === sort)?.label}
                <Icon name="chevron-down" size={14} />
              </button>
            ) : undefined
          }
        />

        {busy ? (
          <ul className="stack stack-3">
            {[0, 1, 2, 3].map((i) => <li key={i} className="skeleton" style={{ height: 92 }} />)}
          </ul>
        ) : tab === 'following' && followingFailed ? (
          // The notice above already says what happened. Claiming they follow
          // no one on top of it would be wrong as well as unhelpful.
          null
        ) : shown.length === 0 ? (
          <Empty
            icon="explore"
            title={
              problem ? 'Nothing to show yet'
                : tab === 'saved' ? 'Nothing saved yet'
                : tab === 'following' && !followed.length ? 'Not following anyone yet'
                : tab === 'following' ? 'Nothing new from them yet'
                : 'No results'
            }
            body={
              problem ? 'Once YouTube is connected, real videos appear here. Jumbo will not invent them.'
                : tab === 'saved' ? 'Save a video and it stays here, whatever you search for next.'
                : tab === 'following' && !followed.length ? 'Follow a channel and its latest videos appear here.'
                : tab === 'following' ? 'The creators you follow have not posted recently.'
                : 'Try a different search.'
            }
          />
        ) : (
          <ul className="stack stack-3 stagger">
            {(tab === 'for-you' ? rest : shown).map((v) => (
              <VideoRow
                key={v.id}
                video={v}
                saved={state.savedVideos.includes(v.id)}
                following={followed.includes(v.channelId)}
                onOpen={() => setOpen(v)}
                onSave={() => {
                  haptic('impactLight')
                  dispatch({ type: 'toggleSavedVideo', video: v })
                  toast({
                    text: state.savedVideos.includes(v.id) ? 'Removed from saved' : 'Saved',
                    icon: 'check',
                  })
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <VideoSheet
        video={open}
        onClose={() => setOpen(null)}
        following={open ? followed.includes(open.channelId) : false}
        onFollow={() => {
          if (!open) return
          haptic('selection')
          dispatch({ type: 'toggleChannel', channelId: open.channelId })
          toast({
            text: followed.includes(open.channelId) ? `Unfollowed ${open.channelTitle}` : `Following ${open.channelTitle}`,
            icon: followed.includes(open.channelId) ? 'unlink' : 'check',
          })
        }}
      />
    </div>
  )
}

function VideoRow({
  video, saved, following, onOpen, onSave,
}: {
  video: YoutubeVideo
  saved: boolean
  following: boolean
  onOpen: () => void
  onSave: () => void
}) {
  const mins = isoDurationMinutes(video.durationIso)
  const views = compactCount(video.viewCount)
  return (
    <li className="card row" style={{ gap: 'var(--s-3)', padding: 'var(--s-3)' }}>
      <button
        onClick={onOpen}
        className="row grow"
        style={{ gap: 'var(--s-3)', background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0 }}
      >
        <span style={{ position: 'relative', flex: 'none' }}>
          {/* YouTube's own thumbnail when the API gave one, Jumbo's placeholder when it did not. */}
          <AssetImage
            asset="videoThumbnail" src={video.thumbnail} alt="" width={100} height={72}
            rounded="tile" style={{ width: 100, height: 72 }}
          />
          <span style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            color: '#fff', background: 'rgba(0,0,0,.28)', borderRadius: 'var(--r-input)',
          }}>
            <Icon name="play" size={20} />
          </span>
        </span>
        <span className="stack grow" style={{ gap: 3, minWidth: 0 }}>
          <span className="t-callout strong" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {video.title}
          </span>
          <span className="t-caption dim2">
            {video.channelTitle}{mins ? ` · ${mins} min` : ''}{views ? ` · ${views} views` : ''}
          </span>
          {following && <span className="tag tag--live" style={{ alignSelf: 'flex-start' }}>Following</span>}
        </span>
      </button>
      <button
        className="icon-btn none"
        aria-label={saved ? `Remove ${video.title} from saved` : `Save ${video.title}`}
        aria-pressed={saved}
        onClick={onSave}
        style={{ color: saved ? 'var(--brand)' : undefined }}
      >
        <Icon name="bookmark" size={19} style={saved ? { fill: 'currentColor' } : undefined} />
      </button>
    </li>
  )
}

function VideoSheet({
  video, onClose, following, onFollow,
}: { video: YoutubeVideo | null; onClose: () => void; following: boolean; onFollow: () => void }) {
  if (!video) return null
  const mins = isoDurationMinutes(video.durationIso)

  return (
    <Sheet
      open
      onClose={onClose}
      title={video.title}
      subtitle={`${video.channelTitle}${mins ? ` · ${mins} min` : ''}`}
      footer={
        <>
          <button className="btn btn--secondary" onClick={onFollow} aria-pressed={following}>
            {following ? 'Following' : 'Follow'}
          </button>
          <a className="btn btn--primary grow" href={video.url} target="_blank" rel="noreferrer">
            <Icon name="external" size={15} /> Open on YouTube
          </a>
        </>
      }
    >
      <div className="stack stack-5">
        <div style={{ aspectRatio: '16 / 9', borderRadius: 'var(--r-card)', overflow: 'hidden', background: '#000' }}>
          <iframe
            src={video.embedUrl}
            title={video.title}
            style={{ width: '100%', height: '100%', border: 0 }}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>

        {video.description && (
          <p className="t-callout dim" style={{ whiteSpace: 'pre-line' }}>
            {video.description.slice(0, 420)}{video.description.length > 420 ? '…' : ''}
          </p>
        )}

        <div className="card card--quiet stack stack-2">
          <span className="eyebrow">Creator content</span>
          <p className="t-caption dim">
            This is {video.channelTitle}’s view, not Jumbo’s. It is not checked against your data and it
            does not change your insights or your Future.
          </p>
        </div>
      </div>
    </Sheet>
  )
}
