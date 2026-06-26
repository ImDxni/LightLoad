export interface GeometryOptions {
  weld: boolean
  dedup: boolean
  prune: boolean
  draco: boolean
  simplify: boolean,
  simplifyRatio: number,
  simplifyError: number,
}

export interface TextureOptions {
  enabled: boolean
  format: 'etc1s' | 'uastc'
  /** Qualità Basis Universal: 0–255 */
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

export interface GLBMetrics {
  fileSize: number
  vertexCount: number
  triangleCount: number
  textureCount: number
  textures: TextureInfo[]
}

/** Messaggi inviati dalla UI al worker */
export type WorkerRequest =
  | { type: 'optimize'; buffer: ArrayBuffer; options: OptimizationOptions }

/** Messaggi inviati dal worker alla UI */
export type WorkerResponse =
  | { type: 'progress'; message: string; percent: number }
  | { type: 'success'; buffer: ArrayBuffer; metrics: GLBMetrics }
  | { type: 'error'; message: string }
  | { type: 'warning'; message: string }
