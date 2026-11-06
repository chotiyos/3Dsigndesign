import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Box3 } from 'three'
import { containModalFocus } from '../ui/modalFocus'
import { READY_FILES } from '../data/shop'
import { credits, EXPORT_COST, spend, useDemo } from '../lib/account'
import { imageToRegion, readImage, svgToRegion, textToRegion } from '../lib/artwork'
import { bridgeArt, floatingCount, type BridgeMode } from '../lib/bridges'
import { artMeasures, baht, cleanRates, costSheet, type Rates } from '../lib/estimate'
import { jobSheetHtml } from '../lib/jobSheet'
import { printGuide } from '../lib/printTips'
import { decodeShare, encodeShare, SHARE_LIMIT } from '../lib/share'
import { buildDxf } from '../lib/exportDxf'
import { buildZip, downloadBlob, dxfLayer, MATERIAL_INFO, partMethod, partStats, partsToStl, PICKABLE_MATERIALS, safeName } from '../lib/exportModel'
import { CUSTOM_FONT_ID, FONT_OPTIONS } from '../lib/fonts'
import { bounds, type Region } from '../lib/geo2d'
import { planModules, powerFor, PSU_LOAD } from '../lib/ledPlan'
import { fontFromArrayBuffer, loadFont, type LoadedFont } from '../lib/hb'
import { applyMaterials, buildStyle, cleanValues, findStyle, GROUPS, lipHost, PLASTIC, STYLES, type MaterialId, type SignPart, type StyleGroup } from '../lib/styles'
import { Link, useLocation, useTitle } from '../router'
import { MATERIAL_COLORS, MATERIAL_NAMES } from '../three/materials'
import { Viewer } from '../three/Viewer'
import { Icon } from '../ui/Icon'
import { Brand } from '../ui/Brand'
import { StyleThumb } from '../ui/StyleThumb'
import { Range } from '../ui/Range'
import { Tour, type TourStep } from '../ui/Tour'

export { Range }

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
  /** Customer's material choice per style, per part letter. */
  materials: Record<string, Record<string, MaterialId>>
  svgText?: string
  threshold: number
  invert: boolean
  /** LED estimate settings: module spacing in mm and watts per module. */
  ledPitch: number
  ledWatt: number
  /** Bars that tie floating pieces on: 0 off, 1 marks only, 2 everything. Width in mm. */
  bridge: BridgeMode
  bridgeW: number
}

const DRAFT_KEY = 'jjdesign-draft-v1'
/** The shop's own prices and name, kept in this browser only. */
const RATES_KEY = 'jjdesign-rates-v1'
/** Set once the first-visit tour is finished or skipped. */
const TOUR_KEY = 'jjdesign-tour-v1'

const TOUR: TourStep[] = [
  { target: '.ed-steps', title: 'ทำป้ายใน 4 ขั้น', text: 'ใส่ข้อความหรือรูป เลือกแบบป้าย ปรับขนาด แล้วส่งออกไฟล์ กดที่ขั้นไหนก็ได้เพื่อย้อนกลับไปแก้' },
  { target: '.ed-panel', title: 'แผงตั้งค่า', text: 'ตั้งค่าของขั้นที่เลือกอยู่ตรงนี้ ทุกอย่างที่แก้จะเห็นผลในโมเดลทันที งานบันทึกไว้ในเครื่องให้อัตโนมัติ' },
  { target: '.ed-viewer', title: 'โมเดล 3 มิติ', text: 'ลากเพื่อหมุน เลื่อนล้อเมาส์หรือถ่างนิ้วเพื่อซูม คลิกขวาค้างแล้วลากเพื่อเลื่อนภาพ' },
  { target: '.ed-tools', title: 'มุมมองต่างๆ', text: 'ดูตอนเปิดไฟกลางคืน แยกชิ้นดูด้านใน หรือใส่รูปหน้าร้านจริงเพื่อดูป้ายในที่ติดตั้ง' },
  { target: '.ed-layers', title: 'ชิ้นส่วน', text: 'ซ่อนหรือเปลี่ยนสีแต่ละชิ้น ชิ้นที่ซ่อนอยู่จะไม่ถูกส่งออก' },
  { target: '.ed-steps button:last-child', title: 'ส่งออกและส่งต่อ', text: 'ขั้นที่ 4 มีไฟล์ ZIP, STL, DXF ประมาณต้นทุน ใบงานให้ลูกค้าเซ็น และลิงก์แชร์แบบ' },
]

/** Images are persisted as their traced outline; pixel data stays in memory. */
export function portableDraft(draft: Draft, art: Region): Draft {
  if (draft.source !== 'image' || art.length === 0) return draft
  const b = bounds(art)
  const d = art.map(poly => `M${poly.map(([x, y]) => `${x},${-y}`).join('L')}Z`).join('')
  return { ...draft, source: 'svg', heightMM: b.h, svgText: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.minX} ${-b.maxY} ${b.w} ${b.h}"><path d="${d}"/></svg>` }
}

