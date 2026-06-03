import { EXAM_DATE_KEY } from './examSchedule'
import { LIBRARY_CHOICE_KEY } from './wordLibrary'

export const BACKUP_VERSION = 1

export type BackupPayload = {
  version: number
  exportedAt: string
  data: Record<string, string>
}

const BACKUP_PREFIXES = ['cet4_']
const BACKUP_KEYS = [EXAM_DATE_KEY, LIBRARY_CHOICE_KEY]

export function collectBackupData(): Record<string, string> {
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    const match =
      BACKUP_PREFIXES.some((p) => key.startsWith(p)) || BACKUP_KEYS.includes(key)
    if (!match) continue
    const val = localStorage.getItem(key)
    if (val !== null) data[key] = val
  }
  return data
}

export function buildBackupPayload(): BackupPayload {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: collectBackupData(),
  }
}

export function exportBackupFile() {
  const payload = buildBackupPayload()
  const date = payload.exportedAt.slice(0, 10)
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cet4-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importBackupPayload(raw: unknown): { ok: true; count: number } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: '文件格式无效' }
  }
  const payload = raw as BackupPayload
  if (!payload.data || typeof payload.data !== 'object') {
    return { ok: false, error: '备份数据缺失' }
  }

  let count = 0
  for (const [key, value] of Object.entries(payload.data)) {
    if (typeof value !== 'string') continue
    const allowed =
      BACKUP_PREFIXES.some((p) => key.startsWith(p)) || BACKUP_KEYS.includes(key)
    if (!allowed) continue
    localStorage.setItem(key, value)
    count++
  }

  if (count === 0) return { ok: false, error: '备份中没有可恢复的数据' }
  return { ok: true, count }
}

export async function importBackupFromFile(file: File) {
  const text = await file.text()
  const json = JSON.parse(text) as unknown
  return importBackupPayload(json)
}

export function countBackupKeys(): number {
  return Object.keys(collectBackupData()).length
}
