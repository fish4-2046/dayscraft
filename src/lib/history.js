const BAND_KEYS = ['morning', 'afternoon', 'evening']

export function completedMaterialHistory(days, tex) {
  return Object.entries(days ?? {})
    .flatMap(([date, day]) => BAND_KEYS.flatMap((band) => (
      (day?.[band] ?? [])
        .filter((block) => block.done && block.tex === tex)
        .map((block) => ({
          id: block.id,
          icon: block.icon,
          label: block.label,
          tex: block.tex,
          date,
          band,
          doneAt: block.doneAt,
        }))
    )))
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
}
