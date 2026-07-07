import { describe, it, expect } from 'vitest'
import { canAddBlock, canPlace, canSmash, validateDropTarget, insertBlockAt } from './rules'

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

describe('validateDropTarget（拖放目标校验）', () => {
  it('黑夜提示优先于过去日期限制，避免一次拖放弹两个错误', () => {
    expect(validateDropTarget('2026-07-03', 'night', { today: T })).toEqual({
      ok: false,
      reason: 'night',
      message: '🧟 黑夜有怪物出没，这是睡觉时间！',
    })
  })

  it('过去的非黑夜日期不可摆放', () => {
    expect(validateDropTarget('2026-07-03', 'morning', { today: T })).toEqual({
      ok: false,
      reason: 'past',
      message: '过去的日子不能改啦',
    })
  })

  it('今天和未来的非黑夜日期可摆放', () => {
    expect(validateDropTarget('2026-07-04', 'morning', { today: T })).toEqual({ ok: true })
    expect(validateDropTarget('2026-07-05', 'evening', { today: T })).toEqual({ ok: true })
  })
})

describe('canAddBlock（时段容量）', () => {
  it('允许同一时段放超过三个任务', () => {
    expect(canAddBlock([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
      { id: 'e' },
    ])).toBe(true)
  })
})

describe('insertBlockAt（任务顺序）', () => {
  const blocks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('把任务插入到目标任务前面', () => {
    expect(insertBlockAt(blocks, { id: 'c' }, 'a').map((block) => block.id)).toEqual(['c', 'a', 'b'])
  })

  it('没有目标任务时追加到末尾', () => {
    expect(insertBlockAt(blocks, { id: 'a' }).map((block) => block.id)).toEqual(['b', 'c', 'a'])
  })

  it('拖到自己身上时保持原数组引用不变', () => {
    expect(insertBlockAt(blocks, { id: 'b' }, 'b')).toBe(blocks)
  })
})
