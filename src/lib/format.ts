
export function fmtSize(bytes: number): string {
  if (bytes <= 0) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Extracts the numeric value from an Embind enum {value:N} or a plain number. */
export function enumNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v
  if (v !== null && typeof v === 'object' && 'value' in (v as object)) {
    return Number((v as Record<string, unknown>).value)
  }
  return fallback
}