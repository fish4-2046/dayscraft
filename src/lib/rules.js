// 编辑规则：过去的看、今天的敲、将来的摆（设计文档第 4 节）
import { todayStr, addDays } from './dates'

export function canPlace(date, { today = todayStr(), backfill = false } = {}) {
  if (backfill) return true
  return date >= today // 未来上限由周导航钳制，这里不重复判断
}

export function canSmash(date, { today = todayStr(), backfill = false } = {}) {
  if (backfill) return true
  return date === today || date === addDays(today, -1)
}
