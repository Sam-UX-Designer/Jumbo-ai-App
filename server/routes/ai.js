import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { env, has } from '../lib/env.js'
import { GeminiError, generateJson, geminiConfigured } from '../lib/gemini.js'

export const ai = Router()

const client = has(env.anthropicKey) ? new Anthropic({ apiKey: env.anthropicKey }) : null

const setupRequired = (res, feature, missing = ['ANTHROPIC_API_KEY']) =>
  res.status(501).json({
    error: 'setup_required',
    feature,
    missing,
    message:
      'Jumbo’s AI runs on the Claude API. Set ANTHROPIC_API_KEY on the server to turn it on. Until then this feature is off — it is not being simulated.',
    docs: 'https://platform.claude.com/docs',
  })

/** Forced structured output: Claude must answer through the tool's schema. */
async function structured({ system, content, tool, maxTokens = 4000, effort = 'high' }) {
  const response = await client.messages.create({
    model: env.anthropicModel,
    max_tokens: maxTokens,
    system,
    thinking: { type: 'adaptive' },
    output_config: { effort },
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content }],
  })

  if (response.stop_reason === 'refusal') {
    const err = new Error(response.stop_details?.explanation || 'The model declined this request.')
    err.code = 'refusal'
    throw err
  }
  const block = response.content.find((b) => b.type === 'tool_use')
  if (!block) throw new Error('The model did not return a structured result.')
  return { data: block.input, usage: response.usage }
}

/* ============================================================ food vision */

const MEAL_TOOL = {
  name: 'record_meal',
  description: 'Record the foods visible in a photograph of a meal, with an explicit confidence for each item.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      dish: { type: 'string', description: 'A short name for the plate as a whole.' },
      readable: {
        type: 'boolean',
        description: 'False when the photo is too dark, blurred or cropped to identify food reliably.',
      },
      caveat: {
        type: 'string',
        description: 'A plain-language reason the estimate is uncertain, or an empty string when it is not.',
      },
      alternatives: {
        type: 'array',
        description: 'Up to three plausible alternative readings, phrased as "X instead of Y".',
        items: { type: 'string' },
      },
      items: {
        type: 'array',
        description: 'One entry per distinguishable food. Empty when nothing edible is visible.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            portion: { type: 'string', description: 'How the portion was judged, e.g. "about 150 g" or "1 medium".' },
            grams: { type: 'number' },
            kcal: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
            confidence: { type: 'number', description: '0 to 1. Be honest and do not inflate.' },
          },
          required: ['name', 'portion', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'confidence'],
        },
      },
    },
    required: ['dish', 'readable', 'caveat', 'alternatives', 'items'],
  },
}

const FOOD_SYSTEM = `You estimate the nutritional content of a meal from a single photograph for a wellness app.

Rules you must follow:
- Identify only what you can actually see. Never add a food because it commonly accompanies another.
- Portion size from one photograph is genuinely uncertain. Say so through the confidence values rather than by guessing precisely.
- Oils, butter, dressings and sauces are usually invisible. If you include one, give it a low confidence and mention it in the caveat.
- If the image is dark, blurred, heavily cropped, or does not contain food, set readable to false and return an empty items array.
- Confidence is per item and must reflect real uncertainty. A clear, unambiguous food may be above 0.9. A food you are inferring from shape or colour alone should be below 0.6.
- The person will review and correct everything you return, so an honest low-confidence answer is more useful than a confident wrong one.`

