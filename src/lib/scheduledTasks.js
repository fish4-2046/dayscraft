const BAND_KEYS = ['morning', 'afternoon', 'evening']

function matchesTemplate(block, template) {
  if (!block || !template) return false
  if (block.pid && block.pid === template.pid) return true

  return !block.pid
    && block.icon === template.icon
    && block.label === template.label
    && block.tex === template.tex
}

export function syncScheduledBlocksWithTemplate(days, previousTemplate, nextTemplate) {
  let changed = false

  const nextDays = Object.fromEntries(Object.entries(days).map(([date, day]) => {
    let dayChanged = false
    const nextDay = { ...day }

    for (const band of BAND_KEYS) {
      const blocks = day?.[band] ?? []
      let bandChanged = false
      const nextBlocks = blocks.map((block) => {
        if (!matchesTemplate(block, previousTemplate)) return block

        bandChanged = true
        dayChanged = true
        return {
          ...block,
          pid: nextTemplate.pid,
          icon: nextTemplate.icon,
          label: nextTemplate.label,
          tex: nextTemplate.tex,
        }
      })

      if (bandChanged) nextDay[band] = nextBlocks
    }

    if (!dayChanged) return [date, day]
    changed = true
    return [date, nextDay]
  }))

  return changed ? nextDays : days
}
