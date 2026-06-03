const KEY = 'cet4-essay-favorites'

export function readEssayFavorites(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function toggleEssayFavorite(id: string): string[] {
  const set = new Set(readEssayFavorites())
  if (set.has(id)) set.delete(id)
  else set.add(id)
  const next = [...set]
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function isEssayFavorite(id: string, list?: string[]): boolean {
  const fav = list ?? readEssayFavorites()
  return fav.includes(id)
}
