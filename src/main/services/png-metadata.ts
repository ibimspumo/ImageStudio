/**
 * Embed metadata as PNG tEXt chunks.
 * PNG format: 8-byte signature, then chunks (length + type + data + CRC).
 * We insert tEXt chunks before the IEND chunk.
 */
export function embedPngTextChunks(pngBuffer: Buffer, metadata: Record<string, string>): Buffer {
  // Verify PNG signature
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (pngBuffer.subarray(0, 8).compare(PNG_SIGNATURE) !== 0) {
    return pngBuffer // Not a valid PNG, return as-is
  }

  // Find IEND chunk position
  let pos = 8
  let iendPos = -1
  while (pos < pngBuffer.length - 4) {
    const length = pngBuffer.readUInt32BE(pos)
    const type = pngBuffer.subarray(pos + 4, pos + 8).toString('ascii')
    if (type === 'IEND') {
      iendPos = pos
      break
    }
    pos += 12 + length // 4 (length) + 4 (type) + data + 4 (CRC)
  }

  if (iendPos === -1) return pngBuffer

  // Build tEXt chunks
  const textChunks: Buffer[] = []
  for (const [key, value] of Object.entries(metadata)) {
    const keyword = `ImageStudio:${key}`
    const keyBuf = Buffer.from(keyword, 'latin1')
    const nullSep = Buffer.from([0])
    const valBuf = Buffer.from(value, 'latin1')
    const chunkData = Buffer.concat([keyBuf, nullSep, valBuf])

    const chunkType = Buffer.from('tEXt', 'ascii')
    const lengthBuf = Buffer.alloc(4)
    lengthBuf.writeUInt32BE(chunkData.length)

    // CRC over type + data
    const crc = crc32(Buffer.concat([chunkType, chunkData]))
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc >>> 0)

    textChunks.push(Buffer.concat([lengthBuf, chunkType, chunkData, crcBuf]))
  }

  // Reassemble: everything before IEND + new chunks + IEND chunk
  const beforeIend = pngBuffer.subarray(0, iendPos)
  const iendChunk = pngBuffer.subarray(iendPos)
  return Buffer.concat([beforeIend, ...textChunks, iendChunk])
}

/** CRC-32 implementation for PNG chunks */
function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

