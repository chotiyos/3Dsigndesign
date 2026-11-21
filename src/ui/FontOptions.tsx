import { FONT_GROUPS, FONT_OPTIONS } from '../lib/fonts'

/** The font menu's options, grouped by what the fonts can write. */
export function FontOptions({ prefix = '' }: { prefix?: string }) {
  return (
    <>
      {FONT_GROUPS.map((g) => (
        <optgroup key={g.id} label={g.label}>
          {FONT_OPTIONS.filter((f) => f.group === g.id).map((f) => (
            <option key={f.id} value={f.id}>{prefix}{f.label} · {f.note}</option>
          ))}
        </optgroup>
      ))}
    </>
  )
}
