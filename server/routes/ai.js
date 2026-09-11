import { Router } from 'express'
import { env } from '../lib/env.js'
import {
  aiConfigured, aiModels, aiUnavailable, generateJson, image, sendAiError, text,
} from '../lib/ai.js'

export const ai = Router()

/**
 * Every AI feature in Jumbo, on one provider.
 *
 * Each route asks for JSON against a schema and returns the shape the client
 * already expects. None of them invent user data: the prompts are explicit
 * that a figure must come from the summary supplied, and that silence in the
 * data is to be reported as silence.
 */

/* ================================================== meal photographs */

const MEAL_SCHEMA = {
  type: 'object',
  properties: {
    dish: { type: 'string', description: 'A short name for the plate as a whole. Empty when the verdict is not "food".' },
    verdict: {
      type: 'string',
      enum: ['food', 'not_food', 'unclear'],
      description:
        '"food" when you can identify what is on the plate. '
        + '"not_food" when the photograph shows something that is not a meal at all — a person, a laptop, a room, a street. '
        + '"unclear" when there is food but you cannot identify it or its portions: too dark, blurred, too far away, or obscured.',
    },
    message: {
      type: 'string',
      description:
        'One friendly sentence for the person, used when the verdict is not "food". '
        + 'Say what you saw and what would help. Never apologise for an error — nothing has gone wrong. '
        + 'Empty string when the verdict is "food".',
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
  required: ['dish', 'verdict', 'message', 'caveat', 'alternatives', 'items'],
}

const MEAL_SYSTEM = `You estimate the nutritional content of a meal from a single photograph for Jumbo, a wellness companion.

Rules you must follow:
- Identify only what you can actually see. Never add a food because it commonly accompanies another.
- Portion size from one photograph is genuinely uncertain. Say so through the confidence values rather than by guessing precisely.
- Oils, butter, dressings and sauces are usually invisible. If you include one, give it a low confidence and mention it in the caveat.
- Classify the photograph before anything else:
  - "food": you can identify what is on the plate. Fill in items.
  - "not_food": the photograph is not of food at all — a person, a laptop, a shoe, a building, a document, the sky. This is a normal outcome, not a failure. Return an empty items array and a friendly message inviting them to photograph their meal.
  - "unclear": there is something that may be food, but you cannot identify it or judge portions — too dark, blurred, too distant, or obscured. Return an empty items array and a message saying what specifically was in the way, so the next photograph fixes it.
- Never force a guess to avoid returning "not_food" or "unclear". Both are correct answers and the person is offered a retake.
- Confidence is per item and must reflect real uncertainty. A clear, unambiguous food may be above 0.9. A food you are inferring from shape or colour alone should be below 0.6.
- The person reviews and corrects everything you return before it is saved, so an honest low-confidence answer is more useful than a confident wrong one.`

/** Used only when the model classifies but returns no sentence of its own. */
const DEFAULT_MESSAGE = {
  not_food: 'This doesn’t look like a food photo. Try taking a photo of your meal.',
  unclear: 'I can see something that may be food, but I can’t identify it clearly. Try a closer, brighter photo.',
}

ai.post('/food', async (req, res) => {
  if (!aiConfigured()) return aiUnavailable(res, 'meal photo analysis')

  const { imageBase64, mediaType = 'image/jpeg', note } = req.body ?? {}
  if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
    return res.status(400).json({ error: 'bad_image', message: 'No usable image was received.' })
  }
  if (imageBase64.length > 8_000_000) {
    return res.status(413).json({ error: 'image_too_large', message: 'That photo is too large. Try again at a lower resolution.' })
  }

  try {
    const { data, model } = await generateJson({
      system: MEAL_SYSTEM,
      contents: [{
        role: 'user',
        parts: [
          image(imageBase64, mediaType),
          text(note?.trim()
            ? `Identify the foods in this photograph. The person added: "${String(note).slice(0, 200)}"`
            : 'Identify the foods in this photograph.'),
        ],
      }],
      schema: MEAL_SCHEMA,
      maxOutputTokens: 4096,
      temperature: 0.4,
      vision: true,
    })

    const verdict = ['food', 'not_food', 'unclear'].includes(data.verdict) ? data.verdict : 'unclear'
    // A "food" verdict with nothing in it is really an unclear one.
    const rawItems = Array.isArray(data.items) ? data.items : []
    const settled = verdict === 'food' && rawItems.length === 0 ? 'unclear' : verdict

    const items = (settled === 'food' ? rawItems : []).map((i, idx) => ({
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
      source: 'openrouter',
      model,
      dish: data.dish || '',
      verdict: settled,
      message: settled === 'food' ? null : (data.message || DEFAULT_MESSAGE[settled]),
      caveat: data.caveat || null,
      alternatives: (data.alternatives ?? []).slice(0, 3),
      items,
      confidence: items.length ? items.reduce((a, i) => a + i.confidence, 0) / items.length : 0,
    })
  } catch (err) {
    sendAiError(res, err, 'meal photo analysis')
  }
})

/* ========================================================= insights */

const INSIGHT_SCHEMA = {
  type: 'object',
  properties: {
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          domain: { type: 'string', enum: ['sleep', 'movement', 'nutrition', 'recovery', 'body'] },
          changed: { type: 'string', description: 'What I noticed: what changed, with the actual numbers from the data.' },
          why: { type: 'string', description: 'Why it may matter to this person, in two sentences at most.' },
          evidence: {
            type: 'array',
            description: 'What the data shows: two to four specific figures drawn from the summary provided.',
            items: { type: 'string' },
          },
          confidence: { type: 'number', description: '0 to 1, reflecting how strongly the data supports this.' },
          limitation: { type: 'string', description: 'What this pattern cannot tell them.' },
          options: {
            type: 'array',
            description: 'What they could try: two or three options, one of which is to do nothing.',
            items: { type: 'string' },
          },
          window: { type: 'string', description: 'The observation window, e.g. "Last 28 days".' },
        },
        required: ['id', 'domain', 'changed', 'why', 'evidence', 'confidence', 'limitation', 'options', 'window'],
      },
    },
  },
  required: ['insights'],
}

