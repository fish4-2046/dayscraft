import { describe, expect, it } from 'vitest'
import { dayToolboxPanelLayout, dayToolboxStripLayout, newTemplateButtonLayout, weekCellTaskLayout } from './layout'

describe('weekCellTaskLayout', () => {
  it('uses two fixed task columns with even side spacing inside the cell', () => {
    expect(weekCellTaskLayout()).toMatchObject({
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 40px)',
      justifyContent: 'space-evenly',
      justifyItems: 'center',
    })
  })

  it('keeps the grid cell inside its assigned week column', () => {
    expect(weekCellTaskLayout()).toMatchObject({
      boxSizing: 'border-box',
      minWidth: 0,
    })
  })
})

describe('newTemplateButtonLayout', () => {
  it('matches regular task block visual sizing while keeping text inside', () => {
    expect(newTemplateButtonLayout(56)).toMatchObject({
      width: 56,
      height: 56,
      boxSizing: 'content-box',
      display: 'flex',
      flexDirection: 'column',
    })
  })
})

describe('dayToolboxPanelLayout', () => {
  it('stretches the iPad side toolbox to align with the schedule height', () => {
    expect(dayToolboxPanelLayout(false)).toMatchObject({
      alignSelf: 'stretch',
      display: 'flex',
      flexDirection: 'column',
      width: 190,
    })
  })

  it('keeps the narrow layout full width above the schedule', () => {
    expect(dayToolboxPanelLayout(true)).toMatchObject({
      alignSelf: 'stretch',
      height: 'auto',
      width: 'auto',
    })
  })
})

describe('dayToolboxStripLayout', () => {
  it('fills the stretched side toolbox while keeping its own scrolling', () => {
    expect(dayToolboxStripLayout(false)).toMatchObject({
      flex: '1 1 auto',
      minHeight: 0,
      maxHeight: 'none',
      overflowY: 'auto',
    })
  })

  it('keeps the compact horizontal tray height on narrow screens', () => {
    expect(dayToolboxStripLayout(true)).toMatchObject({
      flex: '0 0 auto',
      maxHeight: 150,
    })
  })
})
