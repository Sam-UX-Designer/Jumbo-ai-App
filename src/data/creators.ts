import type { Creator, Video } from './types'

export const CREATORS: Creator[] = [
  { id: 'c1', name: 'Dr. Elena Marsh',  handle: '@elenamarsh',   field: 'Longevity',  subscribers: '1.4M', hue: 168, bio: 'Physician-scientist translating ageing research for everyday practice.' },
  { id: 'c2', name: 'Kai Nakamura',     handle: '@kailifts',     field: 'Strength',   subscribers: '860K', hue: 268, bio: 'Strength coach. Programming, technique and staying injury-free after 40.' },
  { id: 'c3', name: 'Priya Raman',      handle: '@priyaeats',    field: 'Nutrition',  subscribers: '2.1M', hue: 28,  bio: 'Registered dietitian. Practical food, no fear-mongering.' },
  { id: 'c4', name: 'The Sleep Lab',    handle: '@thesleeplab',  field: 'Sleep',      subscribers: '540K', hue: 232, bio: 'Sleep researchers explaining circadian rhythm and recovery.' },
  { id: 'c5', name: 'Marco Bellini',    handle: '@marcoendure',  field: 'Endurance',  subscribers: '390K', hue: 196, bio: 'Endurance coach. Zone 2, threshold work and pacing.' },
  { id: 'c6', name: 'Nadia Okonkwo',    handle: '@movewithnadia',field: 'Mobility',   subscribers: '720K', hue: 336, bio: 'Movement therapist. Mobility that carries into real life.' },
  { id: 'c7', name: 'Dr. Sam Whitfield',handle: '@labstolife',   field: 'Longevity',  subscribers: '1.1M', hue: 148, bio: 'Turning biomarker panels into decisions you can actually make.' },
  { id: 'c8', name: 'Anna Lindqvist',   handle: '@annastrength', field: 'Strength',   subscribers: '480K', hue: 292, bio: 'Powerlifter turned coach. Minimum effective dose training.' },
]

export const VIDEOS: Video[] = [
  { id: 'v1',  creatorId: 'c4', title: 'Why a consistent bedtime beats a long lie-in', minutes: 12, topics: ['sleep', 'consistency', 'energy'], summary: 'Circadian regularity and why the variance in your bedtime matters more than the average.' },
  { id: 'v2',  creatorId: 'c2', title: 'Two strength sessions a week is enough — here is how', minutes: 18, topics: ['fitness', 'aging', 'consistency'], summary: 'A minimal programme that still builds and keeps lean mass.' },
  { id: 'v3',  creatorId: 'c3', title: 'Protein: how much, and does timing matter?', minutes: 15, topics: ['nutrition', 'fitness', 'aging'], summary: 'What the intake trials actually show, and where the evidence thins out.' },
  { id: 'v4',  creatorId: 'c5', title: 'Zone 2, explained without a lab', minutes: 21, topics: ['fitness', 'energy', 'aging'], summary: 'Finding your easy pace by feel, and why most people run it too hard.' },
  { id: 'v5',  creatorId: 'c1', title: 'VO₂ max and healthspan: reading the evidence', minutes: 24, topics: ['aging', 'fitness'], summary: 'What cardiorespiratory fitness does and does not predict.' },
  { id: 'v6',  creatorId: 'c6', title: 'Ten minutes of hip mobility for desk workers', minutes: 10, topics: ['consistency', 'energy'], summary: 'A short routine you can do without changing clothes.' },
  { id: 'v7',  creatorId: 'c7', title: 'ApoB, LDL and what your panel is telling you', minutes: 19, topics: ['aging', 'nutrition'], summary: 'A calm walk through a standard lipid panel.' },
  { id: 'v8',  creatorId: 'c4', title: 'Recovering from one bad night without wrecking the week', minutes: 9,  topics: ['sleep', 'energy', 'consistency'], summary: 'Practical damage control after short sleep.' },
  { id: 'v9',  creatorId: 'c3', title: 'Building a plate: a repeatable dinner formula', minutes: 13, topics: ['nutrition', 'energy'], summary: 'One structure that adapts to almost any cuisine.' },
  { id: 'v10', creatorId: 'c8', title: 'Deload weeks are training, not time off', minutes: 14, topics: ['fitness', 'consistency', 'aging'], summary: 'How to schedule easier weeks and why they raise long-term output.' },
  { id: 'v11', creatorId: 'c1', title: 'What a good week of movement actually looks like', minutes: 16, topics: ['aging', 'consistency', 'energy'], summary: 'Volume, intensity and the parts most people skip.' },
  { id: 'v12', creatorId: 'c5', title: 'Reading HRV without obsessing over it', minutes: 11, topics: ['fitness', 'sleep', 'energy'], summary: 'Trends beat single days, and what to do with a low reading.' },
]
