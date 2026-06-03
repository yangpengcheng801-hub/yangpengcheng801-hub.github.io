/** 作文文本规则清洗（解析后、AI 审核前） */

const TYPO_MAP = [
  [/\bjointing\b/gi, 'joining'],
  [/\bsuspedted\b/gi, 'suspected'],
  [/\bdid't\b/gi, "didn't"],
  [/\bevery thing\b/gi, 'everything'],
  [/\bcoutry\b/gi, 'country'],
  [/\bproductd\b/gi, 'products'],
  [/\bcanteed\b/gi, 'canteen'],
  [/\bopinon\b/gi, 'opinion'],
  [/\bto be belief\b/gi, 'to be brief'],
  [/\bwe can solved\b/gi, 'we can solve'],
  [/\bdepartments stores\b/gi, 'department stores'],
  [/\bCostumers\b/g, 'Customers'],
  [/\bopening and caring\b/gi, 'open and caring'],
  [/\btake great account in\b/gi, 'take great account of'],
  [/\bchina jointing wto\b/gi, 'China joining the WTO'],
  [/\bselective concerning\b/gi, 'electives concerning'],
  [/\bthe selective I attend\b/gi, 'the electives I attend'],
  [/\bbecause \.4 the readers\b/gi, 'because the readers'],
  [/\bbody part of the users\b/gi, 'bulk of the users'],
  [/\blongdistance\b/g, 'long-distance'],
  [/\bonline\b/g, 'on-line'],
  [/\bselfconscious\b/g, 'self-conscious'],
  [/\bpracitce\b/gi, 'practice'],
  [/\bcompositin\b/gi, 'composition'],
  [/\bProjec\b/g, 'Project'],
  [/\bthing games\b/gi, 'such games'],
  [/\bdon.t indulge\b/gi, "don't indulge"],
  [/\bshouldn.t\b/gi, "shouldn't"],
]

export function fixTypos(text) {
  if (!text) return text
  let out = text
  for (const [re, rep] of TYPO_MAP) out = out.replace(re, rep)
  return out
}

export function cleanEssayText(text) {
  if (!text) return text
  let t = fixTypos(text)
  t = t.replace(/\\;/g, '. ')
  t = t.replace(/^扩展句[：:]\s*/gm, '')
  t = t.replace(/\uFFFD/g, "'")
  t = t.replace(/[ \t]{2,}/g, ' ')
  t = t.replace(/\n{3,}/g, '\n\n')
  return t.trim()
}

export function cleanPhraseItem(en, zh) {
  let e = fixTypos(en ?? '').trim()
  let z = (zh ?? '').trim()
  if (/^(提出|预示|论证|给出|列出|批判|图表|过渡|开头|结尾|比较|对比|强调|时间|顺序)/.test(z)) {
    z = ''
  }
  if (/随着科技的发展|很多人似乎认为/.test(e) && /[\u4e00-\u9fff]/.test(e)) {
    const i = e.search(/[\u4e00-\u9fff]/)
    if (i > 10) {
      z = e.slice(i).trim()
      e = e.slice(0, i).trim()
    }
  }
  return { en: e, zh: z }
}

export function applyTextFixesToPack(data) {
  for (const t of data.templates ?? []) {
    t.steps = cleanEssayText(t.steps)
    t.practice.topic = fixTypos(t.practice.topic)
    t.practice.directions = cleanEssayText(t.practice.directions)
    t.practice.outline = cleanEssayText(t.practice.outline)
    t.sampleEssay = cleanEssayText(t.sampleEssay)
    for (const b of [...(t.skeletonBlocks ?? []), ...(t.fillInBlocks ?? [])]) {
      b.content = cleanEssayText(b.content)
    }
    t.sampleParagraphs = (t.sampleParagraphs ?? []).map(cleanEssayText).filter(Boolean)
    t.wordCount = countWords(t.sampleEssay)
  }

  const fixExam = (e) => {
    e.titleEn = fixTypos(e.titleEn)
    e.titleZh = fixTypos(e.titleZh)
    e.directions = cleanEssayText(e.directions)
    e.essay = cleanEssayText(e.essay)
    e.outline = (e.outline ?? []).map((l) => fixTypos(l))
    e.essayParagraphs = splitEssayParagraphs(e.essay)
    e.wordCount = countWords(e.essay)
  }

  for (const e of data.pastExams ?? []) fixExam(e)
  for (const e of data.recentCet4 ?? []) fixExam(e)

  for (const m of data.mockTests ?? []) {
    m.directions = cleanEssayText(m.directions)
    m.outlineZh = cleanEssayText(m.outlineZh)
    m.topic = fixTypos(m.topic)
    for (const essay of m.essays ?? []) {
      essay.title = fixTypos(essay.title)
      essay.body = cleanEssayText(essay.body)
      essay.paragraphs = splitEssayParagraphs(essay.body)
      essay.wordCount = countWords(essay.body)
    }
  }

  const lib = data.phraseLibrary
  if (lib) {
    for (const p of lib.patterns26 ?? []) {
      p.title = fixTypos(p.title)
      p.pattern = cleanEssayText(p.pattern)
      for (const ex of p.examples ?? []) {
        ex.en = cleanEssayText(ex.en)
        ex.zh = fixTypos(ex.zh)
      }
    }
    for (const set of Object.values(lib.phraseSets?.sets ?? {})) {
      set.items = (set.items ?? [])
        .map((it) => cleanPhraseItem(it.en, it.zh))
        .filter((it) => it.en.length > 8)
    }
    lib.chartPhrases = (lib.chartPhrases ?? []).map((it) => cleanPhraseItem(it.en, it.zh))
    for (const g of lib.basicPatterns ?? []) {
      g.patterns = g.patterns.map(fixTypos)
      g.example = cleanEssayText(g.example)
    }
  }

  return data
}

export function countWords(text) {
  if (!text) return 0
  return text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w)).length
}

export function splitEssayParagraphs(text) {
  const t = cleanEssayText(text)
  if (!t) return []
  const paras = t.split(/\n{2,}/).filter((p) => p.trim().length > 30)
  if (paras.length > 1) return paras.map((p) => p.trim())
  return t
    .split(/(?<=[.!?])\s+(?=(?:First|Second|Third|Finally|In conclusion|However|Undoubtedly|Moreover|As is|In my opinion|On the one hand|Dear |To sum up|Nowadays)[A-Za-z])/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 25)
}
