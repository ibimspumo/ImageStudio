export interface ReuseReferenceGroup {
  label: string
  images: string[]
}

export interface ReuseImageReference {
  name: string
  source: string
}

/** Recover attachment identity from submitted order, never the order of mentions in text. */
export function getReuseImageReferences(input: {
  prompt: string
  attachments?: string[]
  labeledAttachments?: ReuseReferenceGroup[]
}): ReuseImageReference[] {
  const { attachments = [], labeledAttachments } = input
  if (labeledAttachments?.length) {
    let offset = 0
    const references: ReuseImageReference[] = []
    for (const group of labeledAttachments) {
      const sources = group.images.map((source, index) => attachments[offset + index] ?? source)
      offset += group.images.length
      // Collections are restored separately as collections, not renamed Image N.
      if (/^Collection "@.*" \(\d+ images?\)$/.test(group.label)) continue
      for (const [index, source] of sources.entries()) {
        references.push({ name: sources.length === 1 ? group.label : `${group.label} ${index + 1}`, source })
      }
    }
    return references
  }

  // Older records lack labels. Numbered markers always address attachment order.
  // Retain older custom chip names when the prompt has no numbered image markers.
  const hasNumberedMentions = /\[Image [1-9]\d*\]/.test(input.prompt)
  const legacyNames = hasNumberedMentions ? [] : [...new Set(
    [...input.prompt.matchAll(/\[([^@\[\]\r\n]+)\]/g)].map(match => match[1]),
  )]
  return attachments.map((source, index) => ({ name: legacyNames[index] ?? `Image ${index + 1}`, source }))
}
