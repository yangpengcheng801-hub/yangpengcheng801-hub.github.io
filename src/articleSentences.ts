export type SentencePair = {
  index: number
  en: string
  zh: string
}

/** 段内英文按句号/问号/感叹号拆分（避免正则 lookbehind，兼容旧版 WebView） */
function splitEnglishInParagraph(text: string): string[] {
  const flat = text.replace(/\n/g, ' ').trim()
  if (!flat) return []

  const parts: string[] = []
  let buf = ''
  for (let i = 0; i < flat.length; i++) {
    buf += flat[i]
    const ch = flat[i]
    if (ch !== '.' && ch !== '!' && ch !== '?') continue

    const after = flat.slice(i + 1)
    const ws = after.match(/^\s+/)
    if (!ws) continue

    const rest = after.slice(ws[0].length)
    if (rest.length > 0 && !/^[A-Z"'「(]/.test(rest)) continue

    const sent = buf.trim()
    if (sent) parts.push(sent)
    buf = ''
    i += ws[0].length
  }

  const tail = buf.trim()
  if (tail) parts.push(tail)
  return parts
}

/** 段内中文按句号/叹号/问号/分号拆分 */
function splitChineseInParagraph(text: string): string[] {
  const flat = text.replace(/\n/g, '').trim()
  if (!flat) return []

  const parts: string[] = []
  let buf = ''
  for (const ch of flat) {
    buf += ch
    if ('。！？；'.includes(ch)) {
      const sent = buf.trim()
      if (sent) parts.push(sent)
      buf = ''
    }
  }
  const tail = buf.trim()
  if (tail) parts.push(tail)
  return parts
}

/** 段内英中句数不一致时整段对照，避免按索引比例错位（阅读页译文张冠李戴） */
function alignSentencesInParagraph(
  ens: string[],
  zhs: string[],
): { en: string; zh: string }[] {
  if (!ens.length && !zhs.length) return []
  if (!ens.length) return zhs.map((zh) => ({ en: '', zh }))
  if (!zhs.length) return ens.map((en) => ({ en, zh: '' }))
  if (ens.length === zhs.length) {
    return ens.map((en, i) => ({ en, zh: zhs[i]! }))
  }

  return [{ en: ens.join(' '), zh: zhs.join('') }]
}

/** 按段落对齐后逐句配对，便于汉英对照记忆 */
export function pairArticleSentences(en: string, zh: string): SentencePair[] {
  const enParas = en.split(/\n{2,}/)
  const zhParas = zh.split(/\n{2,}/)
  const pairs: SentencePair[] = []
  let index = 1
  const paraCount = Math.max(enParas.length, zhParas.length)

  for (let i = 0; i < paraCount; i++) {
    const aligned = alignSentencesInParagraph(
      splitEnglishInParagraph(enParas[i] ?? ''),
      splitChineseInParagraph(zhParas[i] ?? ''),
    )
    for (const { en: enSent, zh: zhSent } of aligned) {
      pairs.push({
        index: index++,
        en: enSent,
        zh: zhSent,
      })
    }
  }

  return pairs
}
