import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Speaking instead of typing.
 *
 * This is the browser's own speech recognition, not a Jumbo service — which
 * means it genuinely is not available everywhere. Where it is missing the hook
 * reports `supported: false` and the UI hides the option rather than offering
 * a button that does nothing.
 */

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

type RecognitionCtor = new () => SpeechRecognitionLike

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<SpeechRecognitionLike | null>(null)
  const sink = useRef(onText)
  sink.current = onText

  const supported = typeof window !== 'undefined' && recognitionCtor() !== null

  const stop = useCallback(() => {
    rec.current?.stop()
    rec.current = null
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor) return
    setError(null)

    const r = new Ctor()
    r.lang = navigator.language || 'en-GB'
    r.continuous = true
    r.interimResults = false

    r.onresult = (e) => {
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript
      }
      if (text.trim()) sink.current(text.trim())
    }
    r.onerror = (e) => {
      setError(e.error === 'not-allowed'
        ? 'Microphone access was declined. You can allow it in your browser’s site settings.'
        : 'Speech recognition stopped unexpectedly. You can type instead.')
      setListening(false)
    }
    r.onend = () => setListening(false)

    rec.current = r
    r.start()
    setListening(true)
  }, [])

  useEffect(() => () => { rec.current?.abort() }, [])

  return { supported, listening, error, start, stop, toggle: () => (listening ? stop() : start()) }
}