const INSIGHT_SYSTEM = `You are the analysis layer of Jumbo, a wellness companion. You are given a statistical summary of one person's own health data and you report patterns you can actually see in it.

Each insight follows Jumbo's shape: what I noticed, why it may matter, what the data shows, what they could try, and that the choice is theirs.

Rules:
- Every number you state must come from the summary provided. Never invent a figure, a measurement or a history.
- If the summary is too thin to support a pattern, return fewer insights. Returning one honest insight is better than padding to five.
- Report between two and five insights when the data supports them.
- At least one insight should be positive or neutral when the data supports it. You are a collaborator, not an alarm.
- Confidence must reflect the strength of evidence: a clear multi-week trend with a supporting correlation is high; a weak association across a handful of days is low.
- Always state a real limitation, including what is not measured at all.
- Options must include the choice to do nothing.
- Never diagnose, never name a condition, never imply medical certainty. If something in the data looks clinically concerning, the only appropriate option is to raise it with a clinician.
- Write plainly. No jargon, no motivational filler.`

ai.post('/insights', async (req, res) => {
  if (!aiConfigured()) return aiUnavailable(res, 'pattern analysis')
  const { summary } = req.body ?? {}
  if (!summary || typeof summary !== 'object') {
    return res.status(400).json({ error: 'bad_summary' })
  }

  try {
    const { data, model } = await generateJson({
      system: INSIGHT_SYSTEM,
      contents: [{
        role: 'user',
        parts: [text(`A statistical summary of this person's own data:\n${JSON.stringify(summary, null, 2)}`)],
      }],
      schema: INSIGHT_SCHEMA,
      maxOutputTokens: 4096,
      temperature: 0.5,
    })

    res.json({
      source: 'openrouter',
      model,
      insights: (data.insights ?? []).slice(0, 5).map((i, idx) => ({
        ...i,
        id: i.id || `ai-${idx}`,
        confidence: clamp01(i.confidence),
        evidence: (i.evidence ?? []).slice(0, 4),
        options: (i.options ?? []).slice(0, 3),
        createdAt: Date.now(),
      })),
    })
  } catch (err) {
    sendAiError(res, err, 'pattern analysis')
  }
})

/* =========================================================== future */

const FUTURE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One line naming the shape of this scenario. Not a promise.' },
    lifeStory: {
      type: 'array',
      description: 'Two or three short paragraphs describing an ordinary day if this pattern continues.',
      items: { type: 'string' },
    },
    whatDrivesIt: {
      type: 'array',
      description: 'Two to four habits from the scenario that are doing the work, each with the change involved.',
      items: { type: 'string' },
    },
    honestly: { type: 'string', description: 'What this projection cannot tell them, stated plainly.' },
    confidence: { type: 'number', description: '0 to 1, reflecting how much of this rests on measurement rather than model.' },
  },
  required: ['headline', 'lifeStory', 'whatDrivesIt', 'honestly', 'confidence'],
}

