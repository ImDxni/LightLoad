import type { Document, Texture, Accessor } from '@gltf-transform/core'
import type { VramBreakdown } from '../types/pipeline'

type Ktx2Format = 'etc1s' | 'uastc'

/**
 * minFilter con catena mip (WebGL): *_MIPMAP_*.
 * NEAREST (9728) / LINEAR (9729) → nessuna mip.
 */
const MIP_FILTERS = new Set<number>([9984, 9985, 9986, 9987])

/**
 * Stima del peso in VRAM di un Document.
 *
 * La GPU decomprime tutto prima di disegnare: PNG/JPG e Draco NON riducono la
 * VRAM (tornano pieni), solo KTX2 (ETC1S/UASTC) resta compresso. Il calcolo
 * riflette questo selezionando i byte/pixel in base al formato GPU di destino.
 *
 * @param ktx2Format modo usato per le texture compresse in KTX2; le texture non
 *                   compresse (png/jpg) restano RGBA8 a prescindere.
 */
export function computeVramBreakdown(doc: Document, ktx2Format: Ktx2Format): VramBreakdown {
  const geometry = computeGeometry(doc)
  const textures = computeTextures(doc, ktx2Format)
  return { geometry, textures, total: geometry + textures }
}

// -------------------------------------------------------------------
// Geometria
// -------------------------------------------------------------------
function computeGeometry(doc: Document): number {
  // Un primitivo può avere più attributi, e un attributo può essere condiviso tra più prim (es. POSITION).
  // Per evitare di contare due volte lo stesso buffer, teniamo traccia degli accessors già contati.
  const modelAccessors = new Set<Accessor>();

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {


      for (const attr of prim.listAttributes()) {
        modelAccessors.add(attr)
      }

      const idx = prim.getIndices()
      if (idx) modelAccessors.add(idx)
    }
  }

  let bytes = 0;
  
  modelAccessors.forEach((accessor : Accessor) => { bytes += accessor.getByteLength() });

  return bytes
}

// -------------------------------------------------------------------
// Texture
// -------------------------------------------------------------------
function computeTextures(doc: Document, ktx2Format: Ktx2Format): number {
  const mipmapped = buildMipmapMap(doc)
  let bytes = 0

  for (const tex of doc.getRoot().listTextures()) {
    const size = getTextureSize(tex)
    if (!size) continue
    const [w, h] = size
    if (w <= 0 || h <= 0) continue

    const isKtx2 = tex.getMimeType() === 'image/ktx2'
    // non compressa → RGBA8 = 4; UASTC (→BC7/ASTC) = 1; ETC1S (→BC1/ETC1) = 0.5
    const bytesPerPixel = isKtx2 ? (ktx2Format === 'uastc' ? 1 : 0.5) : 4

    const mipFactor = computeMipFactor(tex, w, h, isKtx2, mipmapped)
    bytes += w * h * bytesPerPixel * mipFactor
  }
  return bytes
}

/** Dimensioni: getSize() (png/jpg/webp); fallback header KTX2 (pixelWidth@20, pixelHeight@24). */
function getTextureSize(tex: Texture): [number, number] | null {
  const size = tex.getSize()
  if (size) return [size[0], size[1]]

  const img = tex.getImage()
  if (img && tex.getMimeType() === 'image/ktx2' && img.byteLength >= 28) {
    const view = new DataView(img.buffer, img.byteOffset, img.byteLength)
    const w = view.getUint32(20, true)
    const h = view.getUint32(24, true)
    if (w > 0 && h > 0) return [w, h]
  }
  return null
}

/**
 * mipFactor = Σ (max(1, w>>i) × max(1, h>>i)) / (w × h)
 *
 * - KTX2 con levelCount>0  → usa esattamente i livelli contenuti nel file.
 * - KTX2 con levelCount==0 → mip generate a runtime → regola del sampler.
 * - png/jpg                → mip generate a runtime → regola del sampler.
 */
function computeMipFactor(
  tex: Texture,
  w: number,
  h: number,
  isKtx2: boolean,
  mipmapped: Map<Texture, boolean>,
): number {
  if (isKtx2) {
    const levels = readKtx2LevelCount(tex)
    if (levels > 0) return mipFactorLevels(w, h, levels)
    // levelCount == 0 → ricade sulla regola del sampler ↓
  }
  // null/assente → i motori generano mip di default → trattata come mipmappata
  const hasMip = mipmapped.get(tex) ?? true
  return hasMip ? mipFactorFull(w, h) : 1
}

/** Catena mip completa fino a 1×1 (serie geometrica reale, non la costante 4/3). */
function mipFactorFull(w: number, h: number): number {
  let texels = 0
  let lw = w
  let lh = h
  while (true) {
    texels += lw * lh
    if (lw === 1 && lh === 1) break
    lw = Math.max(1, lw >> 1)
    lh = Math.max(1, lh >> 1)
  }
  return texels / (w * h)
}

/** Somma esatta dei texel dei primi `levels` livelli (file KTX2 con mip incluse). */
function mipFactorLevels(w: number, h: number, levels: number): number {
  let texels = 0
  for (let i = 0; i < levels; i++) {
    texels += Math.max(1, w >> i) * Math.max(1, h >> i)
  }
  return texels / (w * h)
}

/** levelCount dall'header KTX2: uint32 little-endian a offset 40. */
function readKtx2LevelCount(tex: Texture): number {
  const img = tex.getImage()
  if (!img || img.byteLength < 44) return 0
  const view = new DataView(img.buffer, img.byteOffset, img.byteLength)
  return view.getUint32(40, true)
}

/**
 * Mappa Texture → mipmappata, derivata dal minFilter del TextureInfo (il sampler
 * sta sull'uso nei materiali, non sulla Texture). Una texture è mipmappata se
 * basta UN uso con filtro mip o con minFilter null/assente (default dei motori).
 */
function buildMipmapMap(doc: Document): Map<Texture, boolean> {
  const filters = new Map<Texture, Array<number | null>>()

  const record = (
    tex: Texture | null,
    info: { getMinFilter(): number | null } | null,
  ) => {
    if (!tex) return
    const arr = filters.get(tex) ?? []
    arr.push(info ? info.getMinFilter() : null)
    filters.set(tex, arr)
  }

  for (const mat of doc.getRoot().listMaterials()) {
    record(mat.getBaseColorTexture(), mat.getBaseColorTextureInfo())
    record(mat.getMetallicRoughnessTexture(), mat.getMetallicRoughnessTextureInfo())
    record(mat.getNormalTexture(), mat.getNormalTextureInfo())
    record(mat.getOcclusionTexture(), mat.getOcclusionTextureInfo())
    record(mat.getEmissiveTexture(), mat.getEmissiveTextureInfo())
  }

  const result = new Map<Texture, boolean>()
  for (const [tex, fs] of filters) {
    // un solo uso mip/null basta per considerarla mipmappata
    result.set(tex, fs.some((f) => f === null || MIP_FILTERS.has(f)))
  }
  return result
}
