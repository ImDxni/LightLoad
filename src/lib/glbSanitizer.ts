const GLB_MAGIC = 0x46546c67
const CHUNK_TYPE_JSON = 0x4e4f534a
const CHUNK_TYPE_BIN = 0x004e4942

/**
 * Fixes GLB files whose JSON chunk was padded to the wrong length by a
 * non-compliant exporter (per spec, the JSON chunk must be padded with
 * 0x20 to a 4-byte boundary). gltf-transform reads chunk headers via
 * Uint32Array, which throws if the resulting offset isn't a multiple of 4.
 *
 * Only rebuilds the buffer when every other structural check lines up
 * (magic/version, declared vs. actual length, BIN chunk bounds), if any
 * of those fail the file is genuinely corrupt/truncated, and this returns
 * the original buffer untouched so the normal parse error surfaces.
 */
export function sanitizeGlbPadding(buffer: ArrayBuffer): ArrayBuffer {
  try {
    if (buffer.byteLength < 20) return buffer

    const view = new DataView(buffer)
    if (view.getUint32(0, true) !== GLB_MAGIC) return buffer
    if (view.getUint32(4, true) !== 2) return buffer
    if (view.getUint32(8, true) !== buffer.byteLength) return buffer // declared length mismatch: truncated/corrupt

    const jsonChunkLength = view.getUint32(12, true)
    if (view.getUint32(16, true) !== CHUNK_TYPE_JSON) return buffer

    const jsonByteOffset = 20
    const binByteOffset = jsonByteOffset + jsonChunkLength
    if (binByteOffset > buffer.byteLength) return buffer // JSON chunk longer than the file itself
    if (binByteOffset % 4 === 0) return buffer // already aligned; error must be something else

    if (buffer.byteLength > binByteOffset) {
      if (binByteOffset + 8 > buffer.byteLength) return buffer // BIN header itself missing
      const binChunkLength = view.getUint32(binByteOffset, true)
      const binChunkType = view.getUint32(binByteOffset + 4, true)
      if (binChunkType === CHUNK_TYPE_BIN && binByteOffset + 8 + binChunkLength !== buffer.byteLength) {
        return buffer // BIN chunk data doesn't reach end of file: truncated/corrupt
      }
    }

    const jsonBytes = new Uint8Array(buffer, jsonByteOffset, jsonChunkLength)
    let trimmedLength = jsonChunkLength
    while (trimmedLength > 0 && jsonBytes[trimmedLength - 1] === 0x20) trimmedLength--
    if (trimmedLength === 0) return buffer

    const paddedLength = Math.ceil(trimmedLength / 4) * 4
    const tail = new Uint8Array(buffer, binByteOffset, buffer.byteLength - binByteOffset)

    const newJsonChunk = new Uint8Array(8 + paddedLength)
    new DataView(newJsonChunk.buffer).setUint32(0, paddedLength, true)
    new DataView(newJsonChunk.buffer).setUint32(4, CHUNK_TYPE_JSON, true)
    newJsonChunk.set(jsonBytes.subarray(0, trimmedLength), 8)
    newJsonChunk.fill(0x20, 8 + trimmedLength)

    const newTotalLength = 12 + newJsonChunk.byteLength + tail.byteLength
    const out = new Uint8Array(newTotalLength)
    out.set(new Uint8Array(buffer, 0, 12), 0)
    out.set(newJsonChunk, 12)
    out.set(tail, 12 + newJsonChunk.byteLength)
    new DataView(out.buffer).setUint32(8, newTotalLength, true)

    return out.buffer
  } catch {
    return buffer
  }
}
