import { describe, it, expect } from 'vitest'
import { canPlace, canSmash } from './rules'

const T = '2026-07-04' // 固定"今天"便于断言

describe('canPlace（摆块/移动/移回）', () => {
  it('今天和未来可摆', () => {
    expect(canPlace('2026-07-04', { today: T })).toBe(true)
    expect(canPlace('2026-07-05', { today: T })).toBe(true)
    expect(canPlace('2026-07-12', { today: T })).toBe(true)
  })
  it('昨天及更早不可摆', () => {
    expect(canPlace('2026-07-03', { today: T })).toBe(false)
    expect(canPlace('2026-06-22', { today: T })).toBe(false)
  })
  it('补录模式下历史可摆', () => {
    expect(canPlace('2026-06-22', { today: T, backfill: true })).toBe(true)
  })
})

describe('canSmash（敲碎）', () => {
  it('今天可敲', () => {
    expect(canSmash('2026-07-04', { today: T })).toBe(true)
  })
  it('昨天可补敲（含跨周：周一的昨天是上周日）', () => {
    expect(canSmash('2026-07-03', { today: T })).toBe(true)
    expect(canSmash('2026-07-05', { today: '2026-07-06' })).toBe(true)
  })
  it('前天及更早、未来不可敲', () => {
    expect(canSmash('2026-07-02', { today: T })).toBe(false)
    expect(canSmash('2026-07-05', { today: T })).toBe(false)
  })
  it('补录模式下历史可敲', () => {
    expect(canSmash('2026-06-25', { today: T, backfill: true })).toBe(true)
  })
})
