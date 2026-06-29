import { weld, dedup, prune, draco, simplify, meshopt } from '@gltf-transform/functions'
import type { Document, WebIO } from '@gltf-transform/core'
import type { GeometryOptions } from '../types/pipeline'
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer'
import { t } from '../i18n/worker'

/**
 * Loads a Draco module (encoder or decoder) via fetch + new Function.
 *
 * importScripts() is NOT available in ESM Web Workers. new Function evaluates
 * the CJS bundle with fake module/exports:
 *   - require('fs')/require('path') sit inside if(isNode), which is false in the browser
 *   - module.exports = DracoEncoderModule/DracoDecoderModule is captured
 */
async function loadDracoModule(jsPath: string): Promise<unknown> {
  const res = await fetch(jsPath)
  if (!res.ok) throw new Error(`${jsPath} not found (HTTP ${res.status})`)
  const scriptText = await res.text()

  const mod = { exports: {} as Record<string, unknown> }
  new Function('module', 'exports', scriptText)(mod, mod.exports)

  const factory = mod.exports as unknown as (opts: unknown) => unknown
  if (typeof factory !== 'function') {
    throw new Error(`Factory not found in ${jsPath}`)
  }

  // May be synchronous (returns the module directly) or asynchronous (a Promise)
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
    onProgress(t('progress.weld'))
    transforms.push(weld())
  }
  if (options.dedup) {
    onProgress(t('progress.dedup'))
    transforms.push(dedup())
  }
  if (options.prune) {
    onProgress(t('progress.prune'))
    transforms.push(prune())
  }

  if (options.simplify) {
    onProgress(t('progress.simplify'))
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

  // Draco and Meshopt both compress geometry: mutually exclusive, Draco wins.
  if (options.draco) {
    onProgress(t('progress.draco'))

    // The Draco compressor must be registered on the IO, NOT passed to draco().
    // Compression happens internally during io.writeBinary().
    const encoder = await loadDracoEncoder()
    io.registerDependencies({ 'draco3d.encoder': encoder })

    // draco() takes no encoder option — only method and quantization
    await doc.transform(draco())
  } else if (options.meshopt) {
    onProgress(t('progress.meshopt'))

    // The encoder must be registered on the IO: EXTMeshoptCompression reads it from
    // the 'meshopt.encoder' dependency during io.writeBinary(). meshopt() reorders/quantizes vertices.
    await MeshoptEncoder.ready
    io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  }
}
