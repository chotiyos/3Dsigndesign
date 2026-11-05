/** JJDesign mark: two J strokes offset like a letter face over its back plate. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="brand-mark">
      <path d="M13 6h7v13.5a6.5 6.5 0 0 1-13 0V18h5.2v1.5a1.3 1.3 0 0 0 2.6 0V11H13Z" fill="var(--mark-back)" transform="translate(4 3)" />
      <path d="M13 6h7v13.5a6.5 6.5 0 0 1-13 0V18h5.2v1.5a1.3 1.3 0 0 0 2.6 0V11H13Z" fill="var(--mark-face)" />
    </svg>
  )
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <BrandMark size={compact ? 24 : 30} />
      <span className="brand-word">
        JJ<span>Design</span>
      </span>
    </span>
  )
}
