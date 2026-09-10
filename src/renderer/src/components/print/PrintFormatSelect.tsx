import { getPrintFormatOptions, type PrintFormat } from '../../../../shared/print-prompt'

/** Both composer surfaces select the same persisted Print format. */
export function PrintFormatSelect({ format, onChange, label = 'Printformat' }: {
  format: PrintFormat
  onChange: (format: PrintFormat) => void
  label?: string
}) {
  return <select aria-label={label} className="h-8 max-w-full rounded-lg border border-border-base bg-surface-3 px-2 text-[13px] text-text-primary focus:outline-accent-main" value={format} onChange={event => onChange(event.target.value as PrintFormat)}>
    {getPrintFormatOptions(format).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
  </select>
}
