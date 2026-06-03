/**
 * 精细解析三份作文 Word 素材 → public/essay-materials.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyTextFixesToPack } from './essay-text-fix.mjs'
import { applyAuditToPack } from './essay-audit-merge.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const srcDir = join(__dirname, 'essay-materials')
const out = join(root, 'public', 'essay-materials.json')

function readTxt(name) {
  return readFileSync(join(srcDir, name), 'utf8')
}

function clean(s) {
  return s
    .replace(/\u3000/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeSpaces(s) {
  return s.replace(/[ \t]{2,}/g, ' ').trim()
}

/** 按「第X段」拆成段落块 */
function parseParagraphBlocks(text) {
  const blocks = []
  const re = /(第[一二三四五六七八九十\d]+段[：:]?|第一、|第二、|第三、|第四、|第五、)/g
  const parts = text.split(re).filter(Boolean)
  let currentLabel = '全文'
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim()
    if (/^第.+段|^第[一二三四五六七八九十]、/.test(p)) {
      currentLabel = p.replace(/[：:]$/, '')
    } else if (p.length > 10) {
      blocks.push({ label: currentLabel, content: normalizeSpaces(p) })
    }
  }
  if (!blocks.length && text) blocks.push({ label: '全文', content: normalizeSpaces(text) })
  return blocks
}

function countWords(text) {
  if (!text) return 0
  return text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w)).length
}

function formatEssayParagraphs(text) {
  if (!text) return []
  let t = clean(text).replace(/\\;/g, '. ')
  const paras = t.split(/\n{2,}/).filter((p) => p.trim().length > 30)
  if (paras.length > 1) {
    return paras.map((p) => normalizeSpaces(p)).filter((p) => p.length > 20)
  }
  return t
    .split(/(?<=[.!?])\s+(?=(?:First|Second|Third|Finally|In conclusion|However|Undoubtedly|Moreover|As is|In my opinion|On the one hand|Dear |To sum up)[A-Za-z])/i)
    .map((p) => normalizeSpaces(p))
    .filter((p) => p.length > 25)
}

function extractBetween(text, startRe, endRe) {
  const m = text.match(startRe)
  if (!m) return ''
  const start = m.index + m[0].length
  const rest = text.slice(start)
  const end = rest.search(endRe)
  return clean(end >= 0 ? rest.slice(0, end) : rest)
}

const CN_NUM = '一二三四五六七八九十'

function parseTemplates(text) {
  const typeDefs = [
    { key: 'narrative', match: /记叙文/, label: '记叙文', icon: '📖', desc: '记人记事：概述→经过→感悟分析' },
    { key: 'pros-cons', match: /正反观点/, label: '正反观点', icon: '⚖️', desc: '开头→利→弊→个人观点（最高频）' },
    { key: 'letter', match: /英文信函/, label: '英文信函', icon: '✉️', desc: '称呼→目的→主体→反驳→落款' },
  ]
  const blocks = text.split(/-{10,}/)
  const templates = []

  for (const def of typeDefs) {
    const block = blocks.find((b) => def.match.test(b) && /写作步骤/.test(b))
    if (!block) continue

    const steps = extractBetween(block, /写作步骤\s*/, /第二部分|［实战演练］/)
    const practiceRaw = extractBetween(block, /［实战演练］\s*/, /［diy写作模板：架构阶段］/)
    const skeleton = extractBetween(block, /［diy写作模板：架构阶段］\s*/, /［diy写作模板：填充阶段］/)
    const fillIn = extractBetween(block, /［diy写作模板：填充阶段］\s*/, /第三部分、范文/)
    const sample = extractBetween(block, /第三部分、范文\s*/, /-{5,}|百变句子|第一部分/)

    const topicM = practiceRaw.match(/topic\s+([^.]+?)\./i)
    const topic = topicM ? topicM[1].trim() : ''

    let sampleEssay = sample
    if (def.key === 'letter' && fillIn && !/i do believe.*thanks/i.test(sample)) {
      const closing = fillIn.match(
        /i do believe[\s\S]{10,200}?thanks\.?\s*(?:\s*li ming)?/i,
      )
      if (closing) sampleEssay = `${sample}\n\n${normalizeSpaces(closing[0])}`
    }

    templates.push({
      id: def.key,
      label: def.label,
      icon: def.icon,
      desc: def.desc,
      steps,
      practice: {
        topic,
        directions: practiceRaw,
        outline: practiceRaw
          .split('\n')
          .filter((l) => /^[\d1-9、．.]/.test(l.trim()))
          .join('\n'),
      },
      skeletonBlocks: parseParagraphBlocks(skeleton),
      fillInBlocks: parseParagraphBlocks(fillIn),
      sampleEssay: sampleEssay,
      sampleParagraphs: formatEssayParagraphs(sampleEssay),
      wordCount: countWords(sampleEssay),
    })
  }
  return templates
}

