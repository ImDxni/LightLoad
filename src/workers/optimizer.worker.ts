import { WebIO, type Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions'
import type { WorkerRequest, WorkerResponse, OptimizationOptions } from '../types/pipeline'
import { extractMetrics } from '../lib/metricsExtractor'
import { sanitizeGlbPadding } from '../lib/glbSanitizer'
import { applyGeometryOps, loadDracoDecoder } from '../lib/geometryOps'
import { encodeTextureToKTX2, loadKtxModule } from '../lib/ktx2Encoder'
import { labelFromMaterialSlot } from '../lib/textureLabel'
import { MeshoptDecoder } from 'meshoptimizer'
import { t, setWorkerLang } from '../i18n/worker'

function send(msg: WorkerResponse) { postMessage(msg) }
function progress(message: string, percent: number) { send({ type: 'progress', message, percent }) }
function warn(message: string) { send({ type: 'warning', message }) }

// -------------------------------------------------------------------
// Texture decoding
// -------------------------------------------------------------------

/**
 * Decodes an image to NON-premultiplied RGBA via WebCodecs.
 *
 * The 2D canvas stores colors premultiplied by alpha: every texel with alpha=0
 * loses its RGB (turns black, unrecoverable) and during mipmapping that black
 * bleeds into thin UV islands. ImageDecoder + copyTo with format 'RGBA' returns
 * un-premultiplied pixels (guaranteed by the W3C spec) and avoids the canvas
 * round-trip. copyTo also converts from YUV formats (JPEGs often decode to
 * I420), so there is no need to handle formats by hand.
 */
async function decodeTextureToRGBA(
  image: Uint8Array,
  mimeType: string,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const decoder = new ImageDecoder({
    data: image,
    type: mimeType,
    // no sRGB conversion: preserves normal maps / ORM (non-color data)
    colorSpaceConversion: 'none',
  })

  let frame: VideoFrame | undefined
  try {
    const decoded = await decoder.decode()
    frame = decoded.image

    const width = frame.displayWidth
    const height = frame.displayHeight

    const buffer = new Uint8Array(frame.allocationSize({ format: 'RGBA' }))
    const layout = await frame.copyTo(buffer, { format: 'RGBA' })

    const tightStride = width * 4
    const { offset, stride } = layout[0]

    // Fast path: the layout is already tightly packed
    if (offset === 0 && stride === tightStride && buffer.byteLength === tightStride * height) {
      return { data: new Uint8ClampedArray(buffer.buffer), width, height }
    }

    // Repack row by row, honoring the layout offset and stride
    const packed = new Uint8ClampedArray(tightStride * height)
    for (let y = 0; y < height; y++) {
      const srcStart = offset + y * stride
      packed.set(buffer.subarray(srcStart, srcStart + tightStride), y * tightStride)
    }
    return { data: packed, width, height }
  } finally {
    // Free native memory: without this we leak on every texture
    frame?.close()
    decoder.close()
  }
}

/**
 * Legacy 2D-canvas path. Fallback when ImageDecoder is unavailable (e.g. older
 * Safari). Premultiplies alpha: used only as a last resort.
 */
async function decodeViaCanvas(
  image: Uint8Array,
  mimeType: string,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const blob = new Blob([image as BlobPart], { type: mimeType })
  const bmp = await createImageBitmap(blob)
  try {
    const canvas = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bmp, 0, 0)
    const data = ctx.getImageData(0, 0, bmp.width, bmp.height)
    return { data: data.data, width: data.width, height: data.height }
  } finally {
    bmp.close()
  }
}

