import type { ChapterNode } from '@/types'

export const cn = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(' ')

/** 目录中隐藏论文总标题、作者简介等非正文章节。 */
export function shouldSkipOutlinePath(path: string): boolean {
  const leaf = path.split('/').pop()?.trim() ?? path
  if (/^作者简介$/i.test(leaf) || /^about the authors?$/i.test(leaf)) return true
  if (path.includes('/') || /^\d/.test(leaf)) return false
  if (/摘要|abstract|引言|绪论|参考文献|references|结束语/i.test(leaf)) return false
  return leaf.length >= 8 && /研究|论文|综述|分析/.test(leaf)
}

/** 从章节结构或文件名解析论文标题。 */
export function resolvePaperTitle(structure: string[], filename: string): string {
  const fromStructure = structure.find((path) => {
    const leaf = path.split('/').pop()?.trim() ?? path
    if (path.includes('/') || /^\d/.test(leaf)) return false
    return !/摘要|abstract|引言|绪论|参考文献|references|结束语|作者简介/i.test(leaf)
  })
  return fromStructure ?? filename.replace(/\.(pdf|docx)$/i, '')
}

/** 将后端的章节路径列表转换为可递归渲染的章节树。 */
export function buildChapterTree(paths: string[]): ChapterNode[] {
  const nodeMap = new Map<string, ChapterNode>()
  const visiblePaths = paths.filter((path) => !shouldSkipOutlinePath(path))

  const ensureNode = (path: string, title: string, parentPath: string | null): ChapterNode => {
    const existing = nodeMap.get(path)
    if (existing) return existing
    const node: ChapterNode = { id: path, title, path, children: [] }
    nodeMap.set(path, node)
    if (parentPath) {
      const parent = nodeMap.get(parentPath)
      if (parent && !parent.children.some((child) => child.id === node.id)) {
        parent.children.push(node)
      }
    }
    return node
  }

  const roots: ChapterNode[] = []
  visiblePaths.forEach((path) => {
    const segments = path.split('/').filter(Boolean)
    let parentPath: string | null = null
    let currentPath = ''
    segments.forEach((title) => {
      currentPath = currentPath ? `${currentPath}/${title}` : title
      const node = ensureNode(currentPath, title, parentPath)
      if (!parentPath && !roots.some((item) => item.id === node.id)) {
        roots.push(node)
      }
      parentPath = currentPath
    })
  })

  const sortNodes = (nodes: ChapterNode[]): ChapterNode[] => {
    const order = (path: string): [number, number[], string] => {
      const leaf = path.split('/').pop() ?? path
      const match = leaf.match(/^(\d+(?:\.\d+)*)\s/)
      if (match) {
        return [1, match[1].split('.').map(Number), path]
      }
      if (/参考文献|references|作者简介/i.test(leaf)) return [4, [], path]
      if (/摘要|abstract|引言|绪论/i.test(leaf)) return [0, [], path]
      return [2, [], path]
    }
    return [...nodes]
      .sort((a, b) => {
        const left = order(a.path)
        const right = order(b.path)
        if (left[0] !== right[0]) return left[0] - right[0]
        const maxLen = Math.max(left[1].length, right[1].length)
        for (let index = 0; index < maxLen; index += 1) {
          const diff = (left[1][index] ?? 0) - (right[1][index] ?? 0)
          if (diff !== 0) return diff
        }
        return left[2].localeCompare(right[2], 'zh-CN')
      })
      .map((node) => ({ ...node, children: sortNodes(node.children) }))
  }

  return sortNodes(roots)
}

export const createId = (): string => crypto.randomUUID()

export function fileKind(file: File): 'pdf' | 'docx' {
  return file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx'
}

