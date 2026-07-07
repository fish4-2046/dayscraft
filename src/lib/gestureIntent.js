export function toolboxGestureIntent({ dx = 0, dy = 0, toolbox } = {}) {
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  if (Math.hypot(dx, dy) <= 8) return 'pending'

  if (toolbox === 'week' && absX > absY * 1.25) return 'scroll'
  if (toolbox === 'day' && absY > absX * 1.25) return 'scroll'

  return 'drag'
}
