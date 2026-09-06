import { useCallback, useEffect, useMemo, useState } from 'react'
import { AiOrb, Icon } from '../components/Icon'
import {
  Empty, ErrorNotice, ScreenHead, SectionHead, Segmented, SetupNotice, Sheet, useToast,
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

const TOPICS = [
  'zone 2 training', 'strength after 40', 'sleep and HRV', 'protein and lean mass',
  'VO2 max and healthspan', 'deload weeks', 'hip mobility', 'reading a lipid panel',
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

  const goals = state.goals.length ? state.goals : (['fitness'] as GoalKey[])
  const personalise = state.settings.creatorPersonalisation

  const load = useCallback(async (q?: string) => {
    setLoading(true)
    setProblem(null)
    const r = await api.youtube({
      q: q || undefined,
      goals: personalise && !q ? goals : undefined,
      limit: 14,
    })
    setLoading(false)
    if (r.ok) {
      setVideos(r.data.videos)
      setResolvedQuery(r.data.query)
    } else {
      setVideos([])
      setProblem(
        r.kind === 'setup'
          ? { kind: 'setup', message: r.message, missing: r.missing, docs: r.docs }
          : { kind: 'error', message: r.kind === 'offline' ? 'Jumbo’s API is not reachable, so nothing can be fetched from YouTube.' : r.message },
      )
    }
  }, [goals, personalise])

  useEffect(() => { void load() }, [load])

  const followed = state.followedChannels
  const followedVideos = useMemo(() => videos.filter((v) => followed.includes(v.channelId)), [videos, followed])
  const savedVideos = useMemo(() => videos.filter((v) => state.savedVideos.includes(v.id)), [videos, state.savedVideos])

  const shown = tab === 'for-you' ? videos : tab === 'saved' ? savedVideos : followedVideos

  return (
    <div className="stack stack-10">
      <ScreenHead
        eyebrow="Explore"
        title="Learn from people, not from Jumbo"
        sub="Real videos from YouTube, chosen against your goals. Their views are their own. Jumbo does not endorse them and does not treat them as evidence."
      />

      <form
        className="row" style={{ gap: 'var(--s-2)' }}
        onSubmit={(e) => { e.preventDefault(); haptic('selection'); void load(query.trim()) }}
      >
        <input
          className="input grow" value={query} placeholder="Search health and fitness videos"
          aria-label="Search videos" onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn btn--primary none" type="submit">Search</button>
      </form>

      <div className="rail" role="group" aria-label="Suggested topics">
        {TOPICS.map((t) => (
          <button key={t} className="chip" onClick={() => { setQuery(t); haptic('selection'); void load(t) }}>
            {t}
          </button>
        ))}
      </div>

      <Segmented
        ariaLabel="Explore section"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: 'for-you', label: 'For you' },
          { value: 'saved', label: `Saved ${state.savedVideos.length}` },
          { value: 'following', label: `Following ${followed.length}` },
        ]}
      />

      <div className="notice" role="note">
        <Icon name="info" size={18} style={{ color: 'var(--ink-2)', flex: 'none', marginTop: 2 }} />
        <p className="t-caption dim">
          Everything here is third-party content. A large audience is not a qualification and
          popularity is not evidence. Nothing in Explore feeds your insights or your Future.
        </p>
      </div>

      {problem?.kind === 'setup' && (
        <SetupNotice
          title="Explore is not connected to YouTube"
          message={problem.message}
          missing={problem.missing}
          docs={problem.docs}
        />
      )}
      {problem?.kind === 'error' && (
        <ErrorNotice title="Could not reach YouTube" message={problem.message} onRetry={() => void load(query.trim())} />
      )}

      {tab === 'for-you' && !problem && (
        <div className="row row--top card card--brand" style={{ gap: 'var(--s-3)' }}>
          <AiOrb size="sm" />
          <p className="t-callout">
            {personalise
              ? <>Searched for <span className="strong">“{resolvedQuery || query}”</span> because your goals are {goals.map((g) => GOAL_LABEL[g]).join(', ').toLowerCase()}.</>
              : <>Personalisation is off, so this is a general search. Turn it on in Profile to match your goals.</>}
          </p>
        </div>
      )}

      <section className="section">
        <SectionHead
          title={tab === 'for-you' ? 'Videos' : tab === 'saved' ? 'Saved' : 'From people you follow'}
          sub={tab === 'for-you' && shown.length ? `${shown.length} results` : undefined}
        />

        {loading ? (
          <ul className="stack stack-3">
            {[0, 1, 2, 3].map((i) => <li key={i} className="skeleton" style={{ height: 92 }} />)}
          </ul>
        ) : shown.length === 0 ? (
          <Empty
            icon="explore"
            title={
              problem ? 'Nothing to show yet'
                : tab === 'saved' ? 'Nothing saved yet'
                : tab === 'following' ? 'Not following anyone yet'
                : 'No results'
            }
            body={
              problem ? 'Once YouTube is connected, real videos appear here. Jumbo will not invent them.'
                : tab === 'saved' ? 'Save a video and it collects here.'
                : tab === 'following' ? 'Follow a channel and its videos appear here.'
                : 'Try a different search.'
            }
          />
        ) : (
          <ul className="stack stack-3 stagger">
            {shown.map((v) => (
              <VideoRow
                key={v.id}
                video={v}
                saved={state.savedVideos.includes(v.id)}
                following={followed.includes(v.channelId)}
                onOpen={() => setOpen(v)}
                onSave={() => {
                  haptic('impactLight')
                  dispatch({ type: 'toggleSavedVideo', videoId: v.id })
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
          {video.thumbnail
            ? <img src={video.thumbnail} alt="" width={100} height={72}
                style={{ width: 100, height: 72, objectFit: 'cover', borderRadius: 'var(--r-input)' }} loading="lazy" />
            : <span style={{ width: 100, height: 72, borderRadius: 'var(--r-input)', background: 'var(--surface-3)', display: 'block' }} />}
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
        <Icon name={saved ? 'check' : 'plus'} size={19} />
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
