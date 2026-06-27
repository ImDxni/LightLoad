import type { OptimizationOptions } from '../types/pipeline'

export type Profile = 'ecommerce' | 'ar' | 'custom'

/** Preset pronti all'uso. "custom" non ha preset: usa le opzioni correnti. */
export const PROFILE_PRESETS: Record<'ecommerce' | 'ar', OptimizationOptions> = {
  // Massima compressione: Draco + ETC1S + simplify aggressivo (≈30% dei triangoli)
  ecommerce: {
    geometry: { weld: true, dedup: true, prune: true, draco: true, meshopt: false, simplify: true, simplifyRatio: 0.3, simplifyError: 0.01 },
    texture: { enabled: true, format: 'etc1s', quality: 128 },
  },
  // Alta qualità per AR/Meta: Meshopt + UASTC + simplify lieve (≈75% dei triangoli)
  ar: {
    geometry: { weld: true, dedup: true, prune: true, draco: false, meshopt: true, simplify: true, simplifyRatio: 0.75, simplifyError: 0.002 },
    texture: { enabled: true, format: 'uastc', quality: 192 },
  },
}
