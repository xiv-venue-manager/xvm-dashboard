export function stepIndex(index: number, length: number, by: number): number {
  if (length <= 0) return 0
  return (((index + by) % length) + length) % length
}
