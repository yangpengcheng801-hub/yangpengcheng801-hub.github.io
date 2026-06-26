const PUNCTUATION = /[，。、；：？！""''（）【】《》\[\](),.;:!?'"\-—…·]/g

export function normalizePdfText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '').replace(PUNCTUATION, '')
}

interface TextSpanItem {
  element: HTMLElement
  normalized: string
  start: number
  end: number
}

function collectTextSpans(textLayer: HTMLElement): TextSpanItem[] {
  const spans = Array.from(textLayer.querySelectorAll('span')).filter(
    (span) => (span.textContent ?? '').trim().length > 0,
  )
  let cursor = 0
  return spans.map((element) => {
    const normalized = normalizePdfText(element.textContent ?? '')
    const item: TextSpanItem = {
      element,
      normalized,
      start: cursor,
      end: cursor + normalized.length,
    }
    cursor = item.end
    return item
  })
}

function findExactRange(haystack: string, content: string): { start: number; end: number } | null {
  const needle = normalizePdfText(content)
  if (!needle) return null
  const index = haystack.indexOf(needle)
  if (index < 0) return null
  return { start: index, end: index + needle.length }
}

function isLikelyHeading(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed || trimmed.includes('\n')) return false
  if (/^(摘要|abstract|引言|绪论|结论|结束语|参考文献|references)$/i.test(trimmed)) return true
  return /^\d+(?:\.\d+)*\s+\S/.test(trimmed) && trimmed.length <= 50
}

function compactHeadingSpans(elements: HTMLElement[]): HTMLElement[] {
  if (elements.length <= 2) return elements
  const tops = elements.map((element) => element.getBoundingClientRect().top)
  const minTop = Math.min(...tops)
  const sameLine = elements.filter((element, index) => tops[index] - minTop < 10)
  return sameLine.length ? sameLine : elements.slice(0, Math.min(6, elements.length))
}

function findMatchRange(haystack: string, needle: string): { start: number; end: number } | null {
  if (!needle) return null
  const sizes = [80, 60, 40, 28, 18, 12]
  for (const size of sizes) {
    const candidate = needle.slice(0, size)
    if (candidate.length < 8) continue
    const index = haystack.indexOf(candidate)
    if (index >= 0) return { start: index, end: index + candidate.length }
  }
  return null
}

function fallbackByOverlap(items: TextSpanItem[], needle: string): TextSpanItem[] {
  if (!needle) return []
  const scored = items
    .map((item) => {
      const overlap = [...needle].filter((char) => item.normalized.includes(char)).length
      return { item, score: overlap / Math.max(item.normalized.length, 1) }
    })
    .filter((entry) => entry.score > 0.35)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, Math.min(8, scored.length)).map((entry) => entry.item)
}

function spansInRange(items: TextSpanItem[], start: number, end: number): HTMLElement[] {
  return items
    .filter((item) => item.end > start && item.start < end)
    .map((item) => item.element)
}

function clearHighlights(textLayer: HTMLElement): void {
  textLayer.querySelectorAll('.pdf-highlight').forEach((node) => node.classList.remove('pdf-highlight'))
  textLayer.querySelectorAll('[data-pdf-highlight-marker]').forEach((node) => node.remove())
}

function placeMarker(textLayer: HTMLElement, elements: HTMLElement[]): void {
  if (!elements.length) return
  const layerRect = textLayer.getBoundingClientRect()
  if (layerRect.width < 20 || layerRect.height < 20) return
  let top = Infinity
  let left = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const element of elements) {
    const rect = element.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue
    top = Math.min(top, rect.top)
    left = Math.min(left, rect.left)
    right = Math.max(right, rect.right)
    bottom = Math.max(bottom, rect.bottom)
  }
  if (!Number.isFinite(top) || right - left < 12 || bottom - top < 6) return
  if (right - left > layerRect.width * 0.92) return
  const marker = document.createElement('div')
  marker.dataset.pdfHighlightMarker = 'true'
  marker.className = 'pdf-highlight-marker'
  marker.style.left = `${left - layerRect.left - 4}px`
  marker.style.top = `${top - layerRect.top - 3}px`
  marker.style.width = `${right - left + 8}px`
  marker.style.height = `${bottom - top + 6}px`
  textLayer.appendChild(marker)
}

export function scrollToElements(container: HTMLElement, elements: HTMLElement[]): void {
  if (!elements.length) return
  let top = Infinity
  let bottom = -Infinity
  for (const element of elements) {
    const rect = element.getBoundingClientRect()
    top = Math.min(top, rect.top)
    bottom = Math.max(bottom, rect.bottom)
  }
  const targetCenter = (top + bottom) / 2
  const containerRect = container.getBoundingClientRect()
  const containerCenter = containerRect.top + containerRect.height / 2
  const delta = targetCenter - containerCenter
  if (Math.abs(delta) < 8) return
  container.scrollBy({ top: delta, behavior: 'auto' })
}

export function clearAllPdfHighlights(root: HTMLElement): void {
  root.querySelectorAll('.pdf-highlight').forEach((node) => node.classList.remove('pdf-highlight'))
  root.querySelectorAll('[data-pdf-highlight-marker]').forEach((node) => node.remove())
}

export function locateChunkInTextLayer(textLayer: HTMLElement, content: string): HTMLElement[] {
  clearHighlights(textLayer)
  const items = collectTextSpans(textLayer)
  if (!items.length) return []

  const haystack = items.map((item) => item.normalized).join('')
  const needle = normalizePdfText(content)
  let matched = isLikelyHeading(content)
    ? findExactRange(haystack, content)
    : findMatchRange(haystack, needle)
  if (!matched) matched = findExactRange(haystack, content)
  if (!matched) matched = findMatchRange(haystack, needle)
  let targets: HTMLElement[] = matched
    ? spansInRange(items, matched.start, matched.end)
    : needle.length >= 18 ? fallbackByOverlap(items, needle.slice(0, 40)).map((item) => item.element) : []

  if (isLikelyHeading(content)) {
    targets = compactHeadingSpans(targets)
  }

  targets.forEach((element) => element.classList.add('pdf-highlight'))
  placeMarker(textLayer, targets)
  return targets
}

export function locateAndScrollToChunk(
  scrollContainer: HTMLElement,
  textLayer: HTMLElement,
  content: string,
  scroll = true,
): boolean {
  const targets = locateChunkInTextLayer(textLayer, content)
  if (!targets.length) return false
  if (scroll) scrollToElements(scrollContainer, targets)
  return true
}
