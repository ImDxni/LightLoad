import { weld, dedup, prune, draco } from '@gltf-transform/functions'
import type { Document } from '@gltf-transform/core'
import type { GeometryOptions } from '../types/pipeline'

// Il modulo draco3d esporta una factory CommonJS; in worker ESM va importato così
async function loadDracoEncoder(): Promise<unknown> {
  // draco3d cerca il suo .wasm nella stessa directory del .js.
  // Forziamo il percorso verso /wasm/ dove abbiamo copiato i file.
  const mod = await import('draco3d')
  const factory = (mod as unknown as { default: (opts: unknown) => Promise<unknown> }).default ?? mod

  // @ts-expect-error – tipo opaco
  return (factory as (o: unknown) => Promise<unknown>)({
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
    onProgress('Draco: compressione geometria…')
    const encoder = await loadDracoEncoder()
    await doc.transform(draco({ encoder }))
  }
}
