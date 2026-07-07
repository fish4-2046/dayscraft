export function visibleTemplates(defaults, hiddenDefaultIds, customs) {
  const hidden = new Set(hiddenDefaultIds)
  return [...defaults.filter((block) => !hidden.has(block.pid)), ...customs]
}

export function hideDefaultTemplate(hiddenDefaultIds, pid) {
  return hiddenDefaultIds.includes(pid) ? hiddenDefaultIds : [...hiddenDefaultIds, pid]
}

export function initialTaskTemplates(defaults, saved) {
  if (Array.isArray(saved?.templates)) return saved.templates
  return visibleTemplates(defaults, saved?.hiddenDefaultIds ?? [], saved?.customs ?? [])
}

export function updateTaskTemplate(templates, next) {
  return templates.map((block) => (block.pid === next.pid ? next : block))
}

export function deleteTaskTemplate(templates, pid) {
  return templates.filter((block) => block.pid !== pid)
}

export function limitTaskLabelInput(label) {
  return Array.from(label).slice(0, 48).join('')
}

export function displayTaskLabel(label) {
  const chars = Array.from(label ?? '')
  return chars.length > 4 ? `${chars.slice(0, 4).join('')}...` : chars.join('')
}

export function reorderTaskTemplate(templates, fromPid, beforePid) {
  if (fromPid === beforePid) return templates
  const fromIndex = templates.findIndex((block) => block.pid === fromPid)
  if (fromIndex < 0) return templates
  if (beforePid != null && !templates.some((block) => block.pid === beforePid)) return templates

  const next = [...templates]
  const [moved] = next.splice(fromIndex, 1)
  const beforeIndex = beforePid == null ? next.length : next.findIndex((block) => block.pid === beforePid)
  next.splice(beforeIndex, 0, moved)
  return next
}
