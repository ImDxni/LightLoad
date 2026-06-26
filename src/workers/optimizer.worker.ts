import { WebIO, type Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions'
import type { WorkerRequest, WorkerResponse, OptimizationOptions } from '../types/pipeline'
import { extractMetrics, findNonPow4Textures } from '../lib/metricsExtractor'
import { applyGeometryOps, loadDracoDecoder } from '../lib/geometryOps'
import { encodeTextureToKTX2, loadKtxModule } from '../lib/ktx2Encoder'

function send(msg: WorkerResponse) { postMessage(msg) }
function progress(message: string, percent: number) { send({ type: 'progress', message, percent }) }
function warn(message: string) { send({ type: 'warning', message }) }

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

    let imageData: ImageData
    try {
      const blob = new Blob([image], { type: tex.getMimeType() })
      const bmp = await createImageBitmap(blob)
      const canvas = new OffscreenCanvas(bmp.width, bmp.height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bmp, 0, 0)
      imageData = ctx.getImageData(0, 0, bmp.width, bmp.height)
      bmp.close()
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
    const afterMetrics = extractMetrics(doc, outBuffer.byteLength)

    progress('Completato!', 100)
    send({ type: 'success', buffer: outBuffer.buffer, metrics: afterMetrics })
  } catch (err: unknown) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
