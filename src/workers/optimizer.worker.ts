/**
 * Web Worker: pipeline completa di ottimizzazione GLB.
 * Eseguito in un thread separato per non bloccare la UI.
 *
 * Flusso:
 *  1. Leggi il GLB in un Document gltf-transform
 *  2. Operazioni geometria (weld, dedup, prune, draco)
 *  3. Compressione texture KTX2 via libktx.wasm (KhronosGroup)
 *  4. Scrivi il GLB ottimizzato
 *  5. Rispondi con buffer + metriche
 */

import { WebIO, type Document } from '@gltf-transform/core'
import { KHRDracoMeshCompression, KHRTextureBasisu } from '@gltf-transform/extensions'
import type { WorkerRequest, WorkerResponse, OptimizationOptions } from '../types/pipeline'
import { extractMetrics, findNonPow4Textures } from '../lib/metricsExtractor'
import { applyGeometryOps } from '../lib/geometryOps'
import { encodeTextureToKTX2, loadKtxModule } from '../lib/ktx2Encoder'

function send(msg: WorkerResponse) { postMessage(msg) }
function progress(message: string, percent: number) { send({ type: 'progress', message, percent }) }
function warn(message: string) { send({ type: 'warning', message }) }

// -------------------------------------------------------------------
// Compressione texture KTX2
// -------------------------------------------------------------------
async function compressTextures(
  doc: Document,
  options: OptimizationOptions,
): Promise<void> {
  if (!options.texture.enabled) return

  progress('Texture: caricamento libktx.wasm…', 58)

  // Tenta di caricare il modulo; se manca, avvisa e salta senza bloccare
  try {
    await loadKtxModule()
  } catch (e: unknown) {
    warn(`Compressione KTX2 saltata: ${e instanceof Error ? e.message : String(e)}`)
    return
  }

  const textures = doc.getRoot().listTextures()
  if (textures.length === 0) return

  // Avverte per texture non multiple di 4 (requisito KHR_texture_basisu)
  const metrics = extractMetrics(doc, 0)
  const badTextures = findNonPow4Textures(metrics.textures)
  if (badTextures.length > 0) {
    warn(
      `Le seguenti texture non sono multipli di 4 pixel e potrebbero causare ` +
      `artefatti KTX2: ${badTextures.join(', ')}`,
    )
  }

  doc.createExtension(KHRTextureBasisu).setRequired(true)

  for (let i = 0; i < textures.length; i++) {
    const tex = textures[i]
    const name = tex.getName() || `texture_${i}`
    progress(
      `Texture ${i + 1}/${textures.length}: encoding "${name}" (${options.texture.format.toUpperCase()})…`,
      60 + Math.round((30 * i) / textures.length),
    )

    const image = tex.getImage()
    if (!image) continue

    // Decodifica PNG/JPEG in RGBA8 via OffscreenCanvas
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

    // Codifica in KTX2 con Basis Universal
    let ktx2Data: Uint8Array
    try {
      ktx2Data = await encodeTextureToKTX2(
        imageData,
        options.texture.format,
        options.texture.quality,
      )
    } catch (e) {
      warn(`Texture "${name}": encoding KTX2 fallito, saltata (${e})`)
      continue
    }

    tex.setImage(ktx2Data).setMimeType('image/ktx2')
  }
}

// -------------------------------------------------------------------
// Entry point del worker
// -------------------------------------------------------------------
self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  if (ev.data.type !== 'optimize') return

  const { buffer, options } = ev.data

  try {
    progress('Parsing GLB…', 5)

    const io = new WebIO().registerExtensions([KHRDracoMeshCompression, KHRTextureBasisu])

    let doc: Document
    try {
      doc = await io.readBinary(new Uint8Array(buffer))
    } catch (e) {
      send({ type: 'error', message: `GLB non valido o corrotto: ${e}` })
      return
    }

    progress('Geometria: applicazione operazioni…', 15)
    await applyGeometryOps(doc, options.geometry, (msg) => progress(msg, 40))

    await compressTextures(doc, options)

    progress('Scrittura GLB ottimizzato…', 92)
    const outBuffer = await io.writeBinary(doc)
    const afterMetrics = extractMetrics(doc, outBuffer.byteLength)

    progress('Completato!', 100)
    send({ type: 'success', buffer: outBuffer.buffer, metrics: afterMetrics })
  } catch (err: unknown) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