function parseSentenceVariety(text) {
  const block = extractBetween(text, /百变句子开头使你的句型多变/, /考研英语小作文/)
  const types = []
  const typeRe = /(\d+)\.(以[^。]+。)/g
  let lastIdx = 0
  let m
  const headers = []
  while ((m = typeRe.exec(block)) !== null) headers.push({ num: m[1], title: m[2], start: m.index })

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].start + headers[i].title.length
    const end = i + 1 < headers.length ? headers[i + 1].start : block.length
    const body = block.slice(start, end)
    const examples = []
    for (const line of body.split('\n')) {
      const t = line.trim()
      if (t.length > 15 && /[a-zA-Z]/.test(t) && !/^这个|^短语/.test(t)) {
        examples.push(normalizeSpaces(t))
      }
    }
    types.push({ title: `${headers[i].num}. ${headers[i].title}`, examples })
  }
  return types
}

function parseCetOpenings(text) {
  const block = extractBetween(text, /考研英语小作文开头常用短语句式/, /语高分作文必须要记住的二十六句式/)
  const items = []
  const re = /\((\d+)\)\s*([^\n]+)/g
  let m
  while ((m = re.exec(block)) !== null) {
    items.push({ num: Number(m[1]), en: normalizeSpaces(m[2]) })
  }
  return items
}

function parsePatterns26(text) {
  const block = extractBetween(
    text,
    /语高分作文必须要记住的二十六句式/,
    /英语四六级作文套句总结/,
  )
  const items = []
  const parts = block.split(new RegExp(`(?=[${CN_NUM}]+、)`))
  for (const part of parts) {
    const head = part.match(new RegExp(`^([${CN_NUM}]+)、\\s*([^\\n]+)`))
    if (!head) continue
    const body = part.slice(head[0].length).trim()
    const patternLines = []
    const examples = []
    let inExample = false
    for (const line of body.split('\n')) {
      const t = line.trim()
      if (!t) continue
      if (/^例句/.test(t)) inExample = true
      if (inExample) {
        if (/[a-zA-Z]{3,}/.test(t)) examples.push({ en: t.replace(/^例句[：:]?\s*/, ''), zh: '' })
        else if (/[\u4e00-\u9fff]/.test(t) && examples.length) {
          examples[examples.length - 1].zh = (examples[examples.length - 1].zh + t).trim()
        }
      } else if (/~~~|Nothing is|There is|It is|An advantage|The reason|Those who|be \+|Get into|What a|Leave much|Have a great|do good|Pose a great|do one's/i.test(t)) {
        patternLines.push(normalizeSpaces(t))
      }
    }
    items.push({
      num: head[1],
      title: head[2].trim(),
      pattern: patternLines.join('\n'),
      examples,
    })
  }
  return items.filter((x) => x.pattern || x.examples.length)
}

