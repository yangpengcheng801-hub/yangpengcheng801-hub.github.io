/** 词义解析与四级常考义项判定（学习页 / 词表共用） */

export type MeaningGroup = {
  pos: string
  items: string[]
}

export type MeaningWord = {
  id: string
  word: string
  meaning: string
  pos?: string
}

export type WordSense = { pos: string; meaning: string }

function splitMeaningItems(text: string): string[] {
  return text
    .split(/[；;,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 四级词库常见词性标记 */
const POS_PATTERN =
  '(?:n|v|adj|adv|prep|conj|pron|vt|vi|aux|det|num|int|art|interj|abbr)'

/** 解析词库释义：按词性分组，每组内拆分多个义项 */
export function parseMeaningGroups(meaning: string): MeaningGroup[] {
  const text = meaning.trim()
  if (!text) return []

  const posRe = new RegExp(`${POS_PATTERN}\\.`, 'gi')
  const markers: Array<{ pos: string; index: number }> = []
  let m: RegExpExecArray | null
  while ((m = posRe.exec(text)) !== null) {
    markers.push({ pos: m[0], index: m.index })
  }

  if (!markers.length) {
    const items = splitMeaningItems(text)
    return items.length ? [{ pos: '', items }] : []
  }

  const groups: MeaningGroup[] = []
  for (let i = 0; i < markers.length; i++) {
    const { pos, index } = markers[i]
    const start = index + pos.length
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length
    const body = text.slice(start, end).trim()
    const items = splitMeaningItems(body)
    if (items.length) groups.push({ pos, items })
  }
  return groups
}

export function extractFirstPos(text: string): string {
  const m = text.match(
    new RegExp(`(?:^|[\\s;；])(${POS_PATTERN}\\.)`, 'i'),
  )
  return m?.[1] ?? ''
}

function getAllMeaningItems(word: MeaningWord): string[] {
  return parseMeaningGroups(word.meaning).flatMap((g) => g.items)
}

/** 去掉 [经管] 等标签，便于展示 */
export function cleanMeaningItem(item: string): string {
  return item.replace(/^\[[^\]]+\]\s*/, '').trim()
}

/** 偏僻/非四常考义项 */
export function isObscureMeaning(item: string): boolean {
  const raw = item.trim()
  if (!raw) return true
  if (/人名|地名|姓氏|音译/.test(raw)) return true
  if (/^\([A-Za-z][^)]*\)/.test(raw)) return true
  if (/^\([^)]*(伊朗|英国|美国|法国|德国|日本|韩国|英|美|法|德|日)[^)]*\)/.test(raw)) return true
  if (/^(?:棒球|垒上|新入伙|喻)/.test(raw)) return true
  if (raw.length > 48) return true
  return false
}

const COMMON_PER_POS = 2

export { COMMON_PER_POS }

export function getCommonItemsForGroup(g: MeaningGroup, maxItems: number): string[] {
  return g.items
    .filter((i) => !isObscureMeaning(i))
    .slice(0, maxItems)
    .map(cleanMeaningItem)
    .filter(Boolean)
}

/** vi/vt 并存时只保留 vi（四六级常考） */
export function getQuizLabelGroups(word: MeaningWord): MeaningGroup[] {
  const groups = parseMeaningGroups(word.meaning)
  const hasVi = groups.some((g) => g.pos.toLowerCase() === 'vi.')
  const hasVt = groups.some((g) => g.pos.toLowerCase() === 'vt.')
  if (hasVi && hasVt) {
    return groups.filter((g) => g.pos.toLowerCase() !== 'vt.')
  }
  return groups
}

export function getAllDisplayItemsForGroup(g: MeaningGroup): string[] {
  return g.items.map(cleanMeaningItem).filter(Boolean)
}

export function getDisplayItemsForGroup(g: MeaningGroup, maxItems = 99): string[] {
  const items = getAllDisplayItemsForGroup(g)
  if (items.length) return items.slice(0, maxItems)
  return []
}

/** 从整段释义生成展示文案（含全部词性、全部义项，不删 vt） */
export function buildFullMeaningLabel(meaningText: string): string {
  const text = meaningText.trim()
  if (!text) return ''
  const groups = parseMeaningGroups(text)
  if (!groups.length) return text

  const segments = groups
    .map((g) => {
      const items = getAllDisplayItemsForGroup(g)
      if (!items.length) return ''
      const joined = items.join('；')
      return g.pos ? `${g.pos} ${joined}` : joined
    })
    .filter(Boolean)

  return segments.length ? segments.join('  ') : text
}

/** 学习页四选一：仅展示四级高频/常考义（用词库原文，不拉词典） */
export function buildQuizOptionLabel(word: MeaningWord): string {
  const groups = getQuizLabelGroups(word)
  if (!groups.length) return word.meaning.trim().slice(0, 40)

  if (groups.length > 1) {
    const segments = groups
      .map((g) => {
        const items = getCommonItemsForGroup(g, 1)
        if (!items.length) return ''
        return g.pos ? `${g.pos} ${items[0]}` : items[0]
      })
      .filter(Boolean)
    if (segments.length) return segments.join('；')
  }

  const g = groups[0]
  const items = getCommonItemsForGroup(g, COMMON_PER_POS)
  if (!items.length) {
    const fb = cleanMeaningItem(g.items[0] ?? '') || g.items[0] || ''
    return g.pos ? `${g.pos} ${fb}` : fb
  }
  const joined = items.join('，')
  return g.pos ? `${g.pos} ${joined}` : joined
}

/** 完整释义展示（答对后展开，可接词典补全后的长文本） */
export function buildDisplayMeaningLabel(
  word: MeaningWord,
  meaningText?: string,
): string {
  const text = (meaningText ?? word.meaning).trim()
  const label = buildFullMeaningLabel(text)
  return label || text.slice(0, 200)
}

/** 常考义项（复习造句 / 词表高亮用，仍取精简常考义） */
export function getCommonMeaningItems(word: MeaningWord): string[] {
  const groups = getQuizLabelGroups(word)
  const common: string[] = []
  const used = new Set<string>()
  const perGroup = groups.length > 1 ? 1 : COMMON_PER_POS

  for (const g of groups) {
    for (const item of getCommonItemsForGroup(g, perGroup)) {
      if (used.has(item)) continue
      used.add(item)
      common.push(item)
    }
  }

  if (!common.length) {
    const all = getAllMeaningItems(word)
    const first = all.find((i) => !isObscureMeaning(i)) ?? all[0]
    return first ? [cleanMeaningItem(first)] : [word.meaning.slice(0, 20)]
  }
  return common
}

export function isCommonMeaningItem(word: MeaningWord, item: string): boolean {
  const cleaned = cleanMeaningItem(item)
  return getCommonMeaningItems(word).includes(cleaned)
}

/** 复习/错词造句：常考义 + 词性 */
export function getWordSentenceSenses(word: MeaningWord): WordSense[] {
  const groups = getQuizLabelGroups(word)
  const senses: WordSense[] = []
  const used = new Set<string>()
  const perGroup = groups.length > 1 ? 1 : COMMON_PER_POS

  for (const g of groups) {
    for (const item of getCommonItemsForGroup(g, perGroup)) {
      if (used.has(item)) continue
      used.add(item)
      senses.push({ pos: g.pos, meaning: item })
    }
  }

  if (!senses.length) {
    return getCommonMeaningItems(word).map((meaning) => ({
      pos: word.pos || '',
      meaning,
    }))
  }
  return senses
}
