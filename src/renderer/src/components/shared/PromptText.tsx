import { memo } from 'react'
import { splitPromptMentions } from '../../../../shared/reference-mentions'

/** Presentation only: copying, storage, provider requests and MCP keep the raw prompt. */
export const PromptText = memo(function PromptText({ text, compact = false }: { text: string; compact?: boolean }) {
  return <>{splitPromptMentions(text).map((part, index) => part.kind === 'text' ? part.raw : (
    <span key={index} className={`prompt-mention prompt-mention--${part.kind}${compact ? ' prompt-mention--compact' : ''}`} data-prompt-mention={part.kind} title={part.raw}>
      {part.label}
    </span>
  ))}</>
})