function parsePhraseSets(text) {
  const block = extractBetween(text, /英语四六级作文套句总结/, /英语四六级作文基本句式总结/)
  const categories = [
    { key: 'opening', label: '开头', start: /^开头\s*$/m },
    { key: 'closing', label: '结尾', start: /^结尾\s*$/m },
    { key: 'views', label: '引出观点', start: /^引出不同观点/ },
    { key: 'suggest', label: '提出建议', start: /^提出建议/ },
    { key: 'consequence', label: '预示后果', start: /^预示后果/ },
    { key: 'argument', label: '论证', start: /^论证\s*$/m },
    { key: 'reason', label: '给出原因', start: /^给出原因/ },
    { key: 'solution', label: '解决办法', start: /^列出解决办法/ },
    { key: 'critique', label: '批判错误观点', start: /^批判错误/ },
    { key: 'chart', label: '图表作文', start: /^图表作文/ },
  ]
  const lines = block.split('\n')
  const sets = {}
  let current = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '过渡词' || /^过渡词/.test(line)) break
    const cat = categories.find((c) => c.start.test(line))
    if (cat) {
      current = cat.key
      if (!sets[current]) sets[current] = { label: cat.label, items: [] }
      continue
    }
    if (!current || !line) continue
    if (!/^[a-zA-Z(]/.test(line) || line.length < 12) continue
    const isCategory = (s) =>
      /^(提出|预示|论证|给出|列出|批判|图表|过渡|开头|结尾|比较|对比|强调)/.test(s) || /:$/.test(s)
    let en = line
    let zh = ''
    if (/[\u4e00-\u9fff]/.test(line) && /[a-zA-Z]/.test(line)) {
      const zhStart = line.search(/[\u4e00-\u9fff]/)
      en = normalizeSpaces(line.slice(0, zhStart))
      zh = normalizeSpaces(line.slice(zhStart))
    } else {
      const next = lines[i + 1]?.trim() ?? ''
      if (next && /[\u4e00-\u9fff]/.test(next) && !isCategory(next)) {
        zh = lines[++i].trim()
      }
    }
    if (en) sets[current].items.push({ en, zh })
  }

  const transBlock = extractBetween(block, /^过渡词\s*$/m, /图表作文|英语四六级作文基本句式/)
  const transitions = {}
  if (transBlock) {
    let tKey = ''
    for (const line of transBlock.split('\n')) {
      const t = line.trim()
      if (!t) continue
      if (/^强调$|^比较$|^对比$|^列举$|^时间$|^顺序$|^可能$|^解释$|^递进$|^让步$|^转折$|^原因$|^结果$|^总结$|^其他$/.test(t)) {
        tKey = t
        transitions[tKey] = []
      } else if (tKey && /[a-zA-Z]/.test(t)) {
        transitions[tKey].push(normalizeSpaces(t))
      }
    }
  }

  return { sets, transitions }
}

function parseBasicPatterns(text) {
  const block = extractBetween(text, /英语四六级作文基本句式总结/, /英语四六级\(CET\)作文经典|这些地道的句子/)
  const groups = []
  const parts = block.split(/(?=\d+．表示|\d+\.表示)/)
  for (const part of parts) {
    const head = part.match(/^(\d+)[．.]表示([^　\s]+)/)
    if (!head) continue
    const body = part.slice(head[0].length)
    const patterns = []
    const exampleM = body.match(/例如[：:]?\s*([\s\S]*?)(?=再如|注：|\d+．|$)/)
    const example = exampleM ? clean(exampleM[1]) : ''
    for (const line of body.split('\n')) {
      const t = line.trim()
      if (/^\d+[）)]/.test(t) && /[a-zA-Z]/.test(t)) {
        patterns.push(normalizeSpaces(t.replace(/^\d+[）)]\s*/, '')))
      }
    }
    groups.push({
      num: Number(head[1]),
      category: `表示${head[2].trim()}`,
      patterns: patterns.slice(0, 8),
      example,
    })
  }
  return groups.filter((g) => g.patterns.length)
}

