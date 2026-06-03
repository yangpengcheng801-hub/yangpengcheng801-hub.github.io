import { getStatsSummary } from './studyStats'

export default function StreakFlame({ streak }: { streak: number }) {
  if (streak <= 0) {
    return (
      <span className="streak-flame streak-flame--cold" title="今天背几个词，点亮打卡火焰">
        <span className="streak-flame-icon">🔥</span>
        <span className="streak-flame-text">今日待打卡</span>
      </span>
    )
  }

  const hot = streak >= 7
  const warm = streak >= 3

  return (
    <span
      className={`streak-flame ${hot ? 'streak-flame--hot' : warm ? 'streak-flame--warm' : ''}`}
      title={`已连续 ${streak} 天背单词`}
    >
      <span className="streak-flame-icon">{hot ? '🔥' : '🔥'}</span>
      <span className="streak-flame-count">{streak}</span>
      <span className="streak-flame-text">天连续打卡</span>
    </span>
  )
}

export function readStreak(): number {
  return getStatsSummary().streak
}
