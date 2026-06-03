/** 例句是否包含待复习/待巩固的单词 */



function escapeRegExp(s: string): string {

  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

}



export function countWordInSentence(sentence: string, word: string): number {

  const base = word.toLowerCase().replace(/[^a-z'-]/g, '')

  if (!base) return 0

  if (base.length <= 2) {

    const exactRe = new RegExp(`\\b${escapeRegExp(base)}\\b`, 'gi')

    return sentence.match(exactRe)?.length ?? 0

  }

  const exactRe = new RegExp(`\\b${escapeRegExp(base)}\\b`, 'gi')

  const exact = sentence.match(exactRe)

  if (exact?.length) return exact.length



  const stem = base.replace(/(ingly|edly|ing|ed|ies|es|s|ly|er|est|ness|ment|tion|sion|able|ible|ful|ive)$/, '')

  if (stem.length >= 4 && stem !== base) {

    const stemRe = new RegExp(`\\b${escapeRegExp(stem)}[a-z]*\\b`, 'gi')

    return sentence.match(stemRe)?.length ?? 0

  }

  return 0

}



export function wordAppearsInSentence(sentence: string, word: string): boolean {

  return countWordInSentence(sentence, word) > 0

}



/** 句中是否出现本组每一个词（允许词形变化） */

export function sentenceCoversAllWords(

  sentence: string,

  words: Array<{ word: string }>,

): boolean {

  if (!sentence.trim() || !words.length) return false

  return words.every((w) => wordAppearsInSentence(sentence, w.word))

}



/** AI 例句校验：覆盖率 + 每词 1～2 次（兼容词形变化导致的重复计数） */

export function validateSentenceCoverage(

  en: string,

  words: Array<{ word: string }>,

): boolean {

  const matched = words.filter((w) => wordAppearsInSentence(en, w.word))

  if (matched.length < Math.ceil(words.length * 0.6)) return false



  for (const w of words) {

    const count = countWordInSentence(en, w.word)

    if (count < 1 || count > 2) return false

  }

  return true

}


