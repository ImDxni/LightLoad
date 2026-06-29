export interface GeometryOptions {
  weld: boolean
  dedup: boolean
  prune: boolean
  draco: boolean
  meshopt: boolean
  simplify: boolean,
  simplifyRatio: number,
  simplifyError: number,
}

export interface TextureOptions {
  enabled: boolean
  format: 'etc1s' | 'uastc'
  /** Basis Universal quality: 0–255 */
  quality: number
}

export interface OptimizationOptions {
  geometry: GeometryOptions
  texture: TextureOptions
}

export interface TextureInfo {
  name: string
  width: number
  height: number
  mimeType: string
}

/** Estimated VRAM footprint (bytes), split by category. */
export interface VramBreakdown {
  geometry: number
  textures: number
  total: number
}

export interface GLBMetrics {
  fileSize: number
  vertexCount: number
  triangleCount: number
  textureCount: number
  textures: TextureInfo[]
  vram: VramBreakdown
}

/** Messages sent from the UI to the worker. */
export type WorkerRequest =
  | { type: 'optimize'; buffer: ArrayBuffer; options: OptimizationOptions; lng: string }

/** Messages sent from the worker to the UI. */
export type WorkerResponse =
  | { type: 'progress'; message: string; percent: number }
  | { type: 'success'; buffer: ArrayBuffer; metrics: GLBMetrics }
  | { type: 'error'; message: string }
  | { type: 'warning'; message: string }
