/** 英语发音：单词有道标准音；句子百度翻译标准朗读 + 有道/系统兜底 */

import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { DICT_USER_AGENT, isNativeApp } from './apiClient'

export type AccentPref = 'us' | 'uk'

const ACCENT_KEY = 'cet4_accent_v1'
const YOUDAO_CHUNK_MAX = 180

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null
let currentAudio: HTMLAudioElement | null = null

const FEMALE_VOICE_RE =
  /aria|jenny|zira|samantha|victoria|karen|serena|sonia|libby|moira|tessa|fiona|susan|ava|emma|amy|joanna|salli|female|woman/i
const NATURAL_VOICE_RE = /natural|neural|online|premium|google/i
const MALE_VOICE_RE = /david|mark|guy|george|daniel|male|man/i
const TEACHER_RATE = 0.82
const WORD_RATE = 0.86
const TEACHER_PITCH = 1.12

export function getAccentPref(): AccentPref {
  try {
    return localStorage.getItem(ACCENT_KEY) === 'uk' ? 'uk' : 'us'
  } catch {
    return 'us'
  }
}

export function setAccentPref(accent: AccentPref) {
  localStorage.setItem(ACCENT_KEY, accent)
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (voicesReady) return voicesReady
  voicesReady = new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve([])
      return
    }
    const synth = window.speechSynthesis
    const pick = () => {
      const list = synth.getVoices()
      if (list.length) resolve(list)
    }
    pick()
    synth.addEventListener('voiceschanged', pick, { once: true })
    setTimeout(() => resolve(synth.getVoices()), 800)
  })
  return voicesReady
}

function pickEnglishVoice(
  voices: SpeechSynthesisVoice[],
  accent: AccentPref,
): SpeechSynthesisVoice | undefined {
  const targetLang = accent === 'uk' ? 'en-GB' : 'en-US'
  const candidates = voices.filter((v) => v.lang?.startsWith('en'))
  if (!candidates.length) return undefined

  const score = (voice: SpeechSynthesisVoice) => {
    const name = voice.name || ''
    let value = 0
    if (voice.lang === targetLang) value += 60
    else if (voice.lang?.startsWith(targetLang)) value += 45
    else if (voice.lang?.startsWith(accent === 'uk' ? 'en-GB' : 'en-US')) value += 35
    if (FEMALE_VOICE_RE.test(name)) value += 80
    if (NATURAL_VOICE_RE.test(name)) value += 30
    if (/microsoft/i.test(name)) value += 15
    if (/google/i.test(name)) value += 10
    if (MALE_VOICE_RE.test(name)) value -= 80
    if (accent === 'uk' && /hazel|serena|sonia|libby|uk english/i.test(name)) value += 35
    if (accent === 'us' && /aria|jenny|zira|samantha|us english/i.test(name)) value += 35
    return value
  }

  return [...candidates].sort((a, b) => score(b) - score(a))[0]
}

function youdaoVoiceUrl(text: string, accent: AccentPref): string {
  const type = accent === 'uk' ? 1 : 2
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text.trim())}&type=${type}`
}

function baiduTtsUrl(text: string, accent: AccentPref): string {
  const lan = accent === 'uk' ? 'uk' : 'en'
  return `https://fanyi.baidu.com/gettts?lan=${lan}&text=${encodeURIComponent(text.trim().slice(0, 500))}&spd=3&source=web`
}

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }
}

function playAudioUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    stopCurrentAudio()
    const audio = new Audio(url)
    currentAudio = audio
    audio.preload = 'auto'
    const done = (ok: boolean) => {
      if (currentAudio === audio) currentAudio = null
      audio.onended = null
      audio.onerror = null
      resolve(ok)
    }
    audio.onended = () => done(true)
    audio.onerror = () => done(false)
    void audio.play().then(() => {}).catch(() => done(false))
  })
}

async function playAudioBlob(blob: Blob): Promise<boolean> {
  const objectUrl = URL.createObjectURL(blob)
  const ok = await playAudioUrl(objectUrl)
  URL.revokeObjectURL(objectUrl)
  return ok
}

async function fetchYoudaoAudio(text: string, accent: AccentPref): Promise<Blob | null> {
  try {
    const res = await fetch(youdaoVoiceUrl(text, accent))
    const ct = res.headers.get('content-type') || ''
    if (!res.ok || !ct.includes('audio')) return null
    const blob = await res.blob()
    return blob.size > 200 ? blob : null
  } catch {
    return null
  }
}

async function playBaiduSpeech(text: string, accent: AccentPref): Promise<boolean> {
  try {
    const res = await fetch(baiduTtsUrl(text, accent), {
      headers: { 'User-Agent': DICT_USER_AGENT },
    })
    const ct = res.headers.get('content-type') || ''
    if (!res.ok || !ct.includes('audio')) return false
    const blob = await res.blob()
    return blob.size > 200 ? playAudioBlob(blob) : false
  } catch {
    return false
  }
}