ai.post('/food', async (req, res) => {
  if (!client) return setupRequired(res, 'meal photo analysis')

  const { imageBase64, mediaType = 'image/jpeg', note } = req.body ?? {}
  if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
    return res.status(400).json({ error: 'bad_image', message: 'No usable image was received.' })
  }
  if (imageBase64.length > 8_000_000) {
    return res.status(413).json({ error: 'image_too_large', message: 'That photo is too large. Try again at a lower resolution.' })
  }

  const content = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
    {
      type: 'text',
      text: note?.trim()
        ? `Identify the foods in this photograph. The person added: "${String(note).slice(0, 200)}"`
        : 'Identify the foods in this photograph.',
    },
  ]

  try {
    const { data } = await structured({ system: FOOD_SYSTEM, content, tool: MEAL_TOOL, maxTokens: 3000 })
    const items = (data.items ?? []).map((i, idx) => ({
      id: `ai-${Date.now()}-${idx}`,
      name: i.name,
      portion: i.portion,
      grams: Math.max(0, Math.round(i.grams)),
      kcal: Math.max(0, Math.round(i.kcal)),
      protein: round1(i.protein),
      carbs: round1(i.carbs),
      fat: round1(i.fat),
      confidence: clamp01(i.confidence),
    }))
    res.json({
      source: 'claude',
      model: env.anthropicModel,
      dish: data.dish,
      readable: data.readable !== false,
      caveat: data.caveat || null,
      alternatives: (data.alternatives ?? []).slice(0, 3),
      items,
      confidence: items.length ? items.reduce((a, i) => a + i.confidence, 0) / items.length : 0,
    })
  } catch (err) {
    handleAiError(res, err, 'meal photo analysis')
  }
})

/* ============================================================== insights */

const INSIGHT_TOOL = {
  name: 'report_insights',
  description: 'Report patterns found in one person’s own health data.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      insights: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            domain: { type: 'string', enum: ['sleep', 'movement', 'nutrition', 'recovery', 'body'] },
            changed: { type: 'string', description: 'What changed, with the actual numbers from the data.' },
            why: { type: 'string', description: 'Why it matters to this person, in two sentences at most.' },
            evidence: { type: 'array', items: { type: 'string' }, description: 'Two to four specific figures drawn from the data provided.' },
            confidence: { type: 'number', description: '0 to 1, reflecting how strongly the data supports this.' },
            limitation: { type: 'string', description: 'What this pattern cannot tell them.' },
            options: { type: 'array', items: { type: 'string' }, description: 'Two or three things they could do, including doing nothing.' },
            window: { type: 'string', description: 'The observation window, e.g. "Last 28 days".' },
          },
          required: ['id', 'domain', 'changed', 'why', 'evidence', 'confidence', 'limitation', 'options', 'window'],
        },
      },
    },
    required: ['insights'],
  },
}

const INSIGHT_SYSTEM = `You are the analysis layer of Jumbo, a wellness companion. You are given a statistical summary of one person's own health data and you report patterns you can actually see in it.

Rules:
- Every number you state must come from the summary provided. Never invent a figure.
- Report between two and five insights. Fewer is better than padding.
- At least one insight should be positive or neutral when the data supports it. You are a collaborator, not an alarm.
- Confidence must reflect the strength of evidence: a clear multi-week trend with a supporting correlation is high; a weak association across a handful of days is low.
- Always state a real limitation, including what is not measured at all.
- Options must include the choice to do nothing.
- Never diagnose, never name a condition, never imply medical certainty. If something in the data looks clinically concerning, the only appropriate option is to raise it with a clinician.
- Write plainly. No jargon, no motivational filler.`

ai.post('/insights', async (req, res) => {
  if (!client) return setupRequired(res, 'pattern analysis')
  const { summary } = req.body ?? {}
  if (!summary || typeof summary !== 'object') {
    return res.status(400).json({ error: 'bad_summary' })
  }

  try {
    const { data } = await structured({
      system: INSIGHT_SYSTEM,
      content: [{ type: 'text', text: `Here is the summary of this person's data:\n\n${JSON.stringify(summary, null, 2)}` }],
      tool: INSIGHT_TOOL,
      maxTokens: 6000,
    })
    res.json({
      source: 'claude',
      model: env.anthropicModel,
      insights: (data.insights ?? []).map((i) => ({ ...i, confidence: clamp01(i.confidence), createdAt: Date.now() })),
    })
  } catch (err) {
    handleAiError(res, err, 'pattern analysis')
  }
})

