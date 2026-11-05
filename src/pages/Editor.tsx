import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Box3 } from 'three'
import { credits, EXPORT_COST, spend, useDemo } from '../lib/account'
import { imageToRegion, readImage, svgToRegion, textToRegion } from '../lib/artwork'
import { buildDxf } from '../lib/exportDxf'
import { buildZip, downloadBlob, MATERIAL_INFO, partStats, partsToStl, safeName } from '../lib/exportModel'
import { CUSTOM_FONT_ID, FONT_OPTIONS } from '../lib/fonts'
import { bounds, type Region } from '../lib/geo2d'
import { fontFromArrayBuffer, loadFont, type LoadedFont } from '../lib/hb'
import { buildStyle, cleanValues, findStyle, GROUPS, STYLES, type SignPart, type StyleGroup } from '../lib/styles'
import { Link, useLocation, useTitle } from '../router'
import { MATERIAL_COLORS, MATERIAL_NAMES } from '../three/materials'
import { Viewer } from '../three/Viewer'
import { Icon } from '../ui/Icon'
import { Brand } from '../ui/Brand'
import { StyleThumb } from '../ui/StyleThumb'

type Source = 'text' | 'svg' | 'image'
type Step = 1 | 2 | 3 | 4

interface Draft {
  source: Source
  text: string
  fontId: string
  heightMM: number
  spacingMM: number
  lineGap: number
  align: 'left' | 'center' | 'right'
  styleId: string
  values: Record<string, Record<string, number>>
  colors: Record<string, string>
  svgText?: string
  threshold: number
  invert: boolean
}

const DRAFT_KEY = 'jjdesign-draft-v1'

function cleanDraft(input: Partial<Draft> | undefined): Partial<Draft> {
  if (!input || typeof input !== 'object') return {}
  const out: Partial<Draft> = {}
  for (const key of ['text', 'fontId', 'styleId', 'svgText'] as const) {
    if (typeof input[key] === 'string') out[key] = input[key]
  }
  if (out.text) out.text = out.text.slice(0, 200)
  for (const [key, min, max, fallback] of [
    ['heightMM', 10, 1500, 200], ['spacingMM', -30, 150, 0],
    ['lineGap', 0.8, 2.5, 1.15], ['threshold', 20, 235, 128],
  ] as const) {
    const value = input[key]
    out[key] = typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  }
  out.source = input.source === 'svg' ? 'svg' : 'text'
  out.align = input.align === 'left' || input.align === 'right' ? input.align : 'center'
  out.invert = input.invert === true
  out.values = input.values && typeof input.values === 'object' ? input.values : {}
  out.colors = input.colors && typeof input.colors === 'object' ? input.colors : {}
  return out
}

function initialDraft(query: URLSearchParams): Draft {
  let saved: Partial<Draft> = {}
  try {
    saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<Draft>
  } catch {
    saved = {}
  }
  const base: Draft = {
    source: 'text',
    text: 'ร้านของฉัน',
    fontId: FONT_OPTIONS[0].id,
    heightMM: 200,
    spacingMM: 0,
    lineGap: 1.15,
    align: 'center',
    styleId: STYLES[0].id,
    values: {},
    colors: {},
    threshold: 128,
    invert: false,
    ...cleanDraft(saved),
  }
  if (base.fontId === CUSTOM_FONT_ID) base.fontId = FONT_OPTIONS[0].id
  if (base.source === 'image') base.source = 'text'
  const text = query.get('text')
  const style = query.get('style')
  if (text !== null) {
    base.text = text.slice(0, 200)
    base.source = 'text'
  }
  if (style && STYLES.some((s) => s.id === style)) base.styleId = style
  return base
}

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'ข้อความหรือรูป' },
  { n: 2, label: 'เลือกแบบป้าย' },
  { n: 3, label: 'ปรับขนาดชิ้นส่วน' },
  { n: 4, label: 'ส่งออกไฟล์' },
]

