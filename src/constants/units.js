export const DEFAULT_UNITS = [
  'Sq.Ft',
  'Nos.',
  'Pair',
  'Kg.',
  'Bundle',
  'Rft',
  'Pcs',
  'Patti',
  'Ltr',
  'Pkt',
  'Box',
  'Set',
  'Meter',
  'Sheet',
  'Feet',
  'Inch',
  'Dozen'
]

export function getMergedUnits(products = []) {
  const customFromProducts = (products || [])
    .map(p => p.unit)
    .filter(Boolean)

  const merged = Array.from(new Set([...DEFAULT_UNITS, ...customFromProducts]))
  return merged.sort((a, b) => a.localeCompare(b))
}
