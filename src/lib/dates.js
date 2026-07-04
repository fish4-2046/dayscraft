// 本地日期工具：日期一律用本地时区的 "YYYY-MM-DD" 字符串，一周从周一开始
export const EPOCH_MONDAY = '2026-06-22' // 日程表能翻到的最早一周的周一

export function toStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fromStr(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayStr() {
  return toStr(new Date())
}

export function addDays(s, n) {
  const d = fromStr(s)
  d.setDate(d.getDate() + n)
  return toStr(d)
}

export function dowIdx(s) {
  return (fromStr(s).getDay() + 6) % 7 // 周一=0 … 周日=6
}

export function mondayOf(s) {
  return addDays(s, -dowIdx(s))
}

export function weekDates(mondayStr) {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i))
}

export function maxMonday() {
  return addDays(mondayOf(todayStr()), 7) // 最远可翻到下周
}

export function fmtMD(s) {
  const d = fromStr(s)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function fmtShort(s) {
  const d = fromStr(s)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
