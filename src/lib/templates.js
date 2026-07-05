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
