// 本地存档：localStorage 单机版（持久化方案第一步，云端 Supabase 后续接入）
// v2 起数据按天存储（days map），v1（单周数组）自动迁移
import { mondayOf, weekDates, todayStr } from './dates'

const LS_KEY = 'dayscraft_state_v1' // key 沿用，靠 version 字段区分版本

export function migrate(raw, today = todayStr()) {
  if (!raw) return null
  if (raw.version === 2) return raw
  if (raw.version === 1 && Array.isArray(raw.week)) {
    const dates = weekDates(mondayOf(today))
    const days = {}
    raw.week.forEach((day, i) => {
      if (day.morning.length || day.afternoon.length || day.evening.length) days[dates[i]] = day
    })
    return {
      version: 2,
      days,
      customs: raw.customs ?? [],
      materials: raw.materials ?? { stone: 0, grass: 0, wood: 0 },
      totalEver: raw.totalEver ?? 0,
      updatedAt: Date.now(),
    }
  }
  return null
}

export function loadLocal() {
  try {
    return migrate(JSON.parse(localStorage.getItem(LS_KEY)))
  } catch {
    return null
  }
}

export function saveLocal(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    /* 存储满或隐私模式，静默降级为内存态 */
  }
}
