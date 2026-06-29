import type { Document, Texture, Accessor } from '@gltf-transform/core'
import type { VramBreakdown } from '../types/pipeline'

type Ktx2Format = 'etc1s' | 'uastc'

/**
 * WebGL minFilter values that carry a mip chain (*_MIPMAP_*).
 * NEAREST (9728) / LINEAR (9729) → no mips.
 */
const MIP_FILTERS = new Set<number>([9984, 9985, 9986, 9987])

/**
 * Estimates the VRAM footprint of a Document.
 *
 * The GPU decompresses everything before drawing: PNG/JPG and Draco do NOT
 * reduce VRAM (they expand back to full), only KTX2 (ETC1S/UASTC) stays
 * compressed. The estimate reflects this by picking bytes-per-pixel from the
 * target GPU format.
 *
 * @param ktx2Format mode used for KTX2-compressed textures; uncompressed
 *                   textures (png/jpg) stay RGBA8 regardless.
 */
export function computeVramBreakdown(doc: Document, ktx2Format: Ktx2Format): VramBreakdown {
  const geometry = computeGeometry(doc)
  const textures = computeTextures(doc, ktx2Format)
  return { geometry, textures, total: geometry + textures }
}

// -------------------------------------------------------------------
// Geometry
// -------------------------------------------------------------------
function computeGeometry(doc: Document): number {
  // A primitive can have several attributes, and an attribute can be shared
  // across primitives (e.g. POSITION). Track already-counted accessors so the
  // same buffer is never counted twice.
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
// Textures
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
    // uncompressed → RGBA8 = 4; UASTC (→BC7/ASTC) = 1; ETC1S (→BC1/ETC1) = 0.5
    const bytesPerPixel = isKtx2 ? (ktx2Format === 'uastc' ? 1 : 0.5) : 4

    const mipFactor = computeMipFactor(tex, w, h, isKtx2, mipmapped)
    bytes += w * h * bytesPerPixel * mipFactor
  }
  return bytes
}

/** Size from getSize() (png/jpg/webp); falls back to the KTX2 header (pixelWidth@20, pixelHeight@24). */
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
 * - KTX2 with levelCount>0  → use exactly the levels stored in the file.
 * - KTX2 with levelCount==0 → mips generated at runtime → sampler rule.
 * - png/jpg                 → mips generated at runtime → sampler rule.
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
    // levelCount == 0 → falls through to the sampler rule below
  }
  // null/absent → engines generate mips by default → treat as mipmapped
  const hasMip = mipmapped.get(tex) ?? true
  return hasMip ? mipFactorFull(w, h) : 1
}

/** Full mip chain down to 1×1 (real geometric series, not the 4/3 constant). */
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

/** Exact texel sum of the first `levels` levels (KTX2 file with embedded mips). */
function mipFactorLevels(w: number, h: number, levels: number): number {
  let texels = 0
  for (let i = 0; i < levels; i++) {
    texels += Math.max(1, w >> i) * Math.max(1, h >> i)
  }
  return texels / (w * h)
}

/** levelCount from the KTX2 header: little-endian uint32 at offset 40. */
function readKtx2LevelCount(tex: Texture): number {
  const img = tex.getImage()
  if (!img || img.byteLength < 44) return 0
  const view = new DataView(img.buffer, img.byteOffset, img.byteLength)
  return view.getUint32(40, true)
}

/**
 * Maps Texture → mipmapped, derived from the TextureInfo minFilter (the sampler
 * lives on the material usage, not on the Texture). A texture counts as
 * mipmapped if ANY usage has a mip filter or a null/absent minFilter (engine default).
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
    result.set(tex, fs.some((f) => f === null || MIP_FILTERS.has(f)))
  }
  return result
}
