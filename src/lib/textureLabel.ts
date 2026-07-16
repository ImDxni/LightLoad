import type { Document, Material, Texture } from '@gltf-transform/core'

const TEXTURE_SLOTS: Array<[string, (m: Material) => Texture | null]> = [
  ['Base Color', (m) => m.getBaseColorTexture()],
  ['Metallic Roughness', (m) => m.getMetallicRoughnessTexture()],
  ['Normal', (m) => m.getNormalTexture()],
  ['Occlusion', (m) => m.getOcclusionTexture()],
  ['Emissive', (m) => m.getEmissiveTexture()],
]

export function labelFromMaterialSlot(doc: Document, tex: Texture): string | null {
  for (const material of doc.getRoot().listMaterials()) {
    for (const [slot, getTexture] of TEXTURE_SLOTS) {
      if (getTexture(material) === tex) {
        return `${material.getName() || 'Material'} (${slot})`
      }
    }
  }
  return null
}
