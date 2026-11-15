export function stockLabel(stockCount: number | null): string | null {
  if (stockCount == null) return null
  return stockCount <= 0 ? "Out of stock" : `${stockCount} left`
}
