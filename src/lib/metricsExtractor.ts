import type { Document } from '@gltf-transform/core'
import type { GLBMetrics, TextureInfo } from '../types/pipeline'

export function extractMetrics(doc: Document, fileSize: number): GLBMetrics {
  let vertexCount = 0
  let triangleCount = 0

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (pos) vertexCount += pos.getCount()

      const idx = prim.getIndices()
      if (idx) {
        triangleCount += idx.getCount() / 3
      } else if (pos) {
        triangleCount += pos.getCount() / 3
      }
    }
  }

  const textures: TextureInfo[] = doc.getRoot().listTextures().map((tex) => {
    const image = tex.getImage()
    let width = 0
    let height = 0

    // Leggo le dimensioni dal blob PNG/JPEG se disponibili
    if (image) {
      try {
        const view = new DataView(image.buffer, image.byteOffset)
        const mime = tex.getMimeType()
        if (mime === 'image/png' && image.length >= 24) {
          width = view.getUint32(16, false)
          height = view.getUint32(20, false)
        } else if (mime === 'image/jpeg' || mime === 'image/jpg') {
          // Cerca SOF marker nel JPEG
          let offset = 2
          while (offset < image.length - 8) {
            const marker = view.getUint16(offset, false)
            const segLen = view.getUint16(offset + 2, false)
            if ((marker & 0xff00) === 0xff00 &&
                marker >= 0xffc0 && marker <= 0xffcf &&
                marker !== 0xffc4 && marker !== 0xffc8) {
              height = view.getUint16(offset + 5, false)
              width = view.getUint16(offset + 7, false)
              break
            }
            offset += 2 + segLen
          }
        }
      } catch {
        // Dimensioni non leggibili
      }
    }

    return {
      name: tex.getName() || '(senza nome)',
      width,
      height,
      mimeType: tex.getMimeType(),
    }
  })

  return {
    fileSize,
    vertexCount: Math.round(vertexCount),
    triangleCount: Math.round(triangleCount),
    textureCount: textures.length,
    textures,
  }
}

/** Controlla che le dimensioni siano multipli di 4 (requisito KHR_texture_basisu) */
export function findNonPow4Textures(textures: TextureInfo[]): string[] {
  return textures
    .filter((t) => t.width > 0 && (t.width % 4 !== 0 || t.height % 4 !== 0))
    .map((t) => `${t.name} (${t.width}×${t.height})`)
}