export function cleanDraft(input: Partial<Draft> | undefined): Partial<Draft> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: Partial<Draft> = {}
  for (const key of ['text', 'fontId', 'styleId', 'svgText'] as const) {
    if (typeof input[key] === 'string') out[key] = input[key]
  }
  if (out.fontId === CUSTOM_FONT_ID) out.fontId = FONT_OPTIONS[0].id
  if (out.text) out.text = out.text.slice(0, 200)
  for (const [key, min, max, fallback] of [
    ['heightMM', 10, 1500, 200], ['spacingMM', -30, 150, 0],
    ['lineGap', 0.8, 2.5, 1.15], ['threshold', 20, 235, 128],
    ['ledPitch', 15, 300, 60], ['ledWatt', 0.1, 10, 0.72],
    ['bridge', 0, 2, 0], ['bridgeW', 0.6, 6, 2],
  ] as const) {
    const value = input[key]
    ;(out as Record<string, number>)[key] = typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  }
  out.bridge = Math.round(out.bridge ?? 0) as BridgeMode
  out.source = input.source === 'svg' ? 'svg' : 'text'
  out.align = input.align === 'left' || input.align === 'right' ? input.align : 'center'
  out.invert = input.invert === true
  out.values = input.values && typeof input.values === 'object' ? input.values : {}
  out.colors = Object.fromEntries(Object.entries(input.colors && typeof input.colors === 'object' ? input.colors : {}).filter(([, color]) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)))
  out.materials = {}
  if (input.materials && typeof input.materials === 'object' && !Array.isArray(input.materials)) {
    for (const [styleId, choices] of Object.entries(input.materials)) {
      if (!STYLES.some((s) => s.id === styleId) || !choices || typeof choices !== 'object' || Array.isArray(choices)) continue
      const kept = Object.fromEntries(Object.entries(choices).filter(([code, m]) => /^(?:[A-HJ-NP-Z]|Z\d+)$/.test(code) && PICKABLE_MATERIALS.includes(m)))
      if (Object.keys(kept).length) out.materials[styleId] = kept
    }
  }
  return out
}

