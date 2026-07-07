export function scheduledDropBeforeIdFromRects(rectBlocks, { pointerX, pointerY, draggingId } = {}) {
  const rowTolerance = 24
  const visibleBlocks = rectBlocks
    .filter((block) => block?.id && block?.rect)
    .sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left))

  const sameRowBlocks = visibleBlocks.filter(({ rect }) => (
    pointerY >= rect.top - rowTolerance && pointerY <= rect.bottom + rowTolerance
  ))
  const rowBlocks = sameRowBlocks.length ? sameRowBlocks : visibleBlocks

  for (const block of rowBlocks) {
    const { rect } = block
    if (block.id === draggingId && pointerX >= rect.left && pointerX <= rect.right) {
      return block.id
    }

    const centerX = rect.left + ((rect.right - rect.left) / 2)
    if (pointerX < centerX) return block.id
  }

  return null
}

export function templateDropBeforePidFromRects(rectTemplates, { pointerX, pointerY } = {}) {
  const rowTolerance = 24
  const visibleTemplates = rectTemplates
    .filter((template) => template?.pid && template?.rect)
    .sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left))

  if (!visibleTemplates.length) return null

  const rows = []
  for (const template of visibleTemplates) {
    const row = rows.find((candidate) => (
      Math.abs(candidate.centerY - ((template.rect.top + template.rect.bottom) / 2)) <= rowTolerance
    ))

    if (row) {
      row.items.push(template)
      row.top = Math.min(row.top, template.rect.top)
      row.bottom = Math.max(row.bottom, template.rect.bottom)
      row.centerY = (row.top + row.bottom) / 2
    } else {
      rows.push({
        top: template.rect.top,
        bottom: template.rect.bottom,
        centerY: (template.rect.top + template.rect.bottom) / 2,
        items: [template],
      })
    }
  }

  rows.forEach((row) => {
    row.items.sort((a, b) => a.rect.left - b.rect.left)
  })

  const rowIndex = rows.findIndex((row) => pointerY <= row.bottom + rowTolerance)
  const activeRowIndex = rowIndex < 0 ? rows.length - 1 : rowIndex
  const activeRow = rows[activeRowIndex]

  for (const template of activeRow.items) {
    const { rect } = template
    const centerX = rect.left + ((rect.right - rect.left) / 2)
    if (pointerX < centerX) return template.pid
  }

  return rows[activeRowIndex + 1]?.items[0]?.pid ?? null
}