async function playYoudaoSpeech(text: string, accent: AccentPref): Promise<boolean> {
  const trimmed = text.trim()
  if (!trimmed) return false

  const blob = await fetchYoudaoAudio(trimmed, accent)
  if (blob) return playAudioBlob(blob)

  if (trimmed.length <= YOUDAO_CHUNK_MAX) return false

  const parts = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (parts.length <= 1) return false

  for (const part of parts) {
    const chunkBlob = await fetchYoudaoAudio(part, accent)
    if (!chunkBlob) return false
    const ok = await playAudioBlob(chunkBlob)
    if (!ok) return false
  }
  return true
}

async function speakNativeTts(text: string, accent: AccentPref, rate: number): Promise<boolean> {
  if (!isNativeApp()) return false
  const trimmed = text.trim().slice(0, 3500)
  if (!trimmed) return false
  try {
    await TextToSpeech.stop()
    const voices = await TextToSpeech.getSupportedVoices().catch(() => ({ voices: [] }))
    const lang = accent === 'uk' ? 'en-GB' : 'en-US'
    const list = voices.voices ?? []
    const ranked = list
      .map((v, index) => {
        const l = (v.lang || '').toLowerCase()
        const name = String(v.name || '')
        const langOk = accent === 'uk' ? l.startsWith('en-gb') : l.startsWith('en-us')
        let score = langOk ? 50 : l.startsWith('en') ? 20 : 0
        if (FEMALE_VOICE_RE.test(name)) score += 80
        if (NATURAL_VOICE_RE.test(name)) score += 30
        if (MALE_VOICE_RE.test(name)) score -= 80
        return { index, score }
      })
      .filter((v) => v.score > 0)
      .sort((a, b) => b.score - a.score)
    const idx =
      ranked[0]?.index ??
      list.findIndex((v) => {
      const l = (v.lang || '').toLowerCase()
      return accent === 'uk' ? l.startsWith('en-gb') : l.startsWith('en-us')
    })
    await TextToSpeech.speak({
      text: trimmed,
      lang,
      rate: Math.min(1.1, Math.max(0.75, rate)),
      pitch: TEACHER_PITCH,
      volume: 1,
      ...(idx >= 0 ? { voice: idx } : {}),
    })
    return true
  } catch (e) {
    console.warn('[cet4] native TTS', e)
    return false
  }
}

async function speakBrowserTts(text: string, accent: AccentPref, rate: number): Promise<boolean> {
  if (!('speechSynthesis' in window)) return false
  const voices = await loadVoices()
  const synth = window.speechSynthesis
  synth.cancel()
  await new Promise((r) => setTimeout(r, 50))

  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = accent === 'uk' ? 'en-GB' : 'en-US'
  utter.rate = Math.min(0.9, Math.max(0.72, rate))
  utter.pitch = TEACHER_PITCH
  const voice = pickEnglishVoice(voices, accent)
  if (voice) utter.voice = voice

  let resumeTimer: ReturnType<typeof setInterval> | null = null
  const clearResume = () => {
    if (resumeTimer) {
      clearInterval(resumeTimer)
      resumeTimer = null
    }
  }

  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearResume()
      resolve(ok)
    }
    utter.onend = () => finish(true)
    utter.onerror = () => finish(false)
    synth.speak(utter)
    resumeTimer = setInterval(() => {
      if (!synth.speaking) {
        clearResume()
        return
      }
      synth.resume()
    }, 300)
    setTimeout(() => {
      if (!settled && synth.speaking) finish(true)
      else if (!settled) finish(false)
    }, 12000)
  })
}

export function markSpeechUnlocked() {
  /* 用户点击后发音更稳定 */
}

export async function speakEnglish(text: string, rate = 0.9): Promise<boolean> {
  const trimmed = text.trim()
  if (!trimmed) return false
  const accent = getAccentPref()
  const isSingleWord = !/\s/.test(trimmed) && trimmed.length <= 40

  if (isSingleWord) {
    if (await playYoudaoSpeech(trimmed, accent)) return true
  } else {
    if (await speakBrowserTts(trimmed, accent, rate)) return true
    if (await playBaiduSpeech(trimmed, accent)) return true
    if (await playYoudaoSpeech(trimmed, accent)) return true
  }

  if (isNativeApp()) {
    if (await speakNativeTts(trimmed, accent, rate)) return true
  }

  if (await speakBrowserTts(trimmed, accent, rate)) return true

  return false
}

export function speakWord(word: string): void {
  markSpeechUnlocked()
  void speakEnglish(word, WORD_RATE)
}

export function speakSentence(sentence: string): void {
  markSpeechUnlocked()
  void speakEnglish(sentence.trim(), TEACHER_RATE)
}

let autoSpeakTimer: ReturnType<typeof setTimeout> | null = null

export function cancelAutoSpeak() {
  if (autoSpeakTimer) {
    clearTimeout(autoSpeakTimer)
    autoSpeakTimer = null
  }
  stopCurrentAudio()
  if (isNativeApp()) void TextToSpeech.stop().catch(() => {})
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

export function autoSpeakWord(word: string): void {
  if (!word) return
  cancelAutoSpeak()
  autoSpeakTimer = setTimeout(() => {
    autoSpeakTimer = null
    void speakEnglish(word, WORD_RATE)
  }, 400)
}

export async function warmUpSpeech(): Promise<void> {
  if (isNativeApp()) {
    try {
      await TextToSpeech.getSupportedLanguages()
    } catch {
      /* ignore */
    }
  }
  await loadVoices()
}
