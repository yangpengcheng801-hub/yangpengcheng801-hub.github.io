import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  buildBackupPayload,
  importBackupPayload,
  type BackupPayload,
} from './dataBackup'

export const SYNC_CODE_KEY = 'cet4_sync_code_v1'
export const SYNC_ENABLED_KEY = 'cet4_sync_enabled_v1'
export const SYNC_LAST_KEY = 'cet4_sync_last_v1'
export const SYNC_LAST_ERROR_KEY = 'cet4_sync_last_error_v1'

export type CloudSyncResult =
  | { ok: true; action: 'pushed' | 'pulled' | 'merged' | 'noop'; message: string }
  | { ok: false; error: string }

let client: SupabaseClient | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let pushing = false

function getClient(): SupabaseClient | null {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url?.trim() || !key?.trim()) return null
  client = createClient(url.trim(), key.trim())
  return client
}

export function isCloudSyncConfigured(): boolean {
  return !!getClient()
}

export function isSyncEnabled(): boolean {
  try {
    return localStorage.getItem(SYNC_ENABLED_KEY) === '1' && !!getSyncCode()
  } catch {
    return false
  }
}

export function getSyncCode(): string {
  try {
    return localStorage.getItem(SYNC_CODE_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function getLastSyncLabel(): string {
  try {
    const raw = localStorage.getItem(SYNC_LAST_KEY)
    if (!raw) return '从未同步'
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return raw
    return d.toLocaleString('zh-CN', { hour12: false })
  } catch {
    return '从未同步'
  }
}

export function setSyncCode(code: string) {
  localStorage.setItem(SYNC_CODE_KEY, code.trim())
}

export function setSyncEnabled(enabled: boolean) {
  localStorage.setItem(SYNC_ENABLED_KEY, enabled ? '1' : '0')
}

function markSynced() {
  localStorage.setItem(SYNC_LAST_KEY, new Date().toISOString())
  localStorage.removeItem(SYNC_LAST_ERROR_KEY)
}

function markSyncError(message: string) {
  try {
    localStorage.setItem(SYNC_LAST_ERROR_KEY, message)
  } catch {
    /* ignore */
  }
}

export function getLastSyncError(): string {
  try {
    return localStorage.getItem(SYNC_LAST_ERROR_KEY) ?? ''
  } catch {
    return ''
  }
}

/** 各设备统一算法（HTTP 局域网与 HTTPS 结果一致，避免手机/平板对不上） */
function deriveSyncId(code: string): string {
  const normalized = code.trim()
  if (!normalized) return ''
  let h = 5381
  for (let i = 0; i < normalized.length; i++) {
    h = ((h << 5) + h) ^ normalized.charCodeAt(i)
  }
  return `cet4-${Math.abs(h >>> 0).toString(36)}-${normalized.length}`
}

function compareExportedAt(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime()
}

async function fetchRemote(syncId: string): Promise<{ payload: BackupPayload; updatedAt: string } | null> {
  const sb = getClient()
  if (!sb) return null
  const { data, error } = await sb
    .from('cet4_sync')
    .select('payload, updated_at')
    .eq('sync_id', syncId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.payload) return null
  return {
    payload: data.payload as BackupPayload,
    updatedAt: String(data.updated_at ?? ''),
  }
}

async function upsertRemote(syncId: string, payload: BackupPayload) {
  const sb = getClient()
  if (!sb) throw new Error('未配置云同步')
  const { error } = await sb.from('cet4_sync').upsert(
    {
      sync_id: syncId,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'sync_id' },
  )
  if (error) throw new Error(error.message)
}

export async function pushToCloud(): Promise<CloudSyncResult> {
  if (!isCloudSyncConfigured()) {
    return { ok: false, error: '未配置 Supabase，请在 .env.local 填写 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY' }
  }
  const code = getSyncCode()
  if (!code || code.length < 4) {
    return { ok: false, error: '同步码至少 4 位' }
  }
  if (pushing) return { ok: true, action: 'noop', message: '同步进行中' }
  pushing = true
  try {
    const syncId = deriveSyncId(code)
    const payload = buildBackupPayload()
    await upsertRemote(syncId, payload)
    markSynced()
    return { ok: true, action: 'pushed', message: `已上传 ${Object.keys(payload.data).length} 项` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '上传失败'
    markSyncError(msg)
    return { ok: false, error: msg }
  } finally {
    pushing = false
  }
}

export async function pullFromCloud(forceApply = false): Promise<CloudSyncResult & { appliedRemote?: boolean }> {
  if (!isCloudSyncConfigured()) {
    return { ok: false, error: '未配置 Supabase' }
  }
  const code = getSyncCode()
  if (!code) return { ok: false, error: '请先设置同步码' }

  try {
    const syncId = deriveSyncId(code)
    const remote = await fetchRemote(syncId)
    if (!remote) {
      return { ok: true, action: 'noop', message: '云端暂无数据，可在本机学习后上传' }
    }

    const local = buildBackupPayload()
    const remoteNewer = compareExportedAt(remote.payload.exportedAt, local.exportedAt) > 0

    if (remoteNewer || forceApply) {
      const res = importBackupPayload(remote.payload)
      if (!res.ok) return { ok: false, error: res.error }
      markSynced()
      return {
        ok: true,
        action: 'pulled',
        message: `已从云端恢复 ${res.count} 项`,
        appliedRemote: true,
      }
    }

    return { ok: true, action: 'noop', message: '本机数据已是最新' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '下载失败' }
  }
}

/** 双向同步：先拉再推，以较新数据为准 */
export async function runCloudSync(autoReload = false): Promise<CloudSyncResult & { appliedRemote?: boolean }> {
  if (!isSyncEnabled()) return { ok: true, action: 'noop', message: '未开启云同步' }

  const code = getSyncCode()
  if (!code || code.length < 4) {
    return { ok: false, error: '同步码至少 4 位' }
  }

  try {
    const syncId = deriveSyncId(code)
    const remote = await fetchRemote(syncId)
    const local = buildBackupPayload()

    if (!remote) {
      await upsertRemote(syncId, local)
      markSynced()
      return { ok: true, action: 'pushed', message: '首次上传完成' }
    }

    const diff = compareExportedAt(remote.payload.exportedAt, local.exportedAt)
    if (diff > 0) {
      const res = importBackupPayload(remote.payload)
      if (!res.ok) return { ok: false, error: res.error }
      markSynced()
      if (autoReload) {
        return {
          ok: true,
          action: 'pulled',
          message: `已合并云端较新数据（${res.count} 项）`,
          appliedRemote: true,
        }
      }
      return { ok: true, action: 'pulled', message: `已恢复 ${res.count} 项`, appliedRemote: true }
    }

    if (diff < 0) {
      await upsertRemote(syncId, local)
      markSynced()
      return { ok: true, action: 'pushed', message: '已上传本机较新进度' }
    }

    markSynced()
    return { ok: true, action: 'noop', message: '已与云端一致' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '同步失败'
    markSyncError(msg)
    return { ok: false, error: msg }
  }
}

export function scheduleCloudPush(delayMs = 4000) {
  if (!isSyncEnabled()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushToCloud().then((res) => {
      if (!res.ok) markSyncError(res.error)
    })
  }, delayMs)
}

export async function enableCloudSync(code: string): Promise<CloudSyncResult & { appliedRemote?: boolean }> {
  if (!isCloudSyncConfigured()) {
    return { ok: false, error: '服务端未配置 Supabase，请联系开发者或自行配置 .env.local' }
  }
  if (code.trim().length < 4) {
    return { ok: false, error: '同步码至少 4 位，手机和平板请填相同同步码' }
  }
  setSyncCode(code)
  setSyncEnabled(true)
  const result = await runCloudSync(true)
  if (result.ok && !result.appliedRemote) {
    await pushToCloud()
  }
  return result
}

export function disableCloudSync() {
  setSyncEnabled(false)
  if (pushTimer) clearTimeout(pushTimer)
}
