/**
 * Wrapper per libktx.wasm di KhronosGroup KTX-Software v4.4.2.
 *
 * libktx implementa internamente Basis Universal (ETC1S e UASTC)
 * e produce file KTX2 validi per KHR_texture_basisu.
 *
 * File necessari in /wasm/:  libktx.js  e  libktx.wasm
 * Ottenuti da:
 *   https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2
 *   (KTX-Software-4.4.2-Web-libktx.zip)
 */

// VK_FORMAT_R8G8B8A8_UNORM = 37  (formato sorgente RGBA8)
const VK_FORMAT_R8G8B8A8_UNORM = 37

interface KtxCreateInfo {
  vkFormat: number
  baseWidth: number
  baseHeight: number
  baseDepth: number
  numDimensions: number
  numLevels: number
  numLayers: number
  numFaces: number
  isArray: boolean
  generateMipmaps: boolean
}

interface KtxBasisParams {
  uastc: boolean
  qualityLevel: number        // ETC1S: 1–255
  uastcFlags?: number         // UASTC quality flags (default 0 = standard)
  threadCount: number
  compressionLevel: number    // 0–5
  normalMap?: boolean
  maxEndpoints?: number
  maxSelectors?: number
  noEndpointRDO?: boolean
  noSelectorRDO?: boolean
}

interface KtxTexture {
  setImageFromMemory(level: number, layer: number, faceSlice: number, data: Uint8Array): number
  compressBasisEx(params: KtxBasisParams): number
  writeToMemory(): Uint8Array
  delete(): void
}

interface KtxTextureConstructor {
  new (createInfo: KtxCreateInfo): KtxTexture
}

interface KtxModule {
  ktxTexture: KtxTextureConstructor
  ErrorCode: Record<string, number>
}

// Dichiarazione del factory globale iniettato da libktx.js
declare global {
  const createKtxModule: (config?: {
    locateFile?: (filename: string) => string
  }) => Promise<KtxModule>
}

let cachedModule: KtxModule | null = null

/**
 * Carica libktx.wasm (una sola volta, poi usa la cache).
 * Richiede che /wasm/libktx.js e /wasm/libktx.wasm siano serviti
 * dalla root del progetto.
 */
export async function loadKtxModule(): Promise<KtxModule> {
  if (cachedModule) return cachedModule

  // In Web Worker si usa importScripts (sincrono) per caricare il glue JS
  try {
    // @ts-expect-error – importScripts è disponibile solo nei worker
    importScripts('/wasm/libktx.js')
  } catch (e) {
    throw new Error(
      'libktx.js non trovato in /wasm/. ' +
      'Esegui "npm run setup:wasm" — il file viene scaricato automaticamente.',
    )
  }

  const factory = (
    globalThis as unknown as { createKtxModule: typeof createKtxModule }
  ).createKtxModule

  if (typeof factory !== 'function') {
    throw new Error('createKtxModule non trovato dopo aver caricato libktx.js')
  }

  cachedModule = await factory({
    locateFile: (filename: string) => `/wasm/${filename}`,
  })

  return cachedModule
}

/**
 * Codifica un'immagine RGBA8 in un file KTX2 con compressione Basis Universal.
 *
 * @param imageData  Pixel RGBA8 (da OffscreenCanvas.getImageData o simile)
 * @param format     'etc1s' → massima compressione, 'uastc' → massima qualità
 * @param quality    0–255 (Basis ETC1S quality level; ignorato per UASTC)
 */
export async function encodeTextureToKTX2(
  imageData: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  format: 'etc1s' | 'uastc',
  quality: number,
): Promise<Uint8Array> {
  const ktx = await loadKtxModule()

  const createInfo: KtxCreateInfo = {
    vkFormat: VK_FORMAT_R8G8B8A8_UNORM,
    baseWidth: imageData.width,
    baseHeight: imageData.height,
    baseDepth: 1,
    numDimensions: 2,
    numLevels: 1,
    numLayers: 1,
    numFaces: 1,
    isArray: false,
    generateMipmaps: false,
  }

  const texture = new ktx.ktxTexture(createInfo)

  try {
    // Carica i pixel RGBA nel texture object
    const rgba = new Uint8Array(imageData.data.buffer)
    const setResult = texture.setImageFromMemory(0, 0, 0, rgba)
    if (setResult !== 0) {
      throw new Error(`setImageFromMemory fallito con codice ${setResult}`)
    }

    // Comprime con Basis Universal
    const params: KtxBasisParams = {
      uastc: format === 'uastc',
      qualityLevel: Math.max(1, Math.min(255, quality)),
      threadCount: 1,           // i Worker non supportano thread multipli
      compressionLevel: 2,      // equilibrio velocità/qualità (range 0–5)
    }
    if (format === 'uastc') {
      // UASTC flags: 0 = default quality, 4 = fastest, 2 = slower/better
      params.uastcFlags = 2
    }

    const compressResult = texture.compressBasisEx(params)
    if (compressResult !== 0) {
      throw new Error(`compressBasisEx fallito con codice ${compressResult}`)
    }

    // Ottieni il file KTX2 come Uint8Array
    const result = texture.writeToMemory()
    if (!result || result.byteLength === 0) {
      throw new Error('writeToMemory ha restituito un buffer vuoto')
    }

    // Copia il risultato prima di chiamare delete() (il buffer WASM viene liberato)
    return result.slice(0)
  } finally {
    texture.delete()
  }
}

/**
 * Verifica (senza bloccare) se libktx.js è presente in /wasm/.
 */
export async function checkKtxAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/wasm/libktx.js', { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}
