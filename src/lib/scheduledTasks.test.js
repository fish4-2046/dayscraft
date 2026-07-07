import { describe, expect, it } from 'vitest'
import { syncScheduledBlocksWithTemplate } from './scheduledTasks'

describe('syncScheduledBlocksWithTemplate', () => {
  const previous = { pid: 'hw', icon: '✏️', label: '写作业', tex: 'stone' }
  const next = { pid: 'hw', icon: '✍️', label: '语文作业', tex: 'grass' }

  it('updates scheduled blocks linked by template pid while preserving completion fields', () => {
    const days = {
      '2026-07-06': {
        morning: [{ id: 'a', pid: 'hw', icon: '✏️', label: '写作业', tex: 'stone', done: true, doneAt: 123 }],
        afternoon: [{ id: 'b', pid: 'sport', icon: '⚽', label: '运动', tex: 'grass' }],
        evening: [],
      },
    }

    expect(syncScheduledBlocksWithTemplate(days, previous, next)).toEqual({
      '2026-07-06': {
        morning: [{ id: 'a', pid: 'hw', icon: '✍️', label: '语文作业', tex: 'grass', done: true, doneAt: 123 }],
        afternoon: [{ id: 'b', pid: 'sport', icon: '⚽', label: '运动', tex: 'grass' }],
        evening: [],
      },
    })
  })

  it('updates older scheduled blocks that do not have pid when their old fields match exactly', () => {
    const days = {
      '2026-07-05': {
        morning: [],
        afternoon: [{ id: 'legacy', icon: '✏️', label: '写作业', tex: 'stone' }],
        evening: [{ id: 'custom', icon: '✏️', label: '作文', tex: 'stone' }],
      },
    }

    expect(syncScheduledBlocksWithTemplate(days, previous, next)).toEqual({
      '2026-07-05': {
        morning: [],
        afternoon: [{ id: 'legacy', pid: 'hw', icon: '✍️', label: '语文作业', tex: 'grass' }],
        evening: [{ id: 'custom', icon: '✏️', label: '作文', tex: 'stone' }],
      },
    })
  })
})