// -------------------------------------------------------------------
// KTX2 texture compression
// -------------------------------------------------------------------
async function compressTextures(doc: Document, options: OptimizationOptions): Promise<void> {
  if (!options.texture.enabled) return

  progress(t('progress.ktxLoad'), 58)
  try {
    await loadKtxModule()
  } catch (e: unknown) {
    warn(t('warnings.ktxSkipped', { error: e instanceof Error ? e.message : String(e) }))
    return
  }

  const textures = doc.getRoot().listTextures()
  if (textures.length === 0) return

  // KHR_texture_basisu (ETC1S/UASTC) requires dimensions that are multiples of 4.
  // encodeTextureToKTX2 pads non-conforming textures up to the next multiple of 4;
  // here we only warn the user.
  const badTextures: string[] = []
  for (const tex of textures) {
    const size = tex.getSize()
    if (!size) continue
    const [width, height] = size
    if (width > 0 && height > 0 && (width % 4 !== 0 || height % 4 !== 0)) {
      badTextures.push(tex.getName() || labelFromMaterialSlot(doc, tex) || `texture_${textures.indexOf(tex)}`)
    }
  }
  if (badTextures.length > 0) {
    warn(t('warnings.nonPow4', { list: badTextures.join(', ') }))
  }

  doc.createExtension(KHRTextureBasisu).setRequired(true)

  for (let i = 0; i < textures.length; i++) {
    const tex = textures[i]
    const name = tex.getName() || labelFromMaterialSlot(doc, tex) || `texture_${i}`
    progress(
      t('progress.texture', { i: i + 1, total: textures.length, name, format: options.texture.format.toUpperCase() }),
      60 + Math.round((30 * i) / textures.length),
    )

    const image = tex.getImage()
    if (!image) continue

    const mimeType = tex.getMimeType()
    let imageData: { data: Uint8ClampedArray | Uint8Array; width: number; height: number }
    try {
      if (typeof ImageDecoder !== 'undefined' && (await ImageDecoder.isTypeSupported(mimeType))) {
        try {
          imageData = await decodeTextureToRGBA(image, mimeType)
        } catch {
          warn(t('warnings.webcodecs', { name }))
          imageData = await decodeViaCanvas(image, mimeType)
        }
      } else {
        warn(t('warnings.webcodecs', { name }))
        imageData = await decodeViaCanvas(image, mimeType)
      }
    } catch (e) {
      warn(t('warnings.decodeFailed', { name, error: String(e) }))
      continue
    }

    let ktx2Data: Uint8Array
    try {
      ktx2Data = await encodeTextureToKTX2(imageData, options.texture.format, options.texture.quality)
    } catch (e) {
      warn(t('warnings.encodeFailed', { name, error: String(e) }))
      continue
    }

    tex.setImage(ktx2Data).setMimeType('image/ktx2')
  }
}

// -------------------------------------------------------------------
// Entry point
// -------------------------------------------------------------------
self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  if (ev.data.type !== 'optimize') return

  const { buffer, options, lng } = ev.data
  setWorkerLang(lng)

  try {
    progress(t('progress.init'), 3)

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS)

    // Register the Draco decoder to read GLBs already Draco-compressed
    // (non-blocking: if the file isn't Draco the decoder is never used)
    try {
      const decoder = await loadDracoDecoder()
      io.registerDependencies({ 'draco3d.decoder': decoder })
    } catch {
      // Decoder unavailable — only matters for already-Draco-compressed GLBs
    }

    // Meshopt decoder to read GLBs already compressed with EXT_meshopt_compression
    try {
      await MeshoptDecoder.ready
      io.registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
    } catch {
      // Decoder unavailable — only matters for already-Meshopt-compressed GLBs
    }

    progress(t('progress.parsing'), 8)
    let doc: Document
    try {
      doc = await io.readBinary(new Uint8Array(sanitizeGlbPadding(buffer)))
    } catch (e) {
      send({ type: 'error', message: t('errors.invalidGlb', { error: String(e) }) })
      return
    }

    progress(t('progress.geometry'), 15)
    // applyGeometryOps registers the Draco encoder on the IO when needed
    await applyGeometryOps(doc, options.geometry, io, (msg) => progress(msg, 40))

    await compressTextures(doc, options)

    progress(t('progress.writing'), 92)
    const outBuffer = await io.writeBinary(doc)
    const afterMetrics = extractMetrics(doc, outBuffer.byteLength, options.texture.format)

    progress(t('progress.done'), 100)
    send({ type: 'success', buffer: outBuffer.buffer, metrics: afterMetrics })
  } catch (err: unknown) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