/* ================================================================ future */

const FUTURE_TOOL = {
  name: 'describe_future',
  description: 'Describe how a person’s everyday life could feel if a pattern of habits continued.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      headline: { type: 'string', description: 'One sentence naming the direction of travel. No numbers.' },
      lifeStory: {
        type: 'array',
        description: 'Three to four short paragraphs about how ordinary days could feel: energy, sleep, what their body can do, how recovery feels. Concrete and everyday, never clinical.',
        items: { type: 'string' },
      },
      whatDrivesIt: {
        type: 'array',
        description: 'The two or three habits doing most of the work in this scenario, each with one sentence saying why.',
        items: { type: 'string' },
      },
      honestly: {
        type: 'string',
        description: 'What this projection genuinely cannot know about their life.',
      },
      confidence: { type: 'number', description: '0 to 1. Longer horizons and bigger behaviour changes deserve lower confidence.' },
    },
    required: ['headline', 'lifeStory', 'whatDrivesIt', 'honestly', 'confidence'],
  },
}

const FUTURE_SYSTEM = `You narrate the "what could this look like" part of Jumbo, a wellness companion.

You are given someone's current baseline, a set of habits they are considering, and a simple model's numeric projection. Your job is to describe what everyday life could feel like under that pattern.

Rules:
- Write about lived experience: energy through the afternoon, how stairs feel, how quickly they recover from a hard week, how mornings go. Not clinical outcomes.
- Never state or imply life expectancy, mortality, disease risk, or a medical prognosis. Never use fear.
- Never present the projection as what will happen. Use conditional language throughout: could, tends to, is likely to feel.
- Ground the story in the numbers you were given, but do not recite them.
- If the scenario is barely different from their current pattern, say so plainly rather than manufacturing drama.
- Keep each paragraph under 45 words. Warm, precise, never gushing.`

ai.post('/future', async (req, res) => {
  if (!client) return setupRequired(res, 'future scenarios')
  const { baseline, levers, projection, horizonMonths } = req.body ?? {}
  if (!baseline || !levers || !projection) return res.status(400).json({ error: 'bad_scenario' })

  try {
    const { data } = await structured({
      system: FUTURE_SYSTEM,
      content: [{
        type: 'text',
        text: [
          `Horizon: ${horizonMonths} months.`,
          `Current baseline:\n${JSON.stringify(baseline, null, 2)}`,
          `Habits in this scenario:\n${JSON.stringify(levers, null, 2)}`,
          `The model's numeric projection:\n${JSON.stringify(projection, null, 2)}`,
        ].join('\n\n'),
      }],
      tool: FUTURE_TOOL,
      maxTokens: 3000,
      effort: 'medium',
    })
    res.json({ source: 'claude', model: env.anthropicModel, ...data, confidence: clamp01(data.confidence) })
  } catch (err) {
    handleAiError(res, err, 'future scenarios')
  }
})

/* ================================================================== chat */

/**
 * Ask Jumbo's answer shape. Gemini is asked for JSON against this schema, so
 * the conversation UI always receives the same three fields.
 */
const CHAT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: {
      type: 'STRING',
      description:
        'The reply, in plain prose. Lead with the useful conclusion, then the reasoning. '
        + 'Two or three short paragraphs, separated by a blank line. No headings, no bullet lists.',
    },
    followUps: {
      type: 'ARRAY',
      description: 'Up to three short questions this person might naturally ask next. Empty when none fit.',
      items: { type: 'STRING' },
    },
    groundedIn: {
      type: 'ARRAY',
      description: 'The figures from the summary you actually used. Empty when the answer needed none.',
      items: { type: 'STRING' },
    },
  },
  required: ['answer', 'followUps', 'groundedIn'],
  propertyOrdering: ['answer', 'followUps', 'groundedIn'],
}

