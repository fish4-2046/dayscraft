import { describe, expect, it } from 'vitest'
import { completedMaterialHistory } from './history'

describe('completedMaterialHistory', () => {
  it('按材质筛选已完成任务，并按完成时间倒序', () => {
    const days = {
      '2026-07-04': {
        morning: [
          { id: 'a', icon: '📖', label: '读书', tex: 'stone', done: true, doneAt: 200 },
          { id: 'b', icon: '⚽', label: '运动', tex: 'grass', done: true, doneAt: 300 },
        ],
        afternoon: [{ id: 'c', icon: '✏️', label: '写作业', tex: 'stone' }],
        evening: [{ id: 'd', icon: '🎹', label: '练琴', tex: 'stone', done: true, doneAt: 100 }],
      },
      '2026-07-05': {
        morning: [{ id: 'e', icon: '🧹', label: '扫地', tex: 'wood', done: true, doneAt: 400 }],
        afternoon: [{ id: 'f', icon: '📚', label: '阅读', tex: 'stone', done: true, doneAt: 500 }],
        evening: [],
      },
    }

    expect(completedMaterialHistory(days, 'stone')).toEqual([
      { id: 'f', icon: '📚', label: '阅读', tex: 'stone', date: '2026-07-05', band: 'afternoon', doneAt: 500 },
      { id: 'a', icon: '📖', label: '读书', tex: 'stone', date: '2026-07-04', band: 'morning', doneAt: 200 },
      { id: 'd', icon: '🎹', label: '练琴', tex: 'stone', date: '2026-07-04', band: 'evening', doneAt: 100 },
    ])
  })
})
