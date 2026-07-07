export function weekCellTaskLayout() {
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 40px)',
    justifyContent: 'space-evenly',
    justifyItems: 'center',
    alignItems: 'start',
    alignContent: 'start',
    rowGap: 8,
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
  }
}

export function newTemplateButtonLayout(size) {
  return {
    width: size,
    height: size,
    boxSizing: 'content-box',
    flexShrink: 0,
    padding: 0,
    appearance: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  }
}

export function dayToolboxPanelLayout(vertical) {
  return {
    width: vertical ? 'auto' : 190,
    alignSelf: 'stretch',
    display: 'flex',
    flexDirection: 'column',
    height: 'auto',
    minHeight: 0,
    maxHeight: '100%',
  }
}

export function dayToolboxStripLayout(vertical) {
  return {
    flex: vertical ? '0 0 auto' : '1 1 auto',
    minHeight: 0,
    maxHeight: vertical ? 150 : 'none',
    overflowY: 'auto',
    overflowX: 'hidden',
    touchAction: 'none',
    WebkitOverflowScrolling: 'touch',
    overscrollBehaviorY: 'contain',
    paddingRight: 4,
  }
}
