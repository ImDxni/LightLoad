import { weld, dedup, prune, draco, simplify, meshopt } from '@gltf-transform/functions'
import type { Document, WebIO } from '@gltf-transform/core'
import type { GeometryOptions } from '../types/pipeline'
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer'

/**
 * Carica un modulo Draco (encoder o decoder) via fetch + new Function.
 *
 * importScripts() NON è disponibile nei Web Worker ESM.
 * new Function valuta il CJS fornendo module/exports fittizi:
 *   - require('fs')/require('path') sono dentro if(isNode) che è false in browser
 *   - module.exports = DracoEncoderModule/DracoDecoderModule viene catturato
 */
async function loadDracoModule(jsPath: string): Promise<unknown> {
  const res = await fetch(jsPath)
  if (!res.ok) throw new Error(`${jsPath} non trovato (HTTP ${res.status})`)
  const scriptText = await res.text()

  const mod = { exports: {} as Record<string, unknown> }
  new Function('module', 'exports', scriptText)(mod, mod.exports)

  const factory = mod.exports as unknown as (opts: unknown) => unknown
  if (typeof factory !== 'function') {
    throw new Error(`Factory non trovato in ${jsPath}`)
  }

  // Può essere sincrono (ritorna il modulo direttamente) o asincrono (Promise)
  const result = factory({ locateFile: (f: string) => `/wasm/${f}` })
  return result instanceof Promise ? await result : result
}

let encoderCache: unknown = null
let decoderCache: unknown = null

export async function loadDracoEncoder(): Promise<unknown> {
  if (!encoderCache) encoderCache = await loadDracoModule('/wasm/draco_encoder.js')
  return encoderCache
}

export async function loadDracoDecoder(): Promise<unknown> {
  if (!decoderCache) decoderCache = await loadDracoModule('/wasm/draco_decoder.js')
  return decoderCache
}

export async function applyGeometryOps(
  doc: Document,
  options: GeometryOptions,
  io: WebIO,
  onProgress: (msg: string) => void,
): Promise<void> {
  const transforms = []

  if (options.weld) {
    onProgress('Weld: fusione vertici duplicati…')
    transforms.push(weld())
  }
  if (options.dedup) {
    onProgress('Dedup: rimozione accessor duplicati…')
    transforms.push(dedup())
  }
  if (options.prune) {
    onProgress('Prune: eliminazione nodi/materiali inutilizzati…')
    transforms.push(prune())
  }

  if (options.simplify) {
    onProgress('Simplify: semplificazione geometria…')
    await MeshoptSimplifier.ready
    transforms.push(simplify({
      simplifier: MeshoptSimplifier,
      ratio: options.simplifyRatio,
      error: options.simplifyError,
    }))
  }

  if (transforms.length > 0) {
    await doc.transform(...transforms)
  }

  // Draco e Meshopt comprimono entrambi la geometria: mutuamente esclusivi, Draco ha precedenza.
  if (options.draco) {
    onProgress('Draco: caricamento encoder e compressione geometria…')

    // Il compressore Draco va registrato sull'IO, NON passato a draco().
    // La compressione avviene internamente durante io.writeBinary().
    const encoder = await loadDracoEncoder()
    io.registerDependencies({ 'draco3d.encoder': encoder })

    // draco() non prende encoder come opzione — solo metodo e quantizzazione
    await doc.transform(draco())
  } else if (options.meshopt) {
    onProgress('Meshopt: compressione geometria (EXT_meshopt_compression)…')

    // L'encoder va registrato sull'IO: EXTMeshoptCompression lo legge dalla dependency
    // 'meshopt.encoder' durante io.writeBinary(). meshopt() riordina/quantizza i vertici.
    await MeshoptEncoder.ready
    io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  }
}