function parseChartPhrases(text) {
  const block = extractBetween(text, /图表作文常用句型/, /英语四六级作文基本句式总结/)
  const items = []
  for (const line of block.split('\n')) {
    const t = line.trim()
    if (!t || t.length < 15) continue
    if (/^As is|^The graph|^From the chart|^All these|^The increase|^In \d{4}|^There was/i.test(t)) {
      const zhStart = t.search(/[\u4e00-\u9fff]/)
      if (zhStart > 0) {
        items.push({ en: normalizeSpaces(t.slice(0, zhStart)), zh: normalizeSpaces(t.slice(zhStart)) })
      } else {
        items.push({ en: normalizeSpaces(t), zh: '' })
      }
    }
  }
  return items
}

function parsePhrases(text) {
  return {
    sentenceVariety: parseSentenceVariety(text),
    cetOpenings: parseCetOpenings(text),
    patterns26: parsePatterns26(text),
    phraseSets: parsePhraseSets(text),
    basicPatterns: parseBasicPatterns(text),
    chartPhrases: parseChartPhrases(text),
  }
}

const EXAM_HEADER =
  /(\d{4})年(\d{1,2})(?:月|日)?(CET4|CET6|CET)?作文题目|四级作文题目|六级作文题目|CET6作文题目/g

function findExamHeaders(text) {
  const headers = []
  let m
  while ((m = EXAM_HEADER.exec(text)) !== null) {
    let year = 0
    let month = 0
    let level = 'cet4'
    if (m[1]) {
      year = Number(m[1])
      month = Number(m[2])
      level = m[3] === 'CET6' ? 'cet6' : 'cet4'
    } else if (/六级|CET6/.test(m[0])) {
      level = 'cet6'
    }
    headers.push({ index: m.index, len: m[0].length, year, month, level, raw: m[0] })
  }
  return headers
}

function splitPromptAndEssay(chunk) {
  const marker = chunk.match(/(?:写作范文|参考范文)[：:]?\s*/)
  if (marker) {
    return {
      prompt: chunk.slice(0, marker.index).trim(),
      essay: clean(chunk.slice(marker.index + marker[0].length)),
    }
  }
  const lines = chunk.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (
      /^(As is known|In the era|Nowadays|Undoubtedly|With the|In my opinion|Recently|Living in the|Will E-books|Disposable plastic)/i.test(
        t,
      )
    ) {
      start = i
      break
    }
  }
  if (start >= 0) {
    return {
      prompt: lines.slice(0, start).join('\n').trim(),
      essay: clean(lines.slice(start).join('\n')),
    }
  }
  return { prompt: chunk.trim(), essay: '' }
}

function extractTitleAndOutline(prompt) {
  const lines = prompt.split('\n').map((l) => l.trim()).filter(Boolean)
  let titleEn = ''
  let titleZh = ''
  const outline = []

  for (const line of lines) {
    if (/^作文题目/.test(line)) {
      titleEn = line.replace(/^作文题目[：:\s]*/, '').trim()
      continue
    }
    if (/^提纲/.test(line)) continue
    if (/^[\d1-9一二三四、．.)]/.test(line)) {
      outline.push(line)
      continue
    }
    if (/[\u4e00-\u9fff]/.test(line) && !/[a-zA-Z]{5,}/.test(line) && line.length < 80) {
      if (!titleZh) titleZh = line
      else outline.push(line)
      continue
    }
    if (/^[A-Z][a-zA-Z\s:,?'"-]+$/.test(line) && line.length > 4 && line.length < 120) {
      if (!titleEn) titleEn = line
    }
  }

  const directions = lines
    .filter(
      (l) =>
        !/^(As is known|In the era|Undoubtedly|However|In my opinion|Of course)/i.test(l) &&
        l.length < 200,
    )
    .join('\n')

  return {
    titleEn: titleEn || titleZh || '作文题',
    titleZh,
    outline,
    directions: directions.slice(0, 1200),
  }
}

