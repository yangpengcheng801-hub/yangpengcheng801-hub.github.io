import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { getDueSrsCount } from './spacedReview'

export const REMINDER_ENABLED_KEY = 'cet4_reminder_enabled_v1'
export const REMINDER_HOUR_KEY = 'cet4_reminder_hour_v1'
export const REMINDER_MINUTE_KEY = 'cet4_reminder_minute_v1'

const NOTIFICATION_ID = 1001

export function getReminderEnabled(): boolean {
  return localStorage.getItem(REMINDER_ENABLED_KEY) === '1'
}

export function setReminderEnabled(on: boolean) {
  localStorage.setItem(REMINDER_ENABLED_KEY, on ? '1' : '0')
}

export function getReminderTime(): { hour: number; minute: number } {
  const hour = Number(localStorage.getItem(REMINDER_HOUR_KEY) ?? 20)
  const minute = Number(localStorage.getItem(REMINDER_MINUTE_KEY) ?? 0)
  return {
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 20,
    minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0,
  }
}

export function setReminderTime(hour: number, minute: number) {
  localStorage.setItem(REMINDER_HOUR_KEY, String(hour))
  localStorage.setItem(REMINDER_MINUTE_KEY, String(minute))
}

export async function requestReminderPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true
  const perm = await LocalNotifications.requestPermissions()
  return perm.display === 'granted'
}

export async function scheduleDailyReminder(): Promise<string> {
  if (!getReminderEnabled()) {
    await cancelDailyReminder()
    return '已关闭每日提醒'
  }

  const { hour, minute } = getReminderTime()
  const due = getDueSrsCount()

  if (Capacitor.isNativePlatform()) {
    const ok = await requestReminderPermission()
    if (!ok) return '未获得通知权限，请在系统设置中允许通知'

    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] })

    const now = new Date()
    const first = new Date()
    first.setHours(hour, minute, 0, 0)
    if (first.getTime() <= now.getTime()) first.setDate(first.getDate() + 1)

    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          title: '四级背单词',
          body:
            due > 0
              ? `今日有 ${due} 个错词待复习，坚持一下！`
              : '该背单词啦，今天也要加油！',
          schedule: {
            at: first,
            repeats: true,
            every: 'day',
          },
          sound: undefined,
          smallIcon: 'ic_launcher',
        },
      ],
    })
    return `已设置每天 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} 提醒`
  }

  return `浏览器版无法后台推送；已记录提醒时间 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}（请用 APK）`
}

export async function cancelDailyReminder() {
  if (!Capacitor.isNativePlatform()) return
  await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] })
}
