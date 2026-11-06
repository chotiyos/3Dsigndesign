import { useEffect, useId, useRef, useState } from 'react'

/** A labelled number field with an optional slider. Typed values commit on blur or Enter. */
export function Range({ label, unit, value, min, max, step, hint, slider = true, onChange }: { label: string; unit: string; value: number; min: number; max: number; step: number; hint?: string; slider?: boolean; onChange: (v: number) => void }) {
  const id = useId()
  const [text, setText] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])
  const commit = (raw: string) => {
    const n = Number(raw)
    if (raw.trim() !== '' && Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n))
      // The parent may further constrain the request (e.g. the font size
      // needed for an exact width). Show the current model value until its
      // next value arrives, including when that constraint leaves it unchanged.
      setText(String(value))
      if (clamped !== value) onChange(clamped)
    }
    else setText(String(value))
  }
  return (
    <div className="range">
      <div className="range-head">
        <label className="field-label" htmlFor={id}>{label}</label>
        <span className="range-value">
          <input
            id={slider ? undefined : id}
            type="number"
            inputMode="decimal"
            value={text}
            min={min}
            max={max}
            step={step}
            aria-label={`${label} (${unit})`}
            onFocus={() => (focused.current = true)}
            onBlur={(e) => { focused.current = false; commit(e.target.value) }}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          />
          {unit && <span>{unit}</span>}
        </span>
      </div>
      {slider && <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />}
      {hint && <small className="range-hint">{hint}</small>}
    </div>
  )
}
