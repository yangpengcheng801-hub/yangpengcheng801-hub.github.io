const PUNCTUATION = /[，。、；：？！""''（）【】《》\[\](),.;:!?'"\-—…·]/g

export function normalizeDocxText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '').replace(PUNCTUATION, '')
}

export function annotateDocxBlocks(host: HTMLElement): number {
  const blocks = host.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, table')
  let index = 0
  blocks.forEach((element) => {
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return
    index += 1
    element.setAttribute('data-docx-block', String(index))
  })
  return index
}

export function clearDocxHighlights(host: HTMLElement): void {
  host.querySelectorAll('.docx-highlight').forEach((node) => node.classList.remove('docx-highlight'))
}

function parseBlockIndex(position: string | undefined): number | null {
  if (!position) return null
  const match = position.match(/段落\s*(\d+)/)
  return match ? Number(match[1]) : null
}

function scrollElementIntoView(scrollContainer: HTMLElement, element: HTMLElement): void {
  const containerRect = scrollContainer.getBoundingClientRect()
  const rect = element.getBoundingClientRect()
  const top = scrollContainer.scrollTop + (rect.top - containerRect.top) - 12
  scrollContainer.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
}

export function scrollToDocxBlock(
  scrollContainer: HTMLElement,
  host: HTMLElement,
  position: string | undefined,
  title?: string | null,
): boolean {
  const blockIndex = parseBlockIndex(position)
  if (blockIndex) {
    const target = host.querySelector(`[data-docx-block="${blockIndex}"]`)
    if (target instanceof HTMLElement) {
      scrollElementIntoView(scrollContainer, target)
      return true
    }
  }
  if (!title) return false
  const needle = normalizeDocxText(title)
  const blocks = host.querySelectorAll('[data-docx-block]')
  for (const block of blocks) {
    if (!(block instanceof HTMLElement)) continue
    if (normalizeDocxText(block.textContent ?? '').includes(needle)) {
      scrollElementIntoView(scrollContainer, block)
      return true
    }
  }
  return false
}

export function locateAndHighlightDocx(
  scrollContainer: HTMLElement,
  host: HTMLElement,
  content: string,
  position?: string,
  title?: string | null,
  shouldScroll = true,
): boolean {
  clearDocxHighlights(host)
  const blockIndex = parseBlockIndex(position)
  if (blockIndex) {
    const target = host.querySelector(`[data-docx-block="${blockIndex}"]`)
    if (target instanceof HTMLElement) {
      target.classList.add('docx-highlight')
      if (shouldScroll) scrollToDocxBlock(scrollContainer, host, position, title)
      return true
    }
  }

  const needle = normalizeDocxText(content.slice(0, 80))
  if (needle.length < 6) {
    if (title && scrollToDocxBlock(scrollContainer, host, position, title)) {
      const heading = host.querySelector(`[data-docx-block]`)
      return Boolean(heading)
    }
    return false
  }

  const blocks = host.querySelectorAll('[data-docx-block]')
  for (const block of blocks) {
    if (!(block instanceof HTMLElement)) continue
    const haystack = normalizeDocxText(block.textContent ?? '')
    if (haystack.includes(needle.slice(0, Math.min(needle.length, 40)))) {
      block.classList.add('docx-highlight')
      if (shouldScroll) scrollElementIntoView(scrollContainer, block)
      return true
    }
  }
  return false
}
