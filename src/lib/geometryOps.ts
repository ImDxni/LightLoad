import { weld, dedup, prune, draco } from '@gltf-transform/functions'
import type { Document } from '@gltf-transform/core'
import type { GeometryOptions } from '../types/pipeline'

/**
 * Carica il modulo encoder Draco via importScripts (Web Worker only).
 *
 * draco_encoder_nodejs.js definisce DracoEncoderModule come var top-level.
 * In un worker, dopo importScripts, diventa self.DracoEncoderModule.
 * Il file viene caricato a runtime (non bundled da Vite), quindi i
 * require('fs')/require('path') interni (dentro if(isNode)) non vengono
 * mai chiamati perché isNode === false in browser.
 */
async function loadDracoEncoder(): Promise<unknown> {
  if (typeof (globalThis as Record<string, unknown>).DracoEncoderModule === 'undefined') {
    // @ts-expect-error – importScripts disponibile solo nei worker
    importScripts('/wasm/draco_encoder.js')
  }

  const factory = (globalThis as Record<string, unknown>).DracoEncoderModule as (
    opts: unknown,
  ) => Promise<unknown>

  if (typeof factory !== 'function') {
    throw new Error('DracoEncoderModule non trovato dopo importScripts draco_encoder.js')
  }

  return factory({
    locateFile: (filename: string) => `/wasm/${filename}`,
  })
}

export async function applyGeometryOps(
  doc: Document,
  options: GeometryOptions,
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

  if (transforms.length > 0) {
    await doc.transform(...transforms)
  }

  if (options.draco) {
    onProgress('Draco: caricamento encoder e compressione geometria…')
    const encoder = await loadDracoEncoder()
    await doc.transform(draco({ encoder }))
  }
}
