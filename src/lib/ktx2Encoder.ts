/**
 * Wrapper per libktx.wasm di KhronosGroup KTX-Software v4.4.2.
 *
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

/**
 * BasisU (ETC1S/UASTC) richiede dimensioni multiple di 4. Le texture non conformi vengono automaticamente
 * estese al multiplo di 4 maggiori.
 */
function padToMultipleOf4(
  img: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
): { data: Uint8Array; width: number; height: number } {
  const { width: w, height: h } = img
  const pw = (w + 3) & ~3
  const ph = (h + 3) & ~3
  const src = img.data instanceof Uint8Array
    ? img.data
    : new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength)

  if (pw === w && ph === h) return { data: src, width: w, height: h }

  const dst = new Uint8Array(pw * ph * 4)
  for (let y = 0; y < ph; y++) {
    const sy = y < h ? y : h - 1
    for (let x = 0; x < pw; x++) {
      const sx = x < w ? x : w - 1
      const s = (sy * w + sx) * 4
      const d = (y * pw + x) * 4
      dst[d] = src[s]
      dst[d + 1] = src[s + 1]
      dst[d + 2] = src[s + 2]
      dst[d + 3] = src[s + 3]
    }
  }
  return { data: dst, width: pw, height: ph }
}

type MipLevel = { data: Uint8Array; width: number; height: number }

/**
 * Genera la catena di mipmap completa per evitare effetto aliasing
 */
function generateMipChain(base: MipLevel): MipLevel[] {
  const levels: MipLevel[] = [base]
  let { data: src, width: w, height: h } = base

  while (w > 1 || h > 1) {
    const dw = Math.max(1, w >> 1)
    const dh = Math.max(1, h >> 1)
    const dst = new Uint8Array(dw * dh * 4)

    for (let y = 0; y < dh; y++) {
      const y0 = Math.min(y * 2, h - 1)
      const y1 = Math.min(y * 2 + 1, h - 1)
      for (let x = 0; x < dw; x++) {
        const x0 = Math.min(x * 2, w - 1)
        const x1 = Math.min(x * 2 + 1, w - 1)
        const p00 = (y0 * w + x0) * 4
        const p01 = (y0 * w + x1) * 4
        const p10 = (y1 * w + x0) * 4
        const p11 = (y1 * w + x1) * 4
        const a00 = src[p00 + 3], a01 = src[p01 + 3], a10 = src[p10 + 3], a11 = src[p11 + 3]
        const aSum = a00 + a01 + a10 + a11
        const d = (y * dw + x) * 4

        if (aSum === 0) {
          // tutto trasparente: media RGB semplice per non perdere il colore di base
          dst[d] = (src[p00] + src[p01] + src[p10] + src[p11]) >> 2
          dst[d + 1] = (src[p00 + 1] + src[p01 + 1] + src[p10 + 1] + src[p11 + 1]) >> 2
          dst[d + 2] = (src[p00 + 2] + src[p01 + 2] + src[p10 + 2] + src[p11 + 2]) >> 2
          dst[d + 3] = 0
        } else {
          // RGB pesato per alpha, alpha = media dei 4 texel
          dst[d] = Math.round((src[p00] * a00 + src[p01] * a01 + src[p10] * a10 + src[p11] * a11) / aSum)
          dst[d + 1] = Math.round((src[p00 + 1] * a00 + src[p01 + 1] * a01 + src[p10 + 1] * a10 + src[p11 + 1] * a11) / aSum)
          dst[d + 2] = Math.round((src[p00 + 2] * a00 + src[p01 + 2] * a01 + src[p10 + 2] * a10 + src[p11 + 2] * a11) / aSum)
          dst[d + 3] = (aSum + 2) >> 2
        }
      }
    }

    levels.push({ data: dst, width: dw, height: dh })
    src = dst; w = dw; h = dh
  }

  return levels
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

  // Snap a multiplo di 4 (richiesto da BasisU) prima di costruire il textureCreateInfo
  const padded = padToMultipleOf4(imageData)

  // Calcola la mip chain: senza mipmap le texture compresse fanno aliasing in lontananza
  const mips = generateMipChain(padded)

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
  ci.baseWidth = padded.width
  ci.baseHeight = padded.height
  ci.baseDepth = 1
  ci.numDimensions = 2
  ci.numLevels = mips.length
  ci.numLayers = 1
  ci.numFaces = 1
  ci.isArray = false
  ci.generateMipmaps = false

  const texture = new ktx.texture(ci, storageEnumObj)

  try {
    for (let level = 0; level < mips.length; level++) {
      const setResult = texture.setImageFromMemory(level, 0, 0, mips[level].data)
      if (!isKtxSuccess(setResult)) throw new Error(`setImageFromMemory[${level}]: ${enumNum(setResult, -1)}`)
    }

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
