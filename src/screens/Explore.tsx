import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Empty, ScreenHead, Segmented, SectionHead, Sheet, useToast } from '../components/UI'
import { useStore } from '../state/store'
import { CREATORS, VIDEOS } from '../data/creators'
import type { Creator, Video } from '../data/types'
import { haptic } from '../lib/haptics'

type Tab = 'for-you' | 'following' | 'discover'

export function Explore() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('for-you')
  const [openVideo, setOpenVideo] = useState<Video | null>(null)

  const goal = state.goal ?? 'energy'
  const personalise = state.settings.creatorPersonalisation

  const forYou = useMemo(() => {
    if (!personalise) return VIDEOS
    return [...VIDEOS].sort((a, b) => {
      const score = (v: Video) =>
        (v.topics.includes(goal) ? 2 : 0) + (state.following.includes(v.creatorId) ? 1 : 0)
      return score(b) - score(a)
    })
  }, [goal, state.following, personalise])

  const followingVideos = VIDEOS.filter((v) => state.following.includes(v.creatorId))

  const toggle = (c: Creator) => {
    haptic('select')
    dispatch({ type: 'toggleFollow', creatorId: c.id })
    toast({
      text: state.following.includes(c.id) ? `Unfollowed ${c.name}` : `Following ${c.name}`,
      icon: state.following.includes(c.id) ? 'unlink' : 'check',
    })
  }

  return (
    <div className="stack stack-8">
      <ScreenHead
        eyebrow="Explore"
        title="Learn from people, not from Jumbo"
        sub="Creators you choose to follow. Their views are their own — Jumbo does not endorse them or treat them as evidence."
      />

      <Segmented
        ariaLabel="Explore section"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: 'for-you', label: 'For you' },
          { value: 'following', label: `Following ${state.following.length}` },
          { value: 'discover', label: 'Creators' },
        ]}
      />

      {/* A standing separation between creator content and Jumbo's own guidance. */}
      <div className="card card--quiet row" style={{ gap: 'var(--s-3)', alignItems: 'flex-start' }}>
        <Icon name="info" size={18} style={{ color: 'var(--ink-2)', flex: 'none', marginTop: 2 }} />
        <p className="t-caption dim">
          Everything in Explore is third-party content. Popularity is not evidence, and a large
          audience is not a qualification. Nothing here feeds your insights or your trajectory.
        </p>
      </div>

      {tab === 'for-you' && (
        <section className="section">
          <SectionHead
            title="Picked for your goal"
            sub={personalise
              ? `Matched to “${goalLabel(goal)}” and the creators you follow.`
              : 'Personalisation is off — showing everything, newest first.'}
          />
          <ul className="stack stack-3">
            {forYou.slice(0, 8).map((v) => (
              <VideoRow key={v.id} video={v} onOpen={() => setOpenVideo(v)} highlight={personalise && v.topics.includes(goal)} />
            ))}
          </ul>
        </section>
      )}

      {tab === 'following' && (
        <section className="section">
          {state.following.length === 0 ? (
            <Empty
              icon="explore" title="Not following anyone yet"
              body="Follow a few creators and their videos collect here."
              action={<button className="btn btn--primary" onClick={() => setTab('discover')}>Browse creators</button>}
            />
          ) : (
            <>
              <SectionHead title="From the people you follow" sub={`${followingVideos.length} videos`} />
              <ul className="stack stack-3">
                {followingVideos.map((v) => (
                  <VideoRow key={v.id} video={v} onOpen={() => setOpenVideo(v)} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {tab === 'discover' && (
        <section className="section">
          <SectionHead title="Creators" sub="Follow to see their videos in For you." />
          <ul className="stack stack-3">
            {CREATORS.map((c) => {
              const following = state.following.includes(c.id)
              return (
                <li key={c.id} className="card row" style={{ gap: 'var(--s-3)' }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 46, height: 46, borderRadius: '50%', flex: 'none',
                      display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 650,
                      background: `linear-gradient(150deg, hsl(${c.hue} 32% 38%), hsl(${(c.hue + 36) % 360} 36% 50%))`,
                    }}
                  >
                    {c.name.split(' ').slice(-1)[0][0]}
                  </span>
                  <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                    <span className="t-callout strong">{c.name}</span>
                    <span className="t-caption dim2">{c.field} · {c.subscribers} subscribers</span>
                    <span className="t-caption dim">{c.bio}</span>
                  </div>
                  <button
                    className={`btn btn--sm ${following ? 'btn--secondary' : 'btn--primary'}`}
                    onClick={() => toggle(c)}
                    aria-pressed={following}
                  >
                    {following ? 'Following' : 'Follow'}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <VideoSheet video={openVideo} onClose={() => setOpenVideo(null)} />
    </div>
  )
}

function VideoRow({ video, onOpen, highlight }: { video: Video; onOpen: () => void; highlight?: boolean }) {
  const creator = CREATORS.find((c) => c.id === video.creatorId)!
  return (
    <li>
      <button className="card row" style={{ gap: 'var(--s-3)', width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={onOpen}>
        <span
          aria-hidden="true"
          style={{
            width: 76, height: 54, borderRadius: 'var(--r-md)', flex: 'none',
            display: 'grid', placeItems: 'center', color: '#fff',
            background: `linear-gradient(140deg, hsl(${creator.hue} 28% 32%), hsl(${(creator.hue + 30) % 360} 32% 46%))`,
          }}
        >
          <Icon name="play" size={20} />
        </span>
        <div className="grow stack" style={{ gap: 3, minWidth: 0 }}>
          <span className="t-callout strong">{video.title}</span>
          <span className="t-caption dim2">{creator.name} · {video.minutes} min</span>
          {highlight && <span className="tag tag--positive" style={{ alignSelf: 'flex-start' }}>Matches your goal</span>}
        </div>
        <Icon name="chevron" size={16} style={{ color: 'var(--ink-3)', flex: 'none' }} />
      </button>
    </li>
  )
}

function VideoSheet({ video, onClose }: { video: Video | null; onClose: () => void }) {
  const toast = useToast()
  if (!video) return null
  const creator = CREATORS.find((c) => c.id === video.creatorId)!

  return (
    <Sheet
      open
      onClose={onClose}
      title={video.title}
      subtitle={`${creator.name} · ${video.minutes} min`}
      footer={
        <>
          <button className="btn btn--secondary grow" onClick={onClose}>Close</button>
          <button
            className="btn btn--primary grow"
            onClick={() => toast({ text: 'This build has no live video connection', icon: 'info', tone: 'warning' })}
          >
            <Icon name="play" size={15} /> Watch on YouTube
          </button>
        </>
      }
    >
      <div className="stack stack-5">
        <div
          style={{
            aspectRatio: '16 / 9', borderRadius: 'var(--r-lg)', display: 'grid', placeItems: 'center',
            color: '#fff', background: `linear-gradient(140deg, hsl(${creator.hue} 28% 30%), hsl(${(creator.hue + 30) % 360} 32% 44%))`,
          }}
        >
          <Icon name="play" size={40} />
        </div>

        <p className="t-body">{video.summary}</p>

        <div className="card card--quiet stack stack-2">
          <span className="eyebrow">Creator content</span>
          <p className="t-caption dim">
            This is {creator.name}’s view, not Jumbo’s. It is not checked against your data and does
            not change your insights or your trajectory.
          </p>
        </div>

        <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
          {video.topics.map((t) => <span key={t} className="tag">{goalLabel(t)}</span>)}
        </div>
      </div>
    </Sheet>
  )
}

function goalLabel(k: string) {
  const map: Record<string, string> = {
    energy: 'More energy', fitness: 'Get fitter', sleep: 'Sleep better',
    nutrition: 'Eat better', aging: 'Healthy ageing', consistency: 'Consistency', custom: 'Your goal',
  }
  return map[k] ?? k
}