function extractEssay(raw) {
  let essay = clean(raw)
  essay = essay.split(/(?=\d{4}年\d{1,2}|四级作文|六级作文|CET6作文)/)[0]
  return essay
}

function parsePastExams(text) {
  const body = clean(text.replace(/^历年英语[^\n]*\n/, ''))
  const headers = findExamHeaders(body)
  const exams = []
  let ctx = { year: 0, month: 0 }

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    const start = h.index + h.len
    const end = i + 1 < headers.length ? headers[i + 1].index : body.length
    const chunk = body.slice(start, end)

    if (h.year) {
      ctx = { year: h.year, month: h.month }
    }
    const level = h.level || 'cet4'
    const { prompt, essay: rawEssay } = splitPromptAndEssay(chunk)
    const essay = extractEssay(rawEssay)
    if (!essay || essay.length < 50) continue
    const { titleEn, titleZh, outline, directions } = extractTitleAndOutline(prompt)

    const id = `${ctx.year || 0}-${ctx.month || 0}-${level}-${i}`
    if (ctx.year && exams.some((e) => e.year === ctx.year && e.month === ctx.month && e.level === level)) {
      continue
    }

    exams.push({
      id: `${ctx.year}-${ctx.month}-${level}`,
      year: ctx.year,
      month: ctx.month,
      level,
      titleEn,
      titleZh,
      outline,
      directions,
      essay,
      essayParagraphs: formatEssayParagraphs(essay),
      wordCount: countWords(essay),
    })
  }

  return exams
    .filter((e) => e.year > 1990 && e.essay.length > 80)
    .sort((a, b) => b.year - a.year || b.month - a.month || (a.level === 'cet4' ? -1 : 1))
}

const ROMAN = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

function essaySlug(title, label) {
  const base = (title || label || 'essay')
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  return base || 'essay'
}

function extractMockEssayBody(raw, fallbackTopic) {
  const body = clean(raw)
  const titleLine = body.split('\n').find((l) => /^[A-Z]/.test(l.trim()) && l.trim().length > 5)
  return {
    title: titleLine?.trim() || fallbackTopic,
    body,
    paragraphs: formatEssayParagraphs(body),
    wordCount: countWords(body),
  }
}

function parseMockChunk(chunk, idSuffix) {
  const head = chunk.match(/^Model\s+Test\s+(\w+)/i)
  if (!head) return null

  const num = ROMAN[head[1].toLowerCase()] ?? parseInt(head[1], 10)
  const topicM =
    chunk.match(/on the topic\s*["""]?([^""".\n]+)/i) ||
    chunk.match(/composition on the topic\s+([^\n.]+)/i)
  const titleLine = chunk
    .split('\n')
    .find((l) => /^[A-Z][a-z].{8,60}$/.test(l.trim()) && !/^Directions|^Part V|^For this/i.test(l.trim()))
  const topic = topicM ? topicM[1].trim() : titleLine?.trim() || `Model Test ${num}`

  const directions = extractBetween(
    chunk,
    /(?:Directions|For this part)[：:\s]/i,
    /作文范文|参考作文|Reference Writing|^[A-Z][a-z]+ .{10,50}$/m,
  )

  let outlineZh = extractBetween(
    chunk,
    /outline given below in Chinese:\s*/i,
    /作文范文|参考作文|^[A-Z][a-z]{3,}/m,
  )
  if (!outlineZh) {
    outlineZh = chunk
      .split('\n')
      .filter((l) => /^[\d1-9、．.]/.test(l.trim()))
      .join('\n')
  }

  const essays = []
  const mainM = chunk.match(/(?:作文范文|参考作文)\s*([\s\S]*?)(?=Reference Writing|Model\s+Test|$)/i)
  if (mainM) {
    const e = extractMockEssayBody(mainM[1], topic)
    essays.push({ id: essaySlug(e.title, 'main'), label: '主题一', ...e })
  } else if (titleLine) {
    const bodyStart = chunk.indexOf(titleLine)
    const body = chunk.slice(bodyStart).split(/Reference Writing/i)[0]
    if (body.length > 120) {
      const e = extractMockEssayBody(body, topic)
      essays.push({ id: essaySlug(e.title, 'main'), label: '主题一', ...e })
    }
  }

  const refM = chunk.match(/参考作文范文\s*([\s\S]*?)(?=Model\s+Test|$)/i)
  if (refM) {
    const e = extractMockEssayBody(refM[1], 'Reference Writing')
    essays.push({
      id: essaySlug(e.title, 'ref'),
      label: '主题二（Reference）',
      ...e,
    })
  }

  if (!essays.length) return null

  return {
    id: `mock-${num}${idSuffix}`,
    num,
    batch: idSuffix ? 'B' : 'A',
    title: `Model Test ${head[1]}${idSuffix ? ' (补充)' : ''}`,
    topic,
    directions: directions.slice(0, 2000),
    outlineZh: outlineZh.slice(0, 1500),
    essays,
  }
}