const CHAT_SYSTEM = `You are Jumbo, a wellness and longevity companion, talking with one person about their own health data. You are not a clinician and Jumbo is not a medical device.

You are given a statistical summary of this person's data. It contains no name, no phone number, no notes and no photographs.

How to answer:
- Lead with the useful conclusion. Explanation comes after it, not before.
- Every figure you state must come from the summary you were given. If the summary does not contain what the question needs, say plainly which data is missing and what would fill the gap.
- Never invent a health record, a measurement, or a history. Never imply data exists when it does not. If the summary is silent on something, say so rather than reasoning from a typical person.
- Separate what was measured from what research suggests in general from what Jumbo estimated. Say which you are doing.
- Show uncertainty where it exists. A weak signal described confidently is a failure.
- Offer options, not orders, and make clear the choice is theirs.
- Be warm and brief. Two or three short paragraphs is usually right. This is a conversation, not a report.
- Write prose. Separate paragraphs with a blank line. Do not use headings or bullet points.

Hard limits:
- No diagnosis, no disease prediction, no claims about life expectancy or how long someone will live.
- If asked to diagnose or to predict lifespan, say directly that you cannot and will not, then offer what you can actually help with.
- If someone describes symptoms that worry them, tell them plainly to speak to a clinician. Do not attempt to reassure them out of it.`

ai.post('/chat', async (req, res) => {
  if (!geminiConfigured()) return setupRequired(res, 'Ask Jumbo', ['GEMINI_API_KEY'])

  const { question, summary, history, goals } = req.body ?? {}
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'no_question', message: 'There was no question to answer.' })
  }

  // The conversation is replayed so Jumbo keeps context, capped so a long
  // session cannot grow the request without bound.
  const turns = Array.isArray(history) ? history.slice(-10) : []
  const contents = [
    ...turns
      .filter((t) => typeof t?.text === 'string' && t.text.trim())
      .map((t) => ({
        role: t.role === 'jumbo' ? 'model' : 'user',
        parts: [{ text: String(t.text).slice(0, 4000) }],
      })),
    {
      role: 'user',
      parts: [{
        text: [
          goals?.length ? `Their stated goals: ${goals.join(', ')}.` : 'They have not set any goals yet.',
          `A statistical summary of their data:\n${JSON.stringify(summary ?? {}, null, 2)}`,
          `Their question: ${question.slice(0, 2000)}`,
        ].join('\n\n'),
      }],
    },
  ]

  // The thread has to open on the person's turn.
  while (contents.length > 1 && contents[0].role !== 'user') contents.shift()

  try {
    const data = await generateJson({
      system: CHAT_SYSTEM,
      contents,
      schema: CHAT_SCHEMA,
      maxOutputTokens: 2048,
    })

    res.json({
      source: 'gemini',
      model: env.geminiModel,
      answer: String(data.answer ?? '').trim(),
      followUps: (data.followUps ?? []).slice(0, 3),
      groundedIn: (data.groundedIn ?? []).slice(0, 6),
    })
  } catch (err) {
    if (err instanceof GeminiError) {
      console.error('[ai:Ask Jumbo]', err.code)
      return res.status(err.status).json({ error: err.code, message: err.message })
    }
    handleAiError(res, err, 'Ask Jumbo')
  }
})

/* ================================================================ shared */

function handleAiError(res, err, feature) {
  console.error(`[ai:${feature}]`, err)
  if (err.code === 'refusal') {
    return res.status(422).json({ error: 'declined', message: err.message })
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return res.status(502).json({ error: 'bad_key', message: 'The Claude API key on the server was rejected.' })
  }
  if (err instanceof Anthropic.RateLimitError) {
    return res.status(429).json({ error: 'rate_limited', message: 'Claude is rate limiting requests. Try again shortly.' })
  }
  if (err instanceof Anthropic.APIError) {
    return res.status(502).json({ error: 'upstream', status: err.status, message: err.message })
  }
  res.status(500).json({ error: 'failed', message: err.message })
}

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0))
const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10
