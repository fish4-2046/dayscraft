import { describe, expect, it } from 'vitest'
import { toolboxGestureIntent } from './gestureIntent'

describe('toolboxGestureIntent', () => {
  it('lets the week toolbox use horizontal movement for tray scrolling', () => {
    expect(toolboxGestureIntent({ dx: 28, dy: 6, toolbox: 'week' })).toBe('scroll')
    expect(toolboxGestureIntent({ dx: -28, dy: 6, toolbox: 'week' })).toBe('scroll')
  })

  it('keeps upward movement in the week toolbox available for dragging into the schedule', () => {
    expect(toolboxGestureIntent({ dx: 6, dy: -28, toolbox: 'week' })).toBe('drag')
    expect(toolboxGestureIntent({ dx: 16, dy: -28, toolbox: 'week' })).toBe('drag')
  })

  it('does not turn day toolbox gestures into horizontal scrolling', () => {
    expect(toolboxGestureIntent({ dx: 28, dy: 6, toolbox: 'day' })).toBe('drag')
  })

  it('lets the day toolbox use vertical movement for tray scrolling', () => {
    expect(toolboxGestureIntent({ dx: 6, dy: 28, toolbox: 'day' })).toBe('scroll')
    expect(toolboxGestureIntent({ dx: 6, dy: -28, toolbox: 'day' })).toBe('scroll')
  })

  it('waits while the movement is still small', () => {
    expect(toolboxGestureIntent({ dx: 5, dy: 2, toolbox: 'week' })).toBe('pending')
  })
})