function initialDraft(query: URLSearchParams, shared: Partial<Draft> | null = null): Draft {
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
    materials: {},
    threshold: 128,
    invert: false,
    ledPitch: 60,
    ledWatt: 0.72,
    bridge: 0,
    bridgeW: 2,
    ...cleanDraft(saved),
  }
  if (shared) {
    // A shared link wins, but this browser keeps its own work on other styles.
    const incoming = cleanDraft(shared)
    Object.assign(base, incoming, { values: { ...base.values, ...incoming.values }, materials: { ...base.materials, ...incoming.materials } })
  }
  if (base.fontId === CUSTOM_FONT_ID) base.fontId = FONT_OPTIONS[0].id
  if (base.source === 'image') base.source = 'text'
  const readyFile = READY_FILES.find((file) => file.id === query.get('file'))
  if (readyFile) {
    Object.assign(base, {
      source: 'text', text: readyFile.text, styleId: readyFile.styleId,
      fontId: FONT_OPTIONS[0].id, heightMM: 150, spacingMM: 0, lineGap: 1.15, align: 'center',
      // Reset only this style's settings; the customer's work on other styles stays.
      values: { ...base.values, [readyFile.styleId]: readyFile.values ?? {} },
      materials: Object.fromEntries(Object.entries(base.materials).filter(([id]) => id !== readyFile.styleId)),
      colors: {},
    })
  }
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
  // A design opened from a share link (#d=…), read once. Kept out of state so
  // the editor's other hooks keep their order.
  const sharedRef = useRef<Partial<Draft> | null | undefined>(undefined)
  if (sharedRef.current === undefined) sharedRef.current = typeof window === 'undefined' ? null : (decodeShare(window.location.hash) as Partial<Draft> | null)
  const shared = sharedRef.current
  const [draft, setDraft] = useState<Draft>(() => initialDraft(query, shared))
  const [step, setStep] = useState<Step>(query.get('style') || shared ? 3 : 1)
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
  const [rates, setRates] = useState<Rates>(() => {
    try {
      return cleanRates(JSON.parse(localStorage.getItem(RATES_KEY) ?? 'null'))
    } catch {
      return cleanRates(null)
    }
  })
  const [job, setJob] = useState({ customer: '', job: '', notes: '', prices: true })
  const capture = useRef<(() => string | null) | null>(null)
  const [sheet, setSheet] = useState<string | null>(null)
  const sheetRoot = useRef<HTMLDivElement>(null)
  const sheetFrame = useRef<HTMLIFrameElement>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [tour, setTour] = useState(() => {
    try {
      return !localStorage.getItem(TOUR_KEY)
    } catch {
      return false
    }
  })
  const endTour = () => {
    setTour(false)
    try {
      localStorage.setItem(TOUR_KEY, '1')
    } catch {
      // Without storage the tour simply shows again next visit.
    }
  }

  const style = findStyle(draft.styleId)
  const values = cleanValues(style, draft.values[style.id])
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

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

  useEffect(() => {
    if (deferred !== draft) return
    const id = setTimeout(() => {
      try {
        const saved = portableDraft(draft, art)
        if (saved.svgText && saved.svgText.length >= 400_000) return
        localStorage.setItem(DRAFT_KEY, JSON.stringify(saved))
      } catch {
        // Saving the draft is a convenience only.
      }
    }, 400)
    return () => clearTimeout(id)
  }, [draft, deferred, art])

  // Floating marks (Thai vowels, tone marks, dots) and the optional bars that tie them on.
  const floating = useMemo(() => floatingCount(art), [art])
  const joined = useMemo(() => {
    try {
      return bridgeArt(art, deferred.bridge, deferred.bridgeW)
    } catch {
      return { region: art, bars: 0 }
    }
  }, [art, deferred.bridge, deferred.bridgeW])

  useEffect(() => {
    try {
      localStorage.setItem(RATES_KEY, JSON.stringify(rates))
    } catch {
      // Remembering prices is a convenience only.
    }
  }, [rates])

  // Take the share code out of the address bar once read, so a refresh or a
  // later copy of the address does not bring back the original design.
  useEffect(() => {
    if (!window.location.hash.startsWith('#d=')) return
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    setMessage(shared
      ? { tone: 'ok', text: 'เปิดแบบจากลิงก์แชร์แล้ว แก้ต่อได้เลย แบบเดิมของผู้ส่งไม่เปลี่ยน' }
      : { tone: 'error', text: 'ลิงก์แชร์นี้ไม่สมบูรณ์ อาจถูกตัดตอนคัดลอก ขอลิงก์ใหม่จากผู้ส่ง' })
  }, [shared])

  const deferredStyle = findStyle(deferred.styleId)
  const deferredValues = cleanValues(deferredStyle, deferred.values[deferredStyle.id])
  const valuesKey = JSON.stringify(deferredValues)
  const { parts: builtParts, buildError } = useMemo((): { parts: SignPart[]; buildError: string | null } => {
    if (deferredStyle.usesArt && art.length === 0) return { parts: [], buildError: null }
    try {
      return { parts: buildStyle(deferredStyle, joined.region, JSON.parse(valuesKey)), buildError: null }
    } catch (err) {
      return { parts: [], buildError: `สร้างชิ้นส่วนไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` }
    }
  }, [deferredStyle, joined, valuesKey])

  // The customer's material picks: same geometry, new material, and the cut
  // outline (DXF) appears or disappears to suit how that material is made.
  const materialPicks = draft.materials[deferredStyle.id]
  const parts = useMemo(() => applyMaterials(builtParts, materialPicks), [builtParts, materialPicks])
  // The lip add-on is offered only while the wall it prints onto is plastic.
  const lipWall = lipHost(parts)
  const lipAllowed = Boolean(lipWall && PLASTIC.has(lipWall.material))
  // LED module estimate, for lit styles lit by modules inside a hollow back
  // (the neon channel takes flexible neon instead). Shown only; files unchanged.
  const ledCavity = deferredStyle.id === 'neon-channel' ? undefined : builtParts.find((part) => part.rear)?.rear?.cavity
  const ledPitch = useDeferredValue(draft.ledPitch)
  const modules = useMemo(() => (ledCavity && (step === 3 || step === 4) ? planModules(ledCavity, ledPitch) : null), [ledCavity, ledPitch, step])
  const power = modules ? powerFor(modules.length, draft.ledWatt) : null
  const setMaterial = (code: string, material: MaterialId) =>
    setDraft((d) => ({ ...d, materials: { ...d.materials, [style.id]: { ...d.materials[style.id], [code]: material } } }))

  const stats = useMemo(() => (step === 4 ? partStats(parts.filter((part) => !part.addon).flatMap((part) =>
    [part, ...parts.filter((addon) => addon.addon?.wall === part.code)],
  )) : []), [parts, step])
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
    exportFile(EXPORT_COST.dxf, 'dxf', 'application/dxf', () => buildDxf(cuts.map((p) => ({ layer: dxfLayer(p), region: p.cut! }))))
  }

  function exportZip() {
    const visible = parts.filter((p) => !hidden.has(p.code))
    if (visible.length === 0) return
    exportFile(EXPORT_COST.zip, 'zip', 'application/zip', () => {
      const listed = partStats(visible)
      const list = listed
        .map((s) => `${s.part.code}  ${s.part.label}  ${MATERIAL_INFO[s.part.material].name}  ${partMethod(s.part)}  ${s.size.x.toFixed(1)}×${s.size.y.toFixed(1)}×${s.size.z.toFixed(1)} มม.  ~${s.grams.toFixed(0)} กรัม`)
        .join('\n')
      const readme = `JJDesign — ${style.code} ${style.name}\nข้อความ: ${draft.text}\nขนาด ${size.w.toFixed(1)} × ${size.h.toFixed(1)} × ${size.d.toFixed(1)} มม.\n\n${list}\n\n${printGuide(listed)}\n\nไฟล์ทุกไฟล์หน่วยมิลลิเมตร แกน Z ชี้ออกด้านหน้าป้าย\n`
      return buildZip({ baseName, parts: visible, readme })
    })
  }

  function saveProject() {
    if (busy) return
    if (draft.source === 'image' && !art.length) {
      setMessage({ tone: 'error', text: 'เลือกรูปภาพและปรับให้พบเส้นก่อนบันทึกไฟล์งาน' })
      return
    }
    const data = JSON.stringify({ app: 'jjdesign', version: 1, draft: { ...portableDraft(draft, art), fontId: draft.fontId === CUSTOM_FONT_ID ? FONT_OPTIONS[0].id : draft.fontId } })
    downloadBlob(data, `${baseName}.jjd`, 'application/json')
    setMessage({ tone: 'ok', text: 'บันทึกไฟล์งาน .jjd แล้ว เปิดกลับมาแก้ได้จากขั้นที่ 1' })
  }

  async function shareDesign() {
    if (busy) return
    if (draft.source === 'image' && !art.length) {
      setMessage({ tone: 'error', text: 'เลือกรูปภาพและปรับให้พบเส้นก่อนแชร์แบบ' })
      return
    }
    const code = encodeShare({ ...portableDraft(draft, art), fontId: draft.fontId === CUSTOM_FONT_ID ? FONT_OPTIONS[0].id : draft.fontId })
    if (code.length > SHARE_LIMIT) {
      setShareUrl(null)
      setMessage({ tone: 'error', text: 'แบบนี้ละเอียดเกินกว่าจะใส่ในลิงก์ (มักเป็นรูปหรือ SVG ที่มีเส้นมาก) ส่งไฟล์งาน .jjd แทน' })
      return
    }
    const url = `${window.location.origin}/app#d=${code}`
    setShareUrl(url)
    const font = draft.fontId === CUSTOM_FONT_ID ? ' ฟอนต์ของคุณไม่ได้ไปกับลิงก์ ผู้รับจะเห็นฟอนต์มาตรฐานแทน' : ''
    try {
      await navigator.clipboard.writeText(url)
      setMessage({ tone: 'ok', text: `คัดลอกลิงก์แล้ว ส่งให้ลูกค้าหรือเพื่อนเปิดดูและแก้ต่อได้${font}` })
    } catch {
      setMessage({ tone: 'ok', text: `สร้างลิงก์แล้ว กดค้างที่ช่องลิงก์เพื่อคัดลอก${font}` })
    }
  }

  async function openProject(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      let parsed: { app?: string; version?: number; draft?: Partial<Draft> }
      try {
        parsed = JSON.parse(await file.text())
      } catch {
        throw new Error('ไฟล์เสียหรือไม่ใช่ไฟล์งาน .jjd')
      }
      if (!parsed || parsed.app !== 'jjdesign' || parsed.version !== 1 || !parsed.draft || typeof parsed.draft !== 'object' || Array.isArray(parsed.draft)) throw new Error('ไม่ใช่ไฟล์งานของ JJDesign รุ่นที่รองรับ')
      const cleaned = cleanDraft(parsed.draft)
      if (cleaned.fontId === CUSTOM_FONT_ID) cleaned.fontId = FONT_OPTIONS[0].id
      setDraft((d) => ({ ...d, ...cleaned }))
      setHidden(new Set())
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

  useEffect(() => () => { builtParts.forEach((part) => part.geometry.dispose()) }, [builtParts])

  const setValue = (key: string, value: number) =>
    setDraft((d) => ({ ...d, values: { ...d.values, [style.id]: { ...cleanValues(style, d.values[style.id]), [key]: value } } }))

  const shownStyles = STYLES.filter(
    (s) => (filter === 'all' || s.group === filter) && (!search.trim() || `${s.code} ${s.name} ${s.blurb}`.toLowerCase().includes(search.trim().toLowerCase())),
  )

  const error = (style.usesArt ? artError : null) ?? buildError
  const exportBlocked = busy || Boolean(error) || (style.usesArt && draft.source === 'text' && !font)
  const hasVisibleParts = parts.some((p) => !hidden.has(p.code))

  // Shop estimate: the shop's own prices against what this design uses.
  const shownStats = useMemo(() => stats.filter((s) => !hidden.has(s.part.code)), [stats, hidden])
  const ledUse = modules && power ? { modules: modules.length, supplies: power.supplies } : null
  const cost = costSheet(shownStats, ledUse, rates)
  const measures = useMemo(() => (step === 4 && style.usesArt ? artMeasures(joined.region) : null), [step, style.usesArt, joined])
  const figures: [string, string][] = [
    ...(measures
      ? ([
          ['ความยาวขอบตัวอักษร', `${(measures.perimeter / 1000).toLocaleString('th-TH', { maximumFractionDigits: 2 })} ม.`],
          ['พื้นที่หน้าตัวอักษร', `${(measures.faceArea / 100).toLocaleString('th-TH', { maximumFractionDigits: 0 })} ตร.ซม.`],
        ] as [string, string][])
      : []),
    ['น้ำหนักชิ้นพิมพ์', `${shownStats.filter((s) => !s.part.cut && s.part.material !== 'led').reduce((sum, s) => sum + s.grams, 0).toFixed(0)} กรัม`],
    ...(ledUse ? ([['ไฟ LED', `${ledUse.modules} ดวง · หม้อแปลง ${ledUse.supplies} ตัว`]] as [string, string][]) : []),
  ]
  const quantity = (n: number, unit: string) =>
    `${n.toLocaleString('th-TH', { maximumFractionDigits: unit === 'กก.' || unit === 'ตร.ม.' ? 3 : 0 })} ${unit}`
  const setRate = (key: string, raw: number) => {
    const value = Number.isFinite(raw) ? Math.max(0, raw) : 0
    setRates((r) => cleanRates(
      key.startsWith('sheet:')
        ? { ...r, sheet: { ...r.sheet, [key.slice(6)]: value } }
        : { ...r, [key]: value },
    ))
  }

  function openJobSheet() {
    if (exportBlocked || !hasVisibleParts) return
    let image: string | null = null
    try {
      image = capture.current?.() ?? null
    } catch {
      image = null
    }
    setSheet(jobSheetHtml({
      shop: rates.shop.trim(),
      customer: job.customer.trim(),
      job: job.job.trim(),
      notes: job.notes.trim(),
      date: new Date(),
      image,
      style: `${style.code} ${style.name}`,
      text: style.usesArt && draft.source === 'text' ? draft.text : '',
      size,
      parts: shownStats.map((s) => ({
        code: s.part.code,
        label: s.part.label,
        material: MATERIAL_NAMES[s.part.material],
        method: partMethod(s.part),
        size: `${s.size.x.toFixed(0)}×${s.size.y.toFixed(0)}×${s.size.z.toFixed(1)}`,
        grams: s.part.material === 'led' ? '—' : s.grams.toFixed(0),
      })),
      figures,
      cost: job.prices ? { ...cost, margin: rates.margin } : null,
    }))
  }

  useEffect(() => {
    if (sheet && sheetRoot.current) return containModalFocus(sheetRoot.current, () => setSheet(null))
  }, [sheet])

  // Artwork size (the lettering itself, before frames or bases), and a width
  // control that scales the height to match: signs are often quoted by width.
  const artBox = useMemo(() => bounds(art), [art])
  const artReady = art.length > 0 && artBox.w > 0 && artBox.h > 0
  const setHeight = (mm: number) => update({ heightMM: Math.round(Math.min(1500, Math.max(10, mm))) })
  // Fixed tracking makes size piecewise affine: the widest line (or outermost
  // glyph with negative tracking) can change. Verify each estimate on commit,
  // never during rendering, and stop once it matches the requested size.
  const solveHeight = (mm: number, axis: 'w' | 'h') => {
    const h0 = deferred.heightMM
    const s0 = artBox[axis]
    if (Math.abs(mm - s0) <= 0.001) return h0
    if (deferred.source !== 'text' || !font || deferred.spacingMM === 0) return (h0 * mm) / s0
    let previousH = h0
    let previousS = s0
    let height = h0 >= 750 ? h0 / 2 : h0 * 2
    for (let i = 0; i < 4; i++) {
      const measured = bounds(textToRegion(font, deferred.text, height, deferred.spacingMM, deferred.lineGap, deferred.align))[axis]
      if (Math.abs(measured - mm) <= 0.01) return height
      const slope = (measured - previousS) / (height - previousH)
      const next = Math.min(1500, Math.max(10, slope > 0 ? height + (mm - measured) / slope : height * mm / measured))
      if (!Number.isFinite(next) || Math.abs(next - height) < 0.0001) return height
      previousH = height
      previousS = measured
      height = next
    }
    return height
  }
  const sizeLabel = draft.source === 'text' ? 'ขนาดตัวอักษร (ขนาดฟอนต์)' : 'ความสูงชิ้นงาน'
  const exact = (label: string, axis: 'w' | 'h') => (
    <Range
      label={label}
      unit="มม."
      value={Math.round(artBox[axis] * 100) / 100}
      // Loose bounds: the font size is clamped to 10–1500 mm after solving.
      min={1}
      max={100000}
      step={0.01}
      slider={false}
      onChange={(mm) => {
        if (busy || !artReady) return
        const height = solveHeight(mm, axis)
        if (Number.isFinite(height)) update({ heightMM: Math.round(Math.min(1500, Math.max(10, height)) * 1_000_000) / 1_000_000 })
      }}
    />
  )
  const sizeBox = (
    <fieldset className="size-box">
      <legend>ขนาด{draft.source === 'text' ? 'ตัวอักษร' : 'ชิ้นงาน'}</legend>
      <div className="size-presets" role="group" aria-label={`${sizeLabel}สำเร็จรูป`}>
        {[50, 100, 200, 300, 500].map((mm) => (
          <button key={mm} type="button" aria-pressed={draft.heightMM === mm} onClick={() => setHeight(mm)}>
            {mm >= 100 ? `${mm / 10} ซม.` : `${mm} มม.`}
          </button>
        ))}
      </div>
      <Range label={sizeLabel} unit="มม." value={draft.heightMM} min={10} max={1500} step={1} onChange={setHeight} />
      {artReady && !busy && (
        <div className="size-exact">
          <p className="size-sum">
            {draft.source === 'text' ? 'หรือสั่งตามขนาดจริงของข้อความ' : 'หรือสั่งตามขนาดจริง'}
            {draft.source === 'text' && draft.text.includes('\n') && ' (รวมทุกบรรทัด)'} ใส่ตัวเลขแล้วกด Enter เพื่อปรับขนาด
          </p>
          {exact('กว้างจริง', 'w')}
          {exact('สูงจริง', 'h')}
        </div>
      )}
    </fieldset>
  )

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
          <button type="button" className="icon-link" aria-label="ดูวิธีใช้อีกครั้ง" title="ดูวิธีใช้อีกครั้ง" onClick={() => setTour(true)}>
            <Icon name="help" />
          </button>
          <Link href="/account" className="credit-chip" title="เครดิตทดลอง ไม่ใช่เงินจริง">
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
          captureRef={capture}
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
          {parts.filter((p) => p.warning).map((p) => (
            <span key={p.id} className="ed-warn" role="status">{p.warning}</span>
          ))}
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
                  {sizeBox}
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
                  {sizeBox}
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
                  {sizeBox}
                </>
              )}

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
                    <button type="button" className="pick" aria-pressed={s.id === style.id} onClick={() => { update({ styleId: s.id }); setHidden(new Set()) }}>
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
              {style.usesArt && sizeBox}
              {style.usesArt && floating.pieces > 1 && (
                <div className="option-card" data-on={draft.bridge > 0 || undefined}>
                  <div className="option-head">
                    <span>
                      <span className="option-kicker">
                        {floating.marks > 0 ? `พบชิ้นลอย ${floating.marks} ชิ้น` : `ลายแยกเป็น ${floating.pieces} ชิ้น`}
                      </span>
                      <span className="option-title">เชื่อมชิ้นลอยเข้ากับตัวอักษร</span>
                      <small className="range-hint">ต่อสะพานบางๆ ให้สระบน สระล่าง วรรณยุกต์ และจุด ติดกับตัวอักษร พิมพ์และติดตั้งเป็นชิ้นเดียว ไม่หลุดหาย</small>
                    </span>
                  </div>
                  <div className="seg seg-small" role="group" aria-label="เชื่อมชิ้นลอย">
                    {(['ไม่เชื่อม', 'เฉพาะสระ วรรณยุกต์', 'ทุกชิ้นเป็นชิ้นเดียว'] as const).map((choice, i) => (
                      <button key={choice} type="button" aria-pressed={draft.bridge === i} onClick={() => update({ bridge: i as BridgeMode })}>
                        {choice}
                      </button>
                    ))}
                  </div>
                  {draft.bridge > 0 && (
                    <>
                      <Range label="ความหนาสะพาน" unit="มม." value={draft.bridgeW} min={0.6} max={6} step={0.1} onChange={(v) => update({ bridgeW: v })} />
                      {!busy && (
                        <small className="range-hint">
                          {joined.bars > 0 ? `เพิ่มสะพาน ${joined.bars} จุด` : 'ไม่มีชิ้นที่ต้องเชื่อม'}
                        </small>
                      )}
                    </>
                  )}
                </div>
              )}
              {style.params.filter((param) => !param.when).map((param) => {
                const range = (def: typeof param) => (
                  <Range
                    key={def.key}
                    label={def.label}
                    unit={def.unit}
                    hint={def.hint}
                    value={values[def.key]}
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    onChange={(v) => setValue(def.key, v)}
                  />
                )
                if (!param.kind) return range(param)
                // The lip is an add-on for plastic walls only: hidden for metal or sheet walls.
                if (param.key === 'seatLip' && !lipAllowed) return null
                const on = values[param.key] > 0
                const children = style.params.filter((child) => child.when === param.key)
                const heading = (
                  <span>
                    {param.kicker && <span className="option-kicker">{param.kicker}</span>}
                    <span className="option-title">{param.label}</span>
                    {param.hint && <small className="range-hint">{param.hint}</small>}
                  </span>
                )
                if (param.kind === 'choice') {
                  return (
                    <div key={param.key} className="option-card" data-on={on || undefined}>
                      <div className="option-head">{heading}</div>
                      <div className="seg seg-small" role="group" aria-label={param.label}>
                        {(param.choices ?? []).map((choice, i) => (
                          <button key={choice} type="button" aria-pressed={values[param.key] === i} onClick={() => setValue(param.key, i)}>
                            {choice}
                          </button>
                        ))}
                      </div>
                      {on && children.map(range)}
                    </div>
                  )
                }
                return (
                  <div key={param.key} className="option-card" data-on={on || undefined}>
                    <label className="option-head">
                      {heading}
                      <input type="checkbox" role="switch" className="switch" checked={on} onChange={(e) => setValue(param.key, e.target.checked ? 1 : 0)} />
                    </label>
                    {on && children.map(range)}
                  </div>
                )
              })}
              {modules && power && (
                <section className="option-card led-plan" aria-label="ประมาณไฟ LED">
                  <div className="option-head">
                    <span>
                      <span className="option-kicker">ประมาณการ · ไม่เปลี่ยนไฟล์ผลิต</span>
                      <span className="option-title">ไฟ LED และหม้อแปลง</span>
                    </span>
                  </div>
                  <dl className="led-figures">
                    <div><dt>โมดูล LED</dt><dd className="tabular">{modules.length} ดวง</dd></div>
                    <div><dt>กำลังไฟรวม</dt><dd className="tabular">{power.watts.toFixed(1)} วัตต์</dd></div>
                    <div><dt>กระแสที่ 12 V</dt><dd className="tabular">{power.amps.toFixed(2)} A</dd></div>
                    <div>
                      <dt>หม้อแปลง 12 V</dt>
                      <dd className="tabular">{power.supplies > 1 ? `${power.supplies} × ` : ''}{power.supply} วัตต์</dd>
                    </div>
                  </dl>
                  <Range label="ระยะห่างโมดูล" unit="มม." value={draft.ledPitch} min={15} max={300} step={5} onChange={(v) => update({ ledPitch: v })} />
                  <Range label="กำลังไฟต่อโมดูล" unit="วัตต์" value={draft.ledWatt} min={0.1} max={10} step={0.01} onChange={(v) => update({ ledWatt: v })} />
                  <small className="range-hint">
                    วางโมดูลห่างจากผนังด้านใน 5 มม. ทุกช่องที่วางได้มีอย่างน้อย 1 ดวง หม้อแปลงเผื่อไว้ให้ใช้ไม่เกิน {Math.round(PSU_LOAD * 100)}% ของพิกัด ตรวจสเปกโมดูลจริงก่อนเสนอราคา
                  </small>
                </section>
              )}
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
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`ส่งออก ${s.part.code} ${s.part.label}`}
                          checked={!hidden.has(s.part.code)}
                          onChange={() => setHidden((h) => { const next = new Set(h); if (next.has(s.part.code)) next.delete(s.part.code); else next.add(s.part.code); return next })}
                        />{' '}
                        <span className="layer-code">{s.part.code}</span> {s.part.label}
                        <span className="method" data-cut={s.part.cut ? true : undefined}>{partMethod(s.part)}</span>
                        {!s.watertight && <span className="warn" title="ผิวชิ้นงานมีรอยต่อ ให้ตรวจหรือซ่อมใน slicer ก่อนพิมพ์">ตรวจใน slicer</span>}
                      </td>
                      <td>
                        {s.part.material === 'led' ? MATERIAL_NAMES.led : s.part.addon ? (
                          <span className="addon-note">{MATERIAL_NAMES[s.part.material]}<small>ออปชั่นเสริม ตามผนัง {s.part.addon.wall}</small></span>
                        ) : (
                          <select
                            className="material-pick"
                            disabled={busy}
                            aria-label={`วัสดุของ ${s.part.code} ${s.part.label}`}
                            value={s.part.material}
                            onChange={(e) => setMaterial(s.part.code, e.target.value as MaterialId)}
                          >
                            {PICKABLE_MATERIALS.map((m) => <option key={m} value={m}>{MATERIAL_NAMES[m]}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="num tabular">{s.part.material === 'led' ? '—' : s.grams.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {materialPicks && Object.keys(materialPicks).length > 0 && (
                <button type="button" className="btn btn-ghost" onClick={() => setDraft((d) => { const next = { ...d.materials }; delete next[style.id]; return { ...d, materials: next } })}>
                  <Icon name="reset" size={16} /> วัสดุตามแบบเดิม
                </button>
              )}
              <p className="note">เปลี่ยนวัสดุแล้วน้ำหนักและไฟล์จะเปลี่ยนตาม ชิ้นแบนบางที่ใช้วัสดุแผ่นได้ไฟล์ DXF สำหรับตัด ส่วนชิ้นที่มีรูปทรงได้ไฟล์ STL สำหรับพิมพ์ ใน ZIP แยกโฟลเดอร์ตามวัสดุ</p>
              <section className="option-card quote" aria-label="ประมาณต้นทุนงาน">
                <div className="option-head">
                  <span>
                    <span className="option-kicker">สำหรับร้านป้าย · ใส่ราคาของร้านเอง</span>
                    <span className="option-title">ประมาณต้นทุนงาน</span>
                  </span>
                </div>
                <dl className="led-figures">
                  {figures.map(([label, value]) => (
                    <div key={label}><dt>{label}</dt><dd className="tabular">{value}</dd></div>
                  ))}
                </dl>
                <table className="quote-lines">
                  <thead>
                    <tr><th>รายการ</th><th className="num">ราคาต่อหน่วย</th><th className="num">บาท</th></tr>
                  </thead>
                  <tbody>
                    {cost.lines.map((line) => (
                      <tr key={line.key}>
                        <td>
                          {line.label}
                          <small className="tabular">{quantity(line.qty, line.unit)}</small>
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            min={0}
                            inputMode="decimal"
                            aria-label={`ราคา ${line.label} บาทต่อ${line.unit}`}
                            value={line.rate || ''}
                            placeholder="0"
                            onChange={(e) => setRate(line.key, Number(e.target.value))}
                          />
                          <small>บาท/{line.unit}</small>
                        </td>
                        <td className="num tabular">{baht(line.amount)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>บวกเพิ่ม (กำไร ค่าดำเนินการ)</td>
                      <td className="num">
                        <input type="number" min={0} max={500} inputMode="decimal" aria-label="บวกเพิ่ม เปอร์เซ็นต์" value={rates.margin || ''} placeholder="0" onChange={(e) => setRate('margin', Number(e.target.value))} />
                        <small>%</small>
                      </td>
                      <td className="num tabular">{baht(cost.markup)}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={2}>รวมโดยประมาณ</td><td className="num tabular">{baht(cost.total)}</td></tr>
                  </tfoot>
                </table>
                <small className="range-hint">
                  {cost.unpriced.length > 0 && <>ยังไม่ได้ใส่ราคา: {cost.unpriced.join(', ')} · </>}
                  ชิ้นพิมพ์คิดตามน้ำหนัก ชิ้นแผ่นคิดตามกรอบสี่เหลี่ยมที่ตัด ราคาที่ใส่จำไว้ในเบราว์เซอร์นี้เท่านั้น
                </small>
              </section>
              <section className="option-card job-card" aria-label="ใบงานและใบยืนยันแบบ">
                <div className="option-head">
                  <span>
                    <span className="option-kicker">ส่งลูกค้าอนุมัติ</span>
                    <span className="option-title">ใบงานและใบยืนยันแบบ</span>
                    <small className="range-hint">ภาพป้ายตามมุมที่หมุนไว้ ขนาด รายการชิ้นส่วน และช่องเซ็นอนุมัติ พิมพ์หรือบันทึกเป็น PDF ได้</small>
                  </span>
                </div>
                <label className="field">
                  <span className="field-label">ชื่อร้านของคุณ</span>
                  <input type="text" maxLength={80} value={rates.shop} onChange={(e) => setRates((r) => ({ ...r, shop: e.target.value }))} />
                </label>
                <div className="job-pair">
                  <label className="field">
                    <span className="field-label">ลูกค้า</span>
                    <input type="text" maxLength={80} value={job.customer} onChange={(e) => setJob((j) => ({ ...j, customer: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="field-label">ชื่องาน / เลขที่</span>
                    <input type="text" maxLength={80} value={job.job} onChange={(e) => setJob((j) => ({ ...j, job: e.target.value }))} />
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">หมายเหตุ</span>
                  <textarea rows={2} maxLength={600} value={job.notes} onChange={(e) => setJob((j) => ({ ...j, notes: e.target.value }))} placeholder="เช่น สีไฟ วันส่ง ที่ติดตั้ง" />
                </label>
                <label className="check">
                  <input type="checkbox" checked={job.prices} onChange={(e) => setJob((j) => ({ ...j, prices: e.target.checked }))} />
                  แสดงราคาในใบงาน
                </label>
                <button type="button" className="btn btn-ghost btn-block" disabled={exportBlocked || !hasVisibleParts} onClick={openJobSheet}>
                  <Icon name="file" size={16} /> เปิดใบงาน <span className="cost">ฟรี</span>
                </button>
              </section>
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
                <button type="button" className="btn btn-ghost btn-block" onClick={shareDesign}>
                  <Icon name="link" size={16} /> คัดลอกลิงก์แชร์แบบ <span className="cost">ฟรี</span>
                </button>
                {shareUrl && (
                  <label className="field share-field">
                    <span className="field-label">ลิงก์แชร์แบบ <small>ใครเปิดก็ได้สำเนาไปแก้ต่อ แบบของคุณไม่เปลี่ยน</small></span>
                    <input type="text" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
                  </label>
                )}
              </div>
              <p className="note">
                ระบบเครดิตบนเว็บนี้เป็นการสาธิต ไม่มีการเก็บเงินจริง ชิ้นส่วนที่ซ่อนอยู่จะไม่ถูกส่งออก ตรวจขนาดในโปรแกรม slicer ก่อนสั่งผลิตทุกครั้ง{' '}
                <Link href="/account">เติมเครดิตทดลอง</Link>
              </p>
            </div>
          )}
        </div>
      </aside>
      {tour && <Tour steps={TOUR} onClose={endTour} />}
      {sheet && (
        <div ref={sheetRoot} className="sheet-modal" role="dialog" aria-modal="true" aria-label="ใบงานและใบยืนยันแบบ">
          <div className="sheet-bar">
            <strong>ใบงานและใบยืนยันแบบ</strong>
            <button type="button" className="btn btn-primary" onClick={() => sheetFrame.current?.contentWindow?.print()}>
              <Icon name="download" size={16} /> พิมพ์ / บันทึกเป็น PDF
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSheet(null)}>
              <Icon name="close" size={16} /> ปิด
            </button>
          </div>
          <iframe ref={sheetFrame} title="ใบงาน" srcDoc={sheet} />
        </div>
      )}
    </div>
  )
}
