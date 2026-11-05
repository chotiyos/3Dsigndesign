import { useEffect, useState } from 'react'
import { FONT_OPTIONS } from './fonts'
import { loadFont, type LoadedFont } from './hb'

/** Loads a bundled font by id. Returns null while loading. */
export function useFont(fontId: string) {
  const [font, setFont] = useState<LoadedFont | null>(null)
  const [error, setError] = useState<string | null>(null)
  const option = FONT_OPTIONS.find((f) => f.id === fontId) ?? FONT_OPTIONS[0]
  useEffect(() => {
    let cancelled = false
    setError(null)
    loadFont(option.url)
      .then((loaded) => !cancelled && setFont(loaded))
      .catch(() => !cancelled && setError('โหลดฟอนต์ไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง'))
    return () => {
      cancelled = true
    }
  }, [option.url])
  return { font, error }
}
