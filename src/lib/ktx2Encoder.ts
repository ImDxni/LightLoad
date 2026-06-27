/**
 * Wrapper per libktx.wasm di KhronosGroup KTX-Software v4.4.2.
 *
 * Note sul binding Embind di libktx:
 *  - Le enum (VkFormat, TextureCreateStorageEnum) sono oggetti {value:N}, non interi
 *  - Il setter textureCreateInfo.vkFormat accetta solo l'oggetto enum, non un intero
 *  - I metodi dell'istanza texture: setImageFromMemory, compressBasis, writeToMemory
 *  - basisParams: struct Embind con campi uastc, qualityLevel, threadCount, compressionLevel
 */
import { t } from '../i18n/worker'

interface KtxCreateInfoInstance {
  glInternalformat: number
  vkFormat: unknown          // vuole l'oggetto enum Embind, non un intero
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

interface KtxBasisParamsInstance {
  uastc: boolean
  qualityLevel: number
  uastcFlags: number
  threadCount: number
  compressionLevel: number
  normalMap: boolean
  [key: string]: unknown
}

interface KtxTextureInstance {
  setImageFromMemory(level: number, layer: number, faceSlice: number, data: Uint8Array): unknown
  compressBasis(params: KtxBasisParamsInstance): unknown
  writeToMemory(): Uint8Array
  delete(): void
}

interface KtxModule {
  texture: new (createInfo: KtxCreateInfoInstance, storage: unknown) => KtxTextureInstance
  textureCreateInfo: new () => KtxCreateInfoInstance
  basisParams: new () => KtxBasisParamsInstance
  TextureCreateStorageEnum: Record<string, unknown>
  VkFormat: Record<string, unknown>
  [key: string]: unknown
}

type KtxFactory = (config?: { locateFile?: (filename: string) => string }) => Promise<KtxModule>

let cachedModule: KtxModule | null = null

/** Estrae il valore numerico da un enum Embind {value:N} o da un numero diretto */
function enumNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v
  if (v !== null && typeof v === 'object' && 'value' in (v as object)) {
    return Number((v as Record<string, unknown>).value)
  }
  return fallback
}

/** Controlla se il risultato Embind è successo (void, 0, o enum {value:0}) */
function isKtxSuccess(result: unknown): boolean {
  if (result === undefined || result === null) return true
  if (result === 0) return true
  if (typeof result === 'object') {
    const val = (result as Record<string, unknown>).value
    return val === 0 || val === undefined
  }
  return false
}

export async function loadKtxModule(): Promise<KtxModule> {
  if (cachedModule) return cachedModule

  const res = await fetch('/wasm/libktx.js')
  if (!res.ok) throw new Error(t('errors.ktxNotFound'))

  const mod = { exports: {} as Record<string, unknown> }
  new Function('module', 'exports', await res.text())(mod, mod.exports)

  const factory = mod.exports as unknown as KtxFactory
  if (typeof factory !== 'function') throw new Error(t('errors.ktxFactory'))

  cachedModule = await factory({ locateFile: (f) => `/wasm/${f}` })
  return cachedModule
}

export async function encodeTextureToKTX2(
  imageData: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  format: 'etc1s' | 'uastc',
  quality: number,
): Promise<Uint8Array> {
  const ktx = await loadKtxModule()

  // Gli enum Embind sono oggetti {value:N} — il costruttore li vuole come tali
  const storageEnum = ktx.TextureCreateStorageEnum as Record<string, unknown>
  const storageEnumObj = storageEnum.ALLOC_STORAGE ?? storageEnum.alloc

  const vkEnum = ktx.VkFormat as Record<string, unknown>
  const vkFormatEnumObj = vkEnum.VK_FORMAT_R8G8B8A8_UNORM ?? vkEnum.R8G8B8A8_UNORM

  // Crea il textureCreateInfo via Embind struct
  // I campi enum (vkFormat) vogliono l'oggetto enum, non un intero
  const ci = new ktx.textureCreateInfo() as KtxCreateInfoInstance
  ci.glInternalformat = 0
  ;(ci as Record<string, unknown>).vkFormat = vkFormatEnumObj
  ci.baseWidth = imageData.width
  ci.baseHeight = imageData.height
  ci.baseDepth = 1
  ci.numDimensions = 2
  ci.numLevels = 1
  ci.numLayers = 1
  ci.numFaces = 1
  ci.isArray = false
  ci.generateMipmaps = false

  const texture = new ktx.texture(ci, storageEnumObj)

  try {
    const rgba = new Uint8Array(imageData.data.buffer)
    const setResult = texture.setImageFromMemory(0, 0, 0, rgba)
    if (!isKtxSuccess(setResult)) throw new Error(`setImageFromMemory: ${enumNum(setResult, -1)}`)

    const params = new ktx.basisParams()
    params.uastc = format === 'uastc'
    params.qualityLevel = Math.max(1, Math.min(255, quality))
    params.threadCount = 1
    params.compressionLevel = 2
    params.normalMap = false
    if (format === 'uastc') params.uastcFlags = 2

    const compResult = texture.compressBasis(params)
    if (!isKtxSuccess(compResult)) throw new Error(`compressBasis: ${enumNum(compResult, -1)}`)

    const result = texture.writeToMemory()
    if (!result || result.byteLength === 0) throw new Error('writeToMemory vuoto')

    return result.slice(0)
  } finally {
    texture.delete()
  }
}
