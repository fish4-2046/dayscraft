import { describe, it, expect } from 'vitest'
import {
  toStr, fromStr, addDays, mondayOf, weekDates, dowIdx,
  fmtMD, fmtShort, EPOCH_MONDAY,
} from './dates'

describe('dates', () => {
  it('toStr/fromStr 往返一致（本地时区）', () => {
    expect(toStr(new Date(2026, 6, 4))).toBe('2026-07-04')
    expect(toStr(fromStr('2026-07-04'))).toBe('2026-07-04')
  })

  it('addDays 跨月跨年', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('mondayOf：周一为一周起点', () => {
    expect(mondayOf('2026-07-04')).toBe('2026-06-29') // 周六
    expect(mondayOf('2026-06-29')).toBe('2026-06-29') // 周一本身
    expect(mondayOf('2026-07-05')).toBe('2026-06-29') // 周日属于同一周
  })

  it('weekDates 连续 7 天且可跨月', () => {
    const w = weekDates('2026-06-29')
    expect(w).toHaveLength(7)
    expect(w[0]).toBe('2026-06-29')
    expect(w[2]).toBe('2026-07-01')
    expect(w[6]).toBe('2026-07-05')
  })

  it('dowIdx：周一=0 … 周日=6', () => {
    expect(dowIdx('2026-06-29')).toBe(0)
    expect(dowIdx('2026-07-04')).toBe(5)
    expect(dowIdx('2026-07-05')).toBe(6)
  })

  it('格式化', () => {
    expect(fmtMD('2026-07-04')).toBe('7月4日')
    expect(fmtShort('2026-07-04')).toBe('7/4')
  })

  it('起点常量', () => {
    expect(EPOCH_MONDAY).toBe('2026-06-22')
    expect(dowIdx(EPOCH_MONDAY)).toBe(0) // 必须是周一
  })
})
