import type { OptimizationOptions } from '../types/pipeline'

export type Profile = 'ecommerce' | 'ar' | 'custom'

/** Ready-made presets. "custom" has no preset: it keeps the current options. */
export const PROFILE_PRESETS: Record<'ecommerce' | 'ar', OptimizationOptions> = {
  // Max compression: Draco + ETC1S + aggressive simplify (≈30% of triangles)
  ecommerce: {
    geometry: { weld: true, dedup: true, prune: true, draco: true, meshopt: false, simplify: true, simplifyRatio: 0.3, simplifyError: 0.01 },
    texture: { enabled: true, format: 'etc1s', quality: 128 },
  },
  // High quality for AR/Meta: Meshopt + UASTC + light simplify (≈75% of triangles)
  ar: {
    geometry: { weld: true, dedup: true, prune: true, draco: false, meshopt: true, simplify: true, simplifyRatio: 0.75, simplifyError: 0.002 },
    texture: { enabled: true, format: 'uastc', quality: 192 },
  },
}
