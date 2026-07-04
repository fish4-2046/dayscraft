import { describe, it, expect } from 'vitest'
import { migrate } from './storage'

const T = '2026-07-04' // 周六，本周一为 2026-06-29

const v1 = {
  version: 1,
  week: [
    { morning: [{ id: 'a', icon: '📖', label: '读书', tex: 'stone' }], afternoon: [], evening: [] },
    { morning: [], afternoon: [], evening: [] },
    { morning: [], afternoon: [], evening: [] },
    { morning: [], afternoon: [], evening: [] },
    { morning: [], afternoon: [], evening: [] },
    { morning: [], afternoon: [{ id: 'b', icon: '⚽', label: '运动', tex: 'grass' }], evening: [] },
    { morning: [], afternoon: [], evening: [] },
  ],
  customs: [{ pid: 'c1', icon: '🎮', label: '游戏', tex: 'grass' }],
  materials: { stone: 2, grass: 1, wood: 0 },
  totalEver: 3,
  updatedAt: 123,
}

describe('migrate', () => {
  it('v1 的周数组落到迁移执行时的当前周日期，空天不建 key', () => {
    const out = migrate(v1, T)
    expect(out.version).toBe(2)
    expect(out.days['2026-06-29'].morning[0].label).toBe('读书')
    expect(out.days['2026-07-04'].afternoon[0].label).toBe('运动')
    expect(out.days['2026-06-30']).toBeUndefined()
    expect(Object.keys(out.days)).toHaveLength(2)
  })
  it('材料/进度/自定义方块保留', () => {
    const out = migrate(v1, T)
    expect(out.materials).toEqual({ stone: 2, grass: 1, wood: 0 })
    expect(out.totalEver).toBe(3)
    expect(out.customs).toHaveLength(1)
  })
  it('v2 原样返回；空输入返回 null', () => {
    const v2 = { version: 2, days: {}, customs: [], materials: { stone: 0, grass: 0, wood: 0 }, totalEver: 0, updatedAt: 1 }
    expect(migrate(v2, T)).toBe(v2)
    expect(migrate(null, T)).toBeNull()
    expect(migrate({ garbage: true }, T)).toBeNull()
  })
})