const FUTURE_SYSTEM = `You write the scenario panel in Jumbo's Future screen. You are given someone's measured baseline, the habits in a scenario they are exploring, and a numeric projection produced by Jumbo's own model.

You are describing a possibility, never a forecast of that person's life.

Rules:
- Use conditional, scenario language throughout: "if this pattern continues", "your recent trend suggests", "on these habits, the model points towards". Never "you will".
- Be explicit about which of the three you are drawing on at any moment: what was observed in their data, what research suggests about people in general, and what Jumbo's model estimated. Never blur them.
- Every figure you use must come from the baseline or the projection you were given. Invent nothing.
- No diagnosis. No disease prediction. No claim about life expectancy or how long someone will live. If the scenario is flat or negative, say so plainly and kindly rather than manufacturing optimism.
- The day you describe should be ordinary and concrete — waking, moving, eating, the evening — not a list of metrics.
- Keep each paragraph under 45 words. Warm, precise, never gushing.`

ai.post('/future', async (req, res) => {
  if (!aiConfigured()) return aiUnavailable(res, 'future scenarios')
  const { baseline, levers, projection, horizonMonths } = req.body ?? {}
  if (!baseline || !levers || !projection) return res.status(400).json({ error: 'bad_scenario' })

  try {
    const { data, model } = await generateJson({
      system: FUTURE_SYSTEM,
      contents: [{
        role: 'user',
        parts: [text([
          `Horizon: ${horizonMonths} months.`,
          `Measured baseline:\n${JSON.stringify(baseline, null, 2)}`,
          `Habits in this scenario:\n${JSON.stringify(levers, null, 2)}`,
          `Jumbo's numeric projection:\n${JSON.stringify(projection, null, 2)}`,
        ].join('\n\n'))],
      }],
      schema: FUTURE_SCHEMA,
      maxOutputTokens: 4096,
      temperature: 0.7,
    })

    res.json({
      source: 'openrouter',
      model,
      headline: data.headline,
      lifeStory: (data.lifeStory ?? []).slice(0, 3),
      whatDrivesIt: (data.whatDrivesIt ?? []).slice(0, 4),
      honestly: data.honestly,
      confidence: clamp01(data.confidence),
    })
  } catch (err) {
    sendAiError(res, err, 'future scenarios')
  }
})

/* ============================================================= chat */

const CHAT_SCHEMA = {
  type: 'object',
  properties: {
    answer: {
      type: 'string',
      description:
        'The reply, in plain prose. Lead with the useful conclusion, then the reasoning. '
        + 'Two or three short paragraphs separated by a blank line. No headings, no bullet lists.',
    },
    followUps: {
      type: 'array',
      description: 'Up to three short questions this person might naturally ask next. Empty when none fit.',
      items: { type: 'string' },
    },
    groundedIn: {
      type: 'array',
      description: 'The figures from the summary you actually used. Empty when the answer needed none.',
      items: { type: 'string' },
    },
  },
  required: ['answer', 'followUps', 'groundedIn'],
}

const CHAT_SYSTEM = `You are Jumbo, a wellness and longevity companion, talking with one person about their own health data. You are not a clinician and Jumbo is not a medical device.

You are given a statistical summary of this person's data — sleep, movement and steps, nutrition and meals, workouts, recovery and heart data, VO2 max, measurements, goals and recent trends. It contains no name, no phone number, no notes and no photographs.

Jumbo's voice is calm, precise, personal and encouraging. Never breezy, never clinical, never a generic assistant.

How to answer:
- Lead with the useful conclusion. Explanation comes after it, not before.
- Underneath, the shape of a full answer is: what you noticed, why it may matter, what their data shows, what they could try, and that the choice is theirs. Let that run as natural prose. Only use it as visible structure when the question is broad enough to need it.
- Every figure you state must come from the summary you were given. If the summary does not contain what the question needs, say plainly which data is missing and what would fill the gap.
- Never invent a health record, a measurement, or a history. Never imply data exists when it does not, and never reason from what is typical for people in general as though it were theirs.
- Separate what was measured from what research suggests in general from what Jumbo estimated. Say which you are doing.
- For anything about the future or longevity, use scenario language: "if this pattern continues", "your recent trend suggests". Never a deterministic prediction.
- Show uncertainty where it exists. A weak signal described confidently is a failure.
- Offer options, not orders, and make clear the choice is theirs.
- Be warm and brief. Two or three short paragraphs is usually right. This is a conversation, not a report.
- Write prose. Separate paragraphs with a blank line. Do not use headings or bullet points.

Hard limits:
- No diagnosis, no disease prediction, no claims about life expectancy or how long someone will live.
- If asked to diagnose or to predict lifespan, say directly that you cannot and will not, then offer what you can actually help with.
- If someone describes symptoms that worry them, tell them plainly to speak to a clinician. Do not attempt to reassure them out of it.`

