/** Type definitions for the KhronosGroup KTX-Software v4.4.2 (libktx.wasm) wrapper. */

export interface KtxCreateInfoInstance {
  glInternalformat: number
  vkFormat: unknown          // expects the Embind enum object, not an integer
  baseWidth: number
  baseHeight: number
  baseDepth: number
  numDimensions: number
  numLevels: number
  numLayers: number
  numFaces: number
  isArray: boolean
  generateMipmaps: boolean
  [key: string]: unknown
}

export interface KtxBasisParamsInstance {
  uastc: boolean
  qualityLevel: number
  uastcFlags: number
  threadCount: number
  compressionLevel: number
  normalMap: boolean
  [key: string]: unknown
}

export interface KtxTextureInstance {
  setImageFromMemory(level: number, layer: number, faceSlice: number, data: Uint8Array): unknown
  compressBasis(params: KtxBasisParamsInstance): unknown
  writeToMemory(): Uint8Array
  delete(): void
}

export interface KtxModule {
  texture: new (createInfo: KtxCreateInfoInstance, storage: unknown) => KtxTextureInstance
  textureCreateInfo: new () => KtxCreateInfoInstance
  basisParams: new () => KtxBasisParamsInstance
  TextureCreateStorageEnum: Record<string, unknown>
  VkFormat: Record<string, unknown>
  [key: string]: unknown
}

export type KtxFactory = (config?: { locateFile?: (filename: string) => string }) => Promise<KtxModule>

export type MipLevel = { data: Uint8Array; width: number; height: number }
