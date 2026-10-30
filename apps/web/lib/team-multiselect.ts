const LONG_SUMMARY = 28

export function toggleValue(selected: number[], id: number): number[] {
  const unique = [...new Set(selected)]
  return unique.includes(id) ? unique.filter((value) => value !== id) : [...unique, id]
}

export function summarise(selected: number[], options: { value: number; label: string }[], placeholder: string): string {
  const names = options.filter((option) => selected.includes(option.value)).map((option) => option.label)
  if (names.length === 0) return placeholder
  const joined = names.join(", ")
  return joined.length > LONG_SUMMARY ? `${names.length} roles` : joined
}
