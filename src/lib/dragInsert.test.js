import { describe, expect, it } from 'vitest'
import { scheduledDropBeforeIdFromRects, templateDropBeforePidFromRects } from './dragInsert'

describe('scheduledDropBeforeIdFromRects', () => {
  const rects = [
    { id: 'sport', rect: { left: 100, right: 176, top: 20, bottom: 96 } },
    { id: 'draw', rect: { left: 190, right: 266, top: 20, bottom: 96 } },
    { id: 'piano', rect: { left: 280, right: 356, top: 20, bottom: 96 } },
  ]

  it('finds the insertion slot before the first block whose center is after the pointer', () => {
    expect(scheduledDropBeforeIdFromRects(rects, {
      pointerX: 108,
      pointerY: 58,
      draggingId: 'draw',
    })).toBe('sport')
  })

  it('uses row geometry even when the pointer is in the gap between blocks', () => {
    expect(scheduledDropBeforeIdFromRects(rects, {
      pointerX: 270,
      pointerY: 58,
      draggingId: 'sport',
    })).toBe('piano')
  })

  it('returns null when the pointer is after the last block in the row', () => {
    expect(scheduledDropBeforeIdFromRects(rects, {
      pointerX: 370,
      pointerY: 58,
      draggingId: 'draw',
    })).toBeNull()
  })
})

describe('templateDropBeforePidFromRects', () => {
  const rects = [
    { pid: 'homework', rect: { left: 20, right: 84, top: 20, bottom: 104 } },
    { pid: 'reading', rect: { left: 104, right: 168, top: 20, bottom: 104 } },
    { pid: 'piano', rect: { left: 20, right: 84, top: 124, bottom: 208 } },
    { pid: 'sport', rect: { left: 104, right: 168, top: 124, bottom: 208 } },
  ]

  it('finds the template slot before the first tile whose center is after the pointer', () => {
    expect(templateDropBeforePidFromRects(rects, {
      pointerX: 110,
      pointerY: 64,
      draggingPid: 'sport',
    })).toBe('reading')
  })

  it('moves from the end of one grid row to the first slot of the next row', () => {
    expect(templateDropBeforePidFromRects(rects, {
      pointerX: 188,
      pointerY: 64,
      draggingPid: 'sport',
    })).toBe('piano')
  })

  it('returns null after the final template slot', () => {
    expect(templateDropBeforePidFromRects(rects, {
      pointerX: 188,
      pointerY: 166,
      draggingPid: 'homework',
    })).toBeNull()
  })
})