export default function Editor() {
  useTitle('ตัวออกแบบป้าย')
  const { query } = useLocation()
  const demo = useDemo()
  const [draft, setDraft] = useState<Draft>(() => initialDraft(query))
  const [step, setStep] = useState<Step>(query.get('style') ? 3 : 1)
  const [customFont, setCustomFont] = useState<{ name: string; font: LoadedFont } | null>(null)
  const [loadedFont, setLoadedFont] = useState<{ id: string; font: LoadedFont } | null>(null)
  const [image, setImage] = useState<ImageData | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [explode, setExplode] = useState(0)
  const [night, setNight] = useState(false)
  const [edges, setEdges] = useState(false)
  const [grid, setGrid] = useState(true)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [backdrop, setBackdrop] = useState<string | null>(null)
  const [filter, setFilter] = useState<StyleGroup | 'all'>('all')
  const [search, setSearch] = useState('')
  const [pricePerKg, setPricePerKg] = useState(450)
  const [panelOpen, setPanelOpen] = useState(true)

  const style = findStyle(draft.styleId)
  const values = cleanValues(style, draft.values[style.id])
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const { svgText, ...rest } = draft
        localStorage.setItem(DRAFT_KEY, JSON.stringify(svgText && svgText.length < 400_000 ? draft : rest))
      } catch {
        // Saving the draft is a convenience only.
      }
    }, 400)
    return () => clearTimeout(id)
  }, [draft])

  useEffect(() => {
    if (draft.fontId === CUSTOM_FONT_ID) {
      setLoadedFont(customFont ? { id: CUSTOM_FONT_ID, font: customFont.font } : null)
      return
    }
    let cancelled = false
    const option = FONT_OPTIONS.find((f) => f.id === draft.fontId) ?? FONT_OPTIONS[0]
    loadFont(option.url)
      .then((f) => !cancelled && setLoadedFont({ id: draft.fontId, font: f }))
      .catch(() => !cancelled && setMessage({ tone: 'error', text: 'โหลดฟอนต์ไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง' }))
    return () => {
      cancelled = true
    }
  }, [draft.fontId, customFont])

  const deferred = useDeferredValue(draft)
  const font = loadedFont?.id === deferred.fontId ? loadedFont.font : null

  const { art, artError } = useMemo((): { art: Region; artError: string | null } => {
    try {
      if (deferred.source === 'text') {
        if (!font) return { art: [], artError: null }
        if (!deferred.text.trim()) return { art: [], artError: 'พิมพ์ข้อความอย่างน้อยหนึ่งตัวอักษร' }
        return { art: textToRegion(font, deferred.text, deferred.heightMM, deferred.spacingMM, deferred.lineGap, deferred.align), artError: null }
      }
      if (deferred.source === 'svg') {
        if (!deferred.svgText) return { art: [], artError: 'เลือกไฟล์ SVG เพื่อเริ่ม' }
        return { art: svgToRegion(deferred.svgText, deferred.heightMM), artError: null }
      }
      if (!image) return { art: [], artError: 'เลือกรูปภาพเพื่อเริ่ม' }
      const traced = imageToRegion(image, deferred.heightMM, deferred.threshold, deferred.invert)
      return { art: traced, artError: traced.length ? null : 'ไม่พบส่วนสีเข้มในรูป ลองปรับค่าความเข้ม' }
    } catch (err) {
      return { art: [], artError: `อ่านข้อมูลไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` }
    }
  }, [deferred.source, deferred.text, deferred.heightMM, deferred.spacingMM, deferred.lineGap, deferred.align, deferred.svgText, deferred.threshold, deferred.invert, font, image])

  const deferredStyle = findStyle(deferred.styleId)
  const deferredValues = cleanValues(deferredStyle, deferred.values[deferredStyle.id])
  const valuesKey = JSON.stringify(deferredValues)
  const { parts, buildError } = useMemo((): { parts: SignPart[]; buildError: string | null } => {
    if (deferredStyle.usesArt && art.length === 0) return { parts: [], buildError: null }
    try {
      return { parts: buildStyle(deferredStyle, art, JSON.parse(valuesKey)), buildError: null }
    } catch (err) {
      return { parts: [], buildError: `สร้างชิ้นส่วนไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` }
    }
  }, [deferredStyle, art, valuesKey])

  const stats = useMemo(() => (step === 4 ? partStats(parts) : []), [parts, step])
  // Overall size comes from the finished parts, not the artwork: frames, bases,
  // and hardware styles are larger than (or unrelated to) the typed text.
  const size = useMemo(() => {
    const box = new Box3()
    for (const part of parts) {
      part.geometry.computeBoundingBox()
      if (part.geometry.boundingBox) box.union(part.geometry.boundingBox)
    }
    if (box.isEmpty()) {
      const b = bounds(art)
      return { w: b.w, h: b.h, d: 0 }
    }
    return { w: box.max.x - box.min.x, h: box.max.y - box.min.y, d: box.max.z - box.min.z }
  }, [art, parts])

  const busy = deferred !== draft
  const balance = credits(demo)
  const baseName = safeName(draft.source === 'text' ? draft.text.split('\n')[0] : 'jjdesign')

  function charge(cost: number, what: string) {
    if (!spend(cost, what)) {
      setMessage({ tone: 'error', text: `เครดิตทดลองไม่พอ ต้องใช้ ${cost} เครดิต เหลือ ${balance} เครดิต` })
      return false
    }
    setMessage({ tone: 'ok', text: `ดาวน์โหลดแล้ว หัก ${cost} เครดิตทดลอง` })
    return true
  }

  function exportFile(cost: number, extension: string, mime: string, build: () => Uint8Array | string) {
    if (busy || buildError || (style.usesArt && (artError || (draft.source === 'text' && !font)))) return
    try {
      const data = build()
      if (!charge(cost, `${extension.toUpperCase()} ${style.code} ${baseName}`)) return
      downloadBlob(data, `${baseName}-${style.code}.${extension}`, mime)
    } catch (err) {
      setMessage({ tone: 'error', text: `ส่งออกไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  function exportStl() {
    const visible = parts.filter((p) => !hidden.has(p.code))
    if (visible.length === 0) return
    exportFile(EXPORT_COST.stl, 'stl', 'model/stl', () => partsToStl(visible))
  }

  function exportDxf() {
    const cuts = parts.filter((p) => p.cut && !hidden.has(p.code))
    if (cuts.length === 0) return setMessage({ tone: 'error', text: 'แบบนี้ไม่มีชิ้นส่วนแบนที่ตัดด้วยเลเซอร์หรือ CNC ได้' })
    exportFile(EXPORT_COST.dxf, 'dxf', 'application/dxf', () => buildDxf(cuts.map((p) => ({ layer: p.code, region: p.cut! }))))
  }

  function exportZip() {
    const visible = parts.filter((p) => !hidden.has(p.code))
    if (visible.length === 0) return
    exportFile(EXPORT_COST.zip, 'zip', 'application/zip', () => {
      const list = partStats(visible)
        .map((s) => `${s.part.code}  ${s.part.label}  ${MATERIAL_INFO[s.part.material].name}  ${s.size.x.toFixed(1)}×${s.size.y.toFixed(1)}×${s.size.z.toFixed(1)} มม.  ~${s.grams.toFixed(0)} กรัม`)
        .join('\n')
      const readme = `JJDesign — ${style.code} ${style.name}\nข้อความ: ${draft.text}\nขนาด ${size.w.toFixed(1)} × ${size.h.toFixed(1)} × ${size.d.toFixed(1)} มม.\n\n${list}\n\nไฟล์ทุกไฟล์หน่วยมิลลิเมตร แกน Z ชี้ออกด้านหน้าป้าย\n`
      return buildZip({ baseName, parts: visible, readme })
    })
  }

  function saveProject() {
    const data = JSON.stringify({ app: 'jjdesign', version: 1, draft: { ...draft, fontId: draft.fontId === CUSTOM_FONT_ID ? FONT_OPTIONS[0].id : draft.fontId } })
    downloadBlob(data, `${baseName}.jjd`, 'application/json')
    setMessage({ tone: 'ok', text: 'บันทึกไฟล์งาน .jjd แล้ว เปิดกลับมาแก้ได้จากขั้นที่ 1' })
  }

  async function openProject(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as { app?: string; version?: number; draft?: Partial<Draft> }
      if (!parsed || parsed.app !== 'jjdesign' || parsed.version !== 1 || !parsed.draft || typeof parsed.draft !== 'object' || Array.isArray(parsed.draft)) throw new Error('ไม่ใช่ไฟล์งานของ JJDesign รุ่นที่รองรับ')
      setDraft((d) => ({ ...d, ...cleanDraft(parsed.draft) }))
      setMessage({ tone: 'ok', text: `เปิดไฟล์ ${file.name} แล้ว` })
    } catch (err) {
      setMessage({ tone: 'error', text: `เปิดไฟล์ไม่ได้: ${err instanceof Error ? err.message : 'ไฟล์เสีย'}` })
    }
  }

  async function onSvg(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 3_000_000) return setMessage({ tone: 'error', text: 'ไฟล์ SVG ใหญ่เกิน 3 MB' })
    try {
      const svgText = await file.text()
      if (!svgToRegion(svgText, draft.heightMM).length) throw new Error('empty SVG')
      update({ svgText, source: 'svg' })
      setMessage({ tone: 'ok', text: `โหลด ${file.name} แล้ว` })
    } catch {
      setMessage({ tone: 'error', text: 'อ่านไฟล์ SVG ไม่ได้ ใช้ไฟล์ที่มีเส้นปิดและเติมสีแล้ว' })
    }
  }

  async function onImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setImage(await readImage(file))
      update({ source: 'image' })
      setMessage({ tone: 'ok', text: `แปลงรูป ${file.name} เป็นเส้นแล้ว ปรับค่าความเข้มได้ด้านล่าง` })
    } catch {
      setMessage({ tone: 'error', text: 'อ่านรูปนี้ไม่ได้ ใช้ไฟล์ PNG หรือ JPG' })
    }
  }

  async function onFont(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const loaded = fontFromArrayBuffer(await file.arrayBuffer())
      const glyphs = loaded.hbFace.referenceTable('maxp')
      if (!loaded.upem || !glyphs || glyphs.length < 6 || new DataView(glyphs.buffer, glyphs.byteOffset, glyphs.byteLength).getUint16(4) === 0 || !loaded.hbFace.collectUnicodes().length) throw new Error('bad font')
      setCustomFont({ name: file.name, font: loaded })
      update({ fontId: CUSTOM_FONT_ID })
      setMessage({ tone: 'ok', text: `ใช้ฟอนต์ ${file.name} แล้ว ฟอนต์นี้อยู่ในเบราว์เซอร์ของคุณเท่านั้น` })
    } catch {
      setMessage({ tone: 'error', text: 'อ่านไฟล์ฟอนต์ไม่ได้ ใช้ไฟล์ .ttf หรือ .otf' })
    }
  }

  function onBackdrop(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBackdrop(URL.createObjectURL(file))
  }

  useEffect(() => () => { if (backdrop) URL.revokeObjectURL(backdrop) }, [backdrop])

  useEffect(() => () => { parts.forEach((part) => part.geometry.dispose()) }, [parts])

  const setValue = (key: string, value: number) =>
    setDraft((d) => ({ ...d, values: { ...d.values, [style.id]: { ...cleanValues(style, d.values[style.id]), [key]: value } } }))

  const shownStyles = STYLES.filter(
    (s) => (filter === 'all' || s.group === filter) && (!search.trim() || `${s.code} ${s.name} ${s.blurb}`.toLowerCase().includes(search.trim().toLowerCase())),
  )

  const error = (style.usesArt ? artError : null) ?? buildError
  const totalGrams = stats.reduce((sum, s) => sum + (hidden.has(s.part.code) ? 0 : s.grams), 0)
  const exportBlocked = busy || Boolean(error) || (style.usesArt && draft.source === 'text' && !font)
  const hasVisibleParts = parts.some((p) => !hidden.has(p.code))

  return (
    <div className="ed" data-night={night || undefined}>
      <header className="ed-top">
        <Link href="/" className="ed-brand" aria-label="JJDesign หน้าแรก">
          <Brand compact />
        </Link>
        <nav className="ed-steps" aria-label="ขั้นตอน">
          {STEPS.map((s) => (
            <button key={s.n} type="button" aria-label={`ขั้นที่ ${s.n}: ${s.label}`} aria-current={step === s.n ? 'step' : undefined} onClick={() => { setStep(s.n); setPanelOpen(true) }}>
              <span className="ed-step-n">{s.n}</span>
              <span className="ed-step-label">{s.label}</span>
            </button>
          ))}
        </nav>
        <div className="ed-top-end">
          <Link href="/pricing" className="credit-chip" title="เครดิตทดลอง ไม่ใช่เงินจริง">
            <span className="tabular">{balance}</span> เครดิตทดลอง
          </Link>
          <Link href={demo.account ? '/account' : '/login'} className="icon-link" aria-label={demo.account ? 'บัญชีของฉัน' : 'เข้าสู่ระบบ'}>
            <Icon name="user" />
          </Link>
        </div>
      </header>

      <main className="ed-stage">
        <Viewer
          parts={parts}
          explodeMM={explode}
          hidden={hidden}
          colors={draft.colors}
          night={night}
          grid={grid}
          edges={edges}
          backdrop={backdrop}
          frameKey={`${deferredStyle.id}|${draft.source}|${Math.round(Math.log2(Math.max(size.w, size.h, 1)) * 2)}`}
          className="ed-viewer"
        />
        <div className="ed-readout" aria-live="polite">
          <span className="ed-readout-code">{style.code}</span>
          <span>{style.name}</span>
          {parts.length > 0 && (
            <span className="tabular">
              {size.w.toFixed(1)} × {size.h.toFixed(1)} × {size.d.toFixed(1)} มม. · {parts.length} ชิ้น
            </span>
          )}
          {busy && <span className="ed-busy">กำลังคำนวณ…</span>}
        </div>
        {error && <p className="ed-error" role="alert">{error}</p>}
        {!error && parts.length === 0 && !busy && draft.source === 'text' && !font && <p className="ed-hint">กำลังโหลดฟอนต์…</p>}

        <div className="ed-tools" role="group" aria-label="มุมมอง">
          <button type="button" className="tool" aria-label="ดูตอนเปิดไฟกลางคืน" aria-pressed={night} onClick={() => setNight(!night)} title="ดูตอนเปิดไฟกลางคืน">
            <Icon name={night ? 'moon' : 'sun'} />
            <span>{night ? 'กลางคืน' : 'กลางวัน'}</span>
          </button>
          <button type="button" className="tool" aria-label="แสดงเส้นขอบ" aria-pressed={edges} onClick={() => setEdges(!edges)} title="แสดงเส้นขอบ">
            <Icon name="edges" />
            <span>เส้นขอบ</span>
          </button>
          <button type="button" className="tool" aria-label="แสดงตาราง" aria-pressed={grid} onClick={() => setGrid(!grid)} title="แสดงตาราง">
            <Icon name="grid" />
            <span>ตาราง</span>
          </button>
          <label className="tool" title="วางป้ายบนรูปหน้าร้านจริง">
            <Icon name="camera" />
            <span>รูปหน้างาน</span>
            <input type="file" accept="image/*" onChange={onBackdrop} className="sr-only" aria-label="เลือกรูปหน้างาน" />
          </label>
          {backdrop && (
            <button type="button" className="tool" aria-label="เอารูปหน้างานออก" onClick={() => { URL.revokeObjectURL(backdrop); setBackdrop(null) }}>
              <Icon name="close" />
              <span>เอารูปออก</span>
            </button>
          )}
          <label className="tool tool-range">
            <Icon name="explode" />
            <span>แยกชิ้น</span>
            <input type="range" min={0} max={150} value={explode} onChange={(e) => setExplode(Number(e.target.value))} aria-label="ระยะแยกชิ้น" />
            <span className="tabular">{explode}</span>
          </label>
        </div>

        <ol className="ed-layers" aria-label="ชิ้นส่วน">
          {parts.map((part) => {
            const off = hidden.has(part.code)
            return (
              <li key={part.id} data-off={off || undefined}>
                <button
                  type="button"
                  className="layer-eye"
                  aria-pressed={!off}
                  aria-label={`${off ? 'แสดง' : 'ซ่อน'} ${part.label}`}
                  onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(part.code)) n.delete(part.code); else n.add(part.code); return n })}
                >
                  <Icon name={off ? 'eyeOff' : 'eye'} size={16} />
                </button>
                <span className="layer-code">{part.code}</span>
                <span className="layer-name">{part.label}</span>
                <input
                  type="color"
                  aria-label={`สีของ ${part.label}`}
                  value={draft.colors[part.code] ?? MATERIAL_COLORS[part.material]}
                  onChange={(e) => { const color = e.target.value; setDraft((d) => ({ ...d, colors: { ...d.colors, [part.code]: color } })) }}
                />
              </li>
            )
          })}
        </ol>
      </main>

      <aside className="ed-panel" data-open={panelOpen || undefined}>
        <button type="button" className="ed-panel-toggle" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen} aria-controls="editor-panel-body">
          {panelOpen ? 'ย่อแผง' : `ขั้นที่ ${step}: ${STEPS[step - 1].label}`}
        </button>
        <div className="ed-panel-body" id="editor-panel-body">
          <h1 className="ed-panel-title">
            <span className="tabular">{step}</span> {STEPS[step - 1].label}
          </h1>

          {message && (
            <p className={`ed-msg ed-msg-${message.tone}`} role="status">
              {message.text}
              <button type="button" onClick={() => setMessage(null)} aria-label="ปิดข้อความ"><Icon name="close" size={14} /></button>
            </p>
          )}

          {step === 1 && (
            <div className="ed-sec">
              <div className="seg" role="group" aria-label="แหล่งข้อมูล">
                {(['text', 'svg', 'image'] as Source[]).map((s) => (
                  <button key={s} type="button" aria-pressed={draft.source === s} onClick={() => update({ source: s })}>
                    {s === 'text' ? 'พิมพ์ข้อความ' : s === 'svg' ? 'ไฟล์ SVG' : 'รูปภาพ'}
                  </button>
                ))}
              </div>

              {draft.source === 'text' && (
                <>
                  <label className="field">
                    <span className="field-label">ข้อความ <small>ขึ้นบรรทัดใหม่ได้</small></span>
                    <textarea value={draft.text} rows={3} maxLength={200} onChange={(e) => update({ text: e.target.value })} placeholder="เช่น ก๋วยเตี๋ยวเรือ / COFFEE" />
                  </label>
                  <label className="field">
                    <span className="field-label">แบบอักษร</span>
                    <select value={draft.fontId} onChange={(e) => update({ fontId: e.target.value })}>
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.id} value={f.id}>{f.label} — {f.note}</option>
                      ))}
                      {customFont && <option value={CUSTOM_FONT_ID}>ฟอนต์ของคุณ: {customFont.name}</option>}
                    </select>
                  </label>
                  <label className="file-btn">
                    <Icon name="upload" size={16} /> ใช้ฟอนต์ของตัวเอง (.ttf / .otf)
                    <input type="file" accept=".ttf,.otf,font/ttf,font/otf" onChange={onFont} className="sr-only" />
                  </label>
                  <Range label="ระยะห่างตัวอักษร" unit="มม." value={draft.spacingMM} min={-30} max={150} step={1} onChange={(v) => update({ spacingMM: v })} />
                  <Range label="ระยะห่างบรรทัด" unit="เท่า" value={draft.lineGap} min={0.8} max={2.5} step={0.05} onChange={(v) => update({ lineGap: v })} />
                  <div className="seg seg-small" role="group" aria-label="จัดแนวบรรทัด">
                    {(['left', 'center', 'right'] as const).map((a) => (
                      <button key={a} type="button" aria-pressed={draft.align === a} onClick={() => update({ align: a })}>
                        {a === 'left' ? 'ชิดซ้าย' : a === 'center' ? 'กึ่งกลาง' : 'ชิดขวา'}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {draft.source === 'svg' && (
                <>
                  <label className="drop">
                    <Icon name="upload" size={22} />
                    <strong>{draft.svgText ? 'เปลี่ยนไฟล์ SVG' : 'เลือกไฟล์ SVG'}</strong>
                    <span>ใช้เส้นปิดที่เติมสีแล้ว ส่งออกจาก Illustrator, CorelDRAW หรือ Inkscape</span>
                    <input type="file" accept=".svg,image/svg+xml" onChange={onSvg} className="sr-only" />
                  </label>
                </>
              )}

              {draft.source === 'image' && (
                <>
                  <label className="drop">
                    <Icon name="image" size={22} />
                    <strong>{image ? 'เปลี่ยนรูปภาพ' : 'เลือกรูปโลโก้ขาวดำ'}</strong>
                    <span>รูปพื้นขาว โลโก้สีเข้ม ได้ผลดีที่สุด ระบบแปลงส่วนสีเข้มเป็นเส้นรอบรูป</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onImage} className="sr-only" />
                  </label>
                  <Range label="ค่าความเข้มที่นับเป็นเส้น" unit="" value={draft.threshold} min={20} max={235} step={1} onChange={(v) => update({ threshold: v })} />
                  <label className="check">
                    <input type="checkbox" checked={draft.invert} onChange={(e) => update({ invert: e.target.checked })} />
                    กลับสี (โลโก้สีอ่อนบนพื้นเข้ม)
                  </label>
                </>
              )}

              <Range label={draft.source === 'text' ? 'ความสูงตัวอักษร' : 'ความสูงชิ้นงาน'} unit="มม." value={draft.heightMM} min={10} max={1500} step={1} onChange={(v) => update({ heightMM: v })} />

              <label className="file-btn">
                <Icon name="file" size={16} /> เปิดไฟล์งาน .jjd
                <input type="file" accept=".jjd,application/json" onChange={openProject} className="sr-only" />
              </label>

              <button type="button" className="btn btn-primary btn-block" onClick={() => setStep(2)}>
                ถัดไป เลือกแบบป้าย <Icon name="arrow" size={16} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="ed-sec">
              <label className="search">
                <Icon name="search" size={16} />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาแบบ เช่น ไฟสองชั้น, พวงกุญแจ" aria-label="ค้นหาแบบป้าย" />
              </label>
              <div className="chips" role="group" aria-label="หมวด">
                <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด {STYLES.length}</button>
                {GROUPS.map((g) => (
                  <button key={g.id} type="button" aria-pressed={filter === g.id} onClick={() => setFilter(g.id)}>
                    {g.letter} {g.name}
                  </button>
                ))}
              </div>
              <ul className="pick-grid">
                {shownStyles.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="pick" aria-pressed={s.id === style.id} onClick={() => update({ styleId: s.id })}>
                      <StyleThumb style={s} />
                      <span className="pick-code">{s.code}</span>
                      <span className="pick-name">{s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {shownStyles.length === 0 && <p className="note">ไม่พบแบบที่ค้นหา ลองคำอื่น</p>}
              <p className="note">{style.blurb}</p>
              <button type="button" className="btn btn-primary btn-block" onClick={() => setStep(3)}>
                ถัดไป ปรับขนาด <Icon name="arrow" size={16} />
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="ed-sec">
              <p className="note">
                <strong>{style.code} {style.name}</strong> {style.blurb}
              </p>
              {style.params.map((param) => (
                <Range
                  key={param.key}
                  label={param.label}
                  unit={param.unit}
                  hint={param.hint}
                  value={values[param.key]}
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  onChange={(v) => setValue(param.key, v)}
                />
              ))}
              <div className="row">
                <button type="button" className="btn btn-ghost" onClick={() => setDraft((d) => { const next = { ...d.values }; delete next[style.id]; return { ...d, values: next } })}>
                  <Icon name="reset" size={16} /> ค่าเริ่มต้น
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => update({ colors: {} })}>
                  สีเดิม
                </button>
              </div>
              <button type="button" className="btn btn-primary btn-block" onClick={() => setStep(4)}>
                ถัดไป ส่งออกไฟล์ <Icon name="arrow" size={16} />
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="ed-sec">
              <table className="spec">
                <caption>รายการชิ้นส่วน · น้ำหนักโดยประมาณจากปริมาตรชิ้นงานตัน</caption>
                <thead>
                  <tr><th>ชิ้น</th><th>วัสดุ</th><th className="num">กรัม</th></tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.part.id} data-off={hidden.has(s.part.code) || undefined}>
                      <td><span className="layer-code">{s.part.code}</span> {s.part.label}{!s.watertight && <span className="warn" title="ผิวชิ้นงานมีรอยต่อ ให้ตรวจหรือซ่อมใน slicer ก่อนพิมพ์">ตรวจใน slicer</span>}</td>
                      <td>{MATERIAL_NAMES[s.part.material]}</td>
                      <td className="num tabular">{s.part.material === 'led' ? '—' : s.grams.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <label className="field field-inline">
                <span className="field-label">ราคาวัสดุพิมพ์ (บาท/กก.)</span>
                <input type="number" min={0} max={100000} value={pricePerKg} onChange={(e) => setPricePerKg(Math.min(100000, Math.max(0, Number(e.target.value) || 0)))} />
              </label>
              <p className="estimate">
                ค่าวัสดุโดยประมาณ <strong className="tabular">{Math.round((totalGrams / 1000) * pricePerKg).toLocaleString('th-TH')}</strong> บาท
                <small> จากน้ำหนักชิ้นส่วนที่แสดง {totalGrams.toFixed(0)} กรัม ยังไม่รวมไฟ ค่าแรง และค่าเครื่อง</small>
              </p>
              <div className="export-list">
                <button type="button" className="btn btn-primary btn-block" disabled={exportBlocked || !hasVisibleParts} onClick={exportZip}>
                  <Icon name="download" size={16} /> ดาวน์โหลดครบชุด ZIP <span className="cost">{EXPORT_COST.zip} เครดิต</span>
                </button>
                <button type="button" className="btn btn-ghost btn-block" disabled={exportBlocked || !hasVisibleParts} onClick={exportStl}>
                  STL รวมทุกชิ้น สำหรับพิมพ์ 3D <span className="cost">{EXPORT_COST.stl} เครดิต</span>
                </button>
                <button type="button" className="btn btn-ghost btn-block" disabled={exportBlocked || !parts.some((p) => p.cut && !hidden.has(p.code))} onClick={exportDxf}>
                  DXF เส้นตัดเลเซอร์ / CNC <span className="cost">{EXPORT_COST.dxf} เครดิต</span>
                </button>
                <button type="button" className="btn btn-ghost btn-block" onClick={saveProject}>
                  <Icon name="save" size={16} /> บันทึกไฟล์งาน .jjd <span className="cost">ฟรี</span>
                </button>
              </div>
              <p className="note">
                ระบบเครดิตบนเว็บนี้เป็นการสาธิต ไม่มีการเก็บเงินจริง ชิ้นส่วนที่ซ่อนอยู่จะไม่ถูกส่งออก ตรวจขนาดในโปรแกรม slicer ก่อนสั่งผลิตทุกครั้ง{' '}
                <Link href="/pricing">เติมเครดิตทดลอง</Link>
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function Range({ label, unit, value, min, max, step, hint, onChange }: { label: string; unit: string; value: number; min: number; max: number; step: number; hint?: string; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])
  const commit = (raw: string) => {
    const n = Number(raw)
    if (raw.trim() !== '' && Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n))
      setText(String(clamped))
      onChange(clamped)
    }
    else setText(String(value))
  }
  return (
    <div className="range">
      <div className="range-head">
        <label className="field-label" htmlFor={`r-${label}`}>{label}</label>
        <span className="range-value">
          <input
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
            onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
          />
          {unit && <span>{unit}</span>}
        </span>
      </div>
      <input id={`r-${label}`} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small className="range-hint">{hint}</small>}
    </div>
  )
}
