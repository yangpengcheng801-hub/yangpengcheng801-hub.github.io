/** 从有道 jsonapi 解析四级考频信息 */

const DICT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export function parseYoudaoExamInfo(data) {
  if (!data || typeof data !== 'object') return null

  const examTypes = new Set()
  const collect = (arr) => {
    if (!Array.isArray(arr)) return
    for (const t of arr) {
      const s = String(t ?? '').trim()
      if (s) examTypes.add(s)
    }
  }

  collect(data?.ec?.exam_type)
  collect(data?.exam_type)

  let frequency = 0
  let year = 0
  let recommendationRate = 0

  const scan = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.examInfo && typeof node.examInfo === 'object') {
      const info = node.examInfo
      frequency = Math.max(frequency, Number(info.frequency) || 0)
      year = Math.max(year, Number(info.year) || 0)
      recommendationRate = Math.max(
        recommendationRate,
        Number(info.recommendationRate) || 0,
      )
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') scan(v)
    }
  }
  scan(data)

  const isCet4 =
    [...examTypes].some((t) => /CET4|四级|专四/i.test(t)) || frequency > 0

  if (!isCet4 && frequency === 0) return null

  return {
    frequency,
    year,
    recommendationRate,
    examTypes: [...examTypes],
    isCet4,
  }
}

export async function fetchYoudaoExamInfo(word) {
  const q = String(word ?? '').trim().toLowerCase()
  if (!q) return null
  const res = await fetch(
    `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(q)}&doctype=json`,
    { headers: { 'User-Agent': DICT_UA } },
  )
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  return parseYoudaoExamInfo(data)
}
