import { WebIO, type Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions'
import type { WorkerRequest, WorkerResponse, OptimizationOptions } from '../types/pipeline'
import { extractMetrics, findNonPow4Textures } from '../lib/metricsExtractor'
import { applyGeometryOps, loadDracoDecoder } from '../lib/geometryOps'
import { encodeTextureToKTX2, loadKtxModule } from '../lib/ktx2Encoder'
import { MeshoptDecoder } from 'meshoptimizer'

function send(msg: WorkerResponse) { postMessage(msg) }
function progress(message: string, percent: number) { send({ type: 'progress', message, percent }) }
function warn(message: string) { send({ type: 'warning', message }) }

// -------------------------------------------------------------------
// Decodifica texture
// -------------------------------------------------------------------

/**
 * Decodifica un'immagine in RGBA NON premoltiplicato via WebCodecs.
 *
 * Il canvas 2D memorizza i colori premoltiplicati per l'alpha: ogni texel con
 * alpha=0 perde l'RGB (torna nero, non recuperabile) e in fase di mipmap quel
 * nero sbava nelle isole UV sottili. ImageDecoder + copyTo con format 'RGBA'
 * restituisce pixel un-premultiplied (garantito dalla spec W3C) ed evita il
 * round-trip sul canvas. copyTo gestisce anche la conversione da formati YUV
 * (i JPEG decodificano spesso in I420), quindi non serve gestire i formati a mano.
 */
async function decodeTextureToRGBA(
  image: Uint8Array,
  mimeType: string,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const decoder = new ImageDecoder({
    data: image,
    type: mimeType,
    // niente conversione sRGB: preserva normal map / ORM (dati non-colore)
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

    // Fast path: il layout è già tightly-packed
    if (offset === 0 && stride === tightStride && buffer.byteLength === tightStride * height) {
      return { data: new Uint8ClampedArray(buffer.buffer), width, height }
    }

    // Ricompatta riga per riga rispettando offset e stride del layout
    const packed = new Uint8ClampedArray(tightStride * height)
    for (let y = 0; y < height; y++) {
      const srcStart = offset + y * stride
      packed.set(buffer.subarray(srcStart, srcStart + tightStride), y * tightStride)
    }
    return { data: packed, width, height }
  } finally {
    // Libera la memoria nativa: senza questo si perde memoria a ogni texture
    frame?.close()
    decoder.close()
  }
}

/**
 * Vecchio percorso canvas 2D. Fallback quando ImageDecoder non è disponibile
 * (es. Safari datati). Premoltiplica l'alpha: usato solo come ultima risorsa.
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
// Compressione texture KTX2
// -------------------------------------------------------------------
async function compressTextures(doc: Document, options: OptimizationOptions): Promise<void> {
  if (!options.texture.enabled) return

  progress('Texture: caricamento libktx.wasm…', 58)
  try {
    await loadKtxModule()
  } catch (e: unknown) {
    warn(`Compressione KTX2 saltata: ${e instanceof Error ? e.message : String(e)}`)
    return
  }

  const textures = doc.getRoot().listTextures()
  if (textures.length === 0) return

  const metrics = extractMetrics(doc, 0)
  const badTextures = findNonPow4Textures(metrics.textures)
  if (badTextures.length > 0) {
    warn(`Texture non multipli di 4 px (possibili artefatti KTX2): ${badTextures.join(', ')}`)
  }

  doc.createExtension(KHRTextureBasisu).setRequired(true)

  for (let i = 0; i < textures.length; i++) {
    const tex = textures[i]
    const name = tex.getName() || `texture_${i}`
    progress(
      `Texture ${i + 1}/${textures.length}: "${name}" (${options.texture.format.toUpperCase()})…`,
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
          warn(
            `Decodifica WebCodecs non disponibile per "${name}": le texture con trasparenza potrebbero presentare artefatti.`,
          )
          imageData = await decodeViaCanvas(image, mimeType)
        }
      } else {
        warn(
          `Decodifica WebCodecs non disponibile per "${name}": le texture con trasparenza potrebbero presentare artefatti.`,
        )
        imageData = await decodeViaCanvas(image, mimeType)
      }
    } catch (e) {
      warn(`Texture "${name}": decodifica fallita, saltata (${e})`)
      continue
    }

    let ktx2Data: Uint8Array
    try {
      ktx2Data = await encodeTextureToKTX2(imageData, options.texture.format, options.texture.quality)
    } catch (e) {
      warn(`Texture "${name}": encoding KTX2 fallito, saltata (${e})`)
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

  const { buffer, options } = ev.data

  try {
    progress('Inizializzazione…', 3)

    // Crea il WebIO e registra tutte le estensioni
    const io = new WebIO().registerExtensions(ALL_EXTENSIONS)

    // Registra il decoder Draco per leggere GLB già compressi con Draco
    // (non blocca: se il file non è Draco il decoder non viene usato)
    try {
      const decoder = await loadDracoDecoder()
      io.registerDependencies({ 'draco3d.decoder': decoder })
    } catch {
      // Decoder non disponibile — fallisce solo su GLB già Draco-compressi
    }

    // Decoder Meshopt per leggere GLB già compressi con EXT_meshopt_compression
    try {
      await MeshoptDecoder.ready
      io.registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
    } catch {
      // Decoder non disponibile — fallisce solo su GLB già Meshopt-compressi
    }

    progress('Parsing GLB…', 8)
    let doc: Document
    try {
      doc = await io.readBinary(new Uint8Array(buffer))
    } catch (e) {
      send({ type: 'error', message: `GLB non valido o corrotto: ${e}` })
      return
    }

    progress('Geometria…', 15)
    // Passa io ad applyGeometryOps — registra l'encoder Draco sull'IO se necessario
    await applyGeometryOps(doc, options.geometry, io, (msg) => progress(msg, 40))

    await compressTextures(doc, options)

    progress('Scrittura GLB…', 92)
    const outBuffer = await io.writeBinary(doc)
    const afterMetrics = extractMetrics(doc, outBuffer.byteLength, options.texture.format)

    progress('Completato!', 100)
    send({ type: 'success', buffer: outBuffer.buffer, metrics: afterMetrics })
  } catch (err: unknown) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