ai.post('/chat', async (req, res) => {
  if (!aiConfigured()) return aiUnavailable(res, 'Ask Jumbo')

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
        parts: [text(String(t.text).slice(0, 4000))],
      })),
    {
      role: 'user',
      parts: [text([
        goals?.length ? `Their stated goals: ${goals.join(', ')}.` : 'They have not set any goals yet.',
        `A statistical summary of their data:\n${JSON.stringify(summary ?? {}, null, 2)}`,
        `Their question: ${question.slice(0, 2000)}`,
      ].join('\n\n'))],
    },
  ]

  // The thread has to open on the person's turn.
  while (contents.length > 1 && contents[0].role !== 'user') contents.shift()

  try {
    const { data, model } = await generateJson({
      system: CHAT_SYSTEM,
      contents,
      schema: CHAT_SCHEMA,
      maxOutputTokens: 4096,
    })

    res.json({
      source: 'openrouter',
      model,
      answer: String(data.answer ?? '').trim(),
      followUps: (data.followUps ?? []).slice(0, 3),
      groundedIn: (data.groundedIn ?? []).slice(0, 6),
    })
  } catch (err) {
    sendAiError(res, err, 'Ask Jumbo')
  }
})

/* ========================================================= selftest */

/**
 * A live round trip, for checking a deployment from a browser.
 *
 * It reports which stage failed and the upstream reason, because a
 * deployment that will not answer is impossible to diagnose from the
 * product's own wording — which is deliberately vague. It sends a
 * three-word prompt, returns no user data, and never reports the key or
 * any part of it.
 */
ai.get('/selftest', async (_req, res) => {
  const started = Date.now()
  if (!aiConfigured()) {
    return res.status(503).json({
      ok: false,
      stage: 'configuration',
      models: aiModels(),
      reason: 'No API key is present in this environment.',
      hint: 'Set OPENROUTER_API_KEY in the deployment’s environment variables and redeploy.',
    })
  }

  try {
    const { data, model } = await generateJson({
      system: 'You are a health check. Reply with the single word ok.',
      contents: [{ role: 'user', parts: [text('Say ok.')] }],
      schema: {
        type: 'object',
        properties: { status: { type: 'string' } },
        required: ['status'],
      },
      maxOutputTokens: 2048,
      temperature: 0,
      timeoutMs: 25_000,
    })
    res.json({
      ok: true,
      stage: 'complete',
      // Which model answered, and the whole chain behind it.
      answeredBy: model,
      models: aiModels(),
      ms: Date.now() - started,
      reply: String(data.status ?? '').slice(0, 40),
    })
  } catch (err) {
    res.status(err.status ?? 502).json({
      ok: false,
      stage: 'generation',
      models: aiModels(),
      ms: Date.now() - started,
      code: err.code ?? 'unknown',
      reason: err.message,
      hint: HINTS[err.code] ?? 'See the deployment’s runtime logs for the upstream detail.',
    })
  }
})

const HINTS = {
  bad_key: 'OpenRouter rejected the key. Check it is a valid OPENROUTER_API_KEY and that the account is active.',
  no_credit: 'The OpenRouter account has no credit left for these models.',
  rate_limited: 'The project is over its quota for this model.',
  timeout: 'The model did not respond in time. A smaller model or a shorter prompt will help.',
  empty: 'The model returned no content.',
  unparsable: 'Every model in the chain returned something that was not the requested JSON.',
  declined: 'The model declined the prompt on safety grounds.',
}

/* =========================================================== shared */

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0))
const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10