function parseMockTests(text) {
  const chunks = text.split(/(?=Model\s+Test\s+(?:One|Two|Three|Four|Five|Six|Seven|Eight|\d+))/i)
  const mocks = []
  const seen = new Set()
  const numOccurrence = {}

  for (const chunk of chunks) {
    const head = chunk.match(/^Model\s+Test\s+(\w+)/i)
    if (!head) continue
    const num = ROMAN[head[1].toLowerCase()] ?? parseInt(head[1], 10)
    if (!num) continue

    const topicM = chunk.match(/on the topic\s*["""]?([^""".\n]+)/i)
    const titleLine = chunk
      .split('\n')
      .find((l) => /^[A-Z][a-z].{8,50}$/.test(l.trim()) && !/Directions|Writing/i.test(l))
    const topicKey = (topicM?.[1] || titleLine || chunk.slice(0, 60)).trim().slice(0, 50)
    const occ = numOccurrence[num] ?? 0
    numOccurrence[num] = occ + 1
    const dedupeKey = `${num}-${topicKey}-${occ}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const idSuffix = occ > 0 ? `-b${occ}` : ''
    const item = parseMockChunk(chunk, idSuffix)
    if (item) mocks.push(item)
  }

  return mocks.sort((a, b) => a.num - b.num || a.id.localeCompare(b.id))
}

function inferCategory(title = '', outline = '', body = '') {
  const text = `${title}\n${outline}\n${body}`.toLowerCase()
  if (/chart|graph|table|diagram|percentage|图表|数据|增长|下降/.test(text)) return '图表作文'
  if (/letter|dear|president|sir|madam|信|申请|建议/.test(text)) return '信函/建议信'
  if (/advantage|disadvantage|pros|cons|positive|negative|观点|利弊|正反/.test(text)) return '正反观点'
  if (/problem|solution|solve|measure|improve|解决|措施|改善/.test(text)) return '问题解决'
  if (/reason|why|cause|because|原因/.test(text)) return '原因分析'
  if (/phenomenon|现象|comment|opinion|view/.test(text)) return '现象评论'
  return '观点论证'
}

function fallbackIdeas(category, title) {
  const topic = title || '题目'
  const map = {
    图表作文: [`概述图表中最明显的变化或对比：${topic}`, '分析变化背后的原因', '总结趋势并给出建议或预测'],
    '信函/建议信': ['说明写信目的', '分点陈述建议、理由或请求', '礼貌收尾并表达期待'],
    正反观点: ['引出争议话题', '分别说明支持与反对理由', '给出个人观点并总结'],
    问题解决: ['指出问题及影响', '分析问题产生的原因', '提出可执行的解决办法'],
    原因分析: ['点明现象或结果', '分析两到三个主要原因', '总结并提出建议'],
    现象评论: ['描述现象', '分析影响或原因', '表达态度并给出建议'],
    观点论证: ['提出中心观点', '用理由和例子展开论证', '总结观点并升华'],
  }
  return map[category] ?? map.观点论证
}

function extractExpressions(text = '') {
  const defaults = [
    'in my opinion',
    'on the one hand',
    'on the other hand',
    'what is more',
    'as a result',
    'to sum up',
  ]
  const phrases = new Set()
  const re =
    /\b(in my opinion|as far as i am concerned|on the one hand|on the other hand|what is more|moreover|therefore|as a result|in conclusion|to sum up|it is obvious that|there is no doubt that|firstly|secondly|finally)\b/gi
  let m
  while ((m = re.exec(text)) !== null) phrases.add(m[1].toLowerCase())
  return [...phrases, ...defaults].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 8)
}

function enrichExam(item) {
  const title = item.titleZh || item.titleEn || ''
  const outlineText = (item.outline ?? []).join('\n')
  const category = inferCategory(title, outlineText, item.essay)
  return {
    ...item,
    category,
    writingIdeas: item.outline?.length ? item.outline : fallbackIdeas(category, title),
    keyExpressions: extractExpressions(item.essay),
  }
}

function enrichMock(item) {
  const title = item.topic || item.title || ''
  const body = item.essays?.map((e) => e.body).join('\n') ?? ''
  const category = inferCategory(title, item.outlineZh || item.directions || '', body)
  return {
    ...item,
    category,
    writingIdeas: item.outlineZh
      ? item.outlineZh.split('\n').filter((l) => l.trim()).slice(0, 5)
      : fallbackIdeas(category, title),
    keyExpressions: extractExpressions(body),
  }
}

const templateText = readTxt('四六级大学英语作文模板大全.txt')
const examText = readTxt('历年英语四六级考试作文题目及范文.txt')
const mockText = readTxt('历年四六级预测试卷四级作文题汇总.txt')

const templates = parseTemplates(templateText)
const phraseLibrary = parsePhrases(templateText)
let pastExams = parsePastExams(examText).map(enrichExam)
const mockTests = parseMockTests(mockText).map(enrichMock)

// 去重：同年月同级保留范文更长者
const examMap = new Map()
for (const e of pastExams) {
  const k = `${e.year}-${e.month}-${e.level}`
  const prev = examMap.get(k)
  if (!prev || e.essay.length > prev.essay.length) examMap.set(k, e)
}
pastExams = [...examMap.values()].sort((a, b) => b.year - a.year || b.month - a.month)

const recentCet4 = pastExams.filter((e) => e.level === 'cet4').slice(0, 12)

let data = {
  title: '四级作文速成',
  subtitle: '模板 → 句型 → 真题 → 预测',
  templates,
  phraseLibrary,
  pastExams,
  recentCet4,
  mockTests,
  studyPlan: [
    { day: '1-2', task: '背正反观点 + 信函框架（②框架 tab）' },
    { day: '3', task: '26 句式 + 套句「开头/结尾」各背 5 条' },
    { day: '4-5', task: '近 5 年四级真题：先看提纲再默写结构' },
    { day: '6', task: '预测模拟 2 篇 + 对照范文' },
    { day: '7', task: '复习收藏 + 朗读范文' },
  ],
  stats: {
    templates: templates.length,
    patterns26: phraseLibrary.patterns26.length,
    phraseSetCategories: Object.keys(phraseLibrary.phraseSets.sets || {}).length,
    basicPatterns: phraseLibrary.basicPatterns.length,
    chartPhrases: phraseLibrary.chartPhrases?.length ?? 0,
    pastExams: pastExams.length,
    mockTests: mockTests.length,
    recentCet4: recentCet4.length,
  },
}

data = applyTextFixesToPack(data)
data = applyAuditToPack(data)

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(data, null, 2), 'utf8')
console.log('essay-materials.json:', data.stats)
