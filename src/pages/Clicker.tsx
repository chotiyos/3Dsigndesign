import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { credits, EXPORT_COST, spend, useDemo } from '../lib/account'
import {
  buildClicker, cleanClicker, cleanClickerColours, cleanClickerText, clickerReadme, CLICKER_PALETTES, DEFAULT_CLICKER, frameColour, ICONS, insertClickerIcon, keysOf, MAX_KEYS, sameClickerColours, withClickerKeyColour,
  type ClickerBuild, type ClickerColours, type ClickerEdge, type ClickerLayout, type ClickerOptions,
} from '../lib/clickerKeychain'
import { buildZip, downloadBlob, partsList, partStats, printableStl, safeName } from '../lib/exportModel'
import { FONT_OPTIONS } from '../lib/fonts'
import { loadFont, type LoadedFont } from '../lib/hb'
import { useTitle } from '../router'
import { Viewer } from '../three/Viewer'
import { Icon } from '../ui/Icon'

export const CLICKER_KEY = 'jjdesign-clicker-v1'
const DEFAULT_FONT = 'kanit-bold'
const BUILDS: { id: ClickerBuild; label: string; note: string }[] = [
  { id: 'solid', label: 'ตกแต่ง', note: 'พิมพ์ชิ้นเดียวจบ ไม่ต้องประกอบ' },
  { id: 'switch', label: 'กดได้', note: 'ใส่สวิตช์คีย์บอร์ดแบบ MX ซื้อแยก ปุ่มละ 1 ตัว' },
]
const EDGES: { id: ClickerEdge; label: string }[] = [
  { id: 'scallop', label: 'ขอบหยัก' },
  { id: 'round', label: 'สี่เหลี่ยมมน' },
  { id: 'circle', label: 'วงกลม' },
  { id: 'pencil', label: 'ดินสอ' },
]
const LAYOUTS: { id: ClickerLayout; label: string }[] = [
  { id: 'column', label: 'แนวตั้ง' },
  { id: 'row', label: 'แนวนอน' },
]

interface Saved {
  options: ClickerOptions
  colours: ClickerColours
  fontId: string
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(CLICKER_KEY) ?? 'null') as Record<string, unknown> | null
    if (raw && typeof raw === 'object') {
      const fontId = FONT_OPTIONS.some((f) => f.id === raw.fontId) ? (raw.fontId as string) : DEFAULT_FONT
      return { options: cleanClicker(raw.options), colours: cleanClickerColours(raw.colours), fontId }
    }
  } catch {
    // Storage blocked or damaged: start fresh.
  }
  return { options: DEFAULT_CLICKER, colours: CLICKER_PALETTES[0].colours, fontId: DEFAULT_FONT }
}

export default function Clicker() {
  useTitle('พวงกุญแจปุ่มคีย์บอร์ด')
  const demo = useDemo()
  const [saved] = useState(load)
  const [options, setOptions] = useState<ClickerOptions>(saved.options)
  const [colours, setColours] = useState<ClickerColours>(saved.colours)
  const [fontId, setFontId] = useState(saved.fontId)
  const [draft, setDraft] = useState(saved.options.text)
  const [hasSelection, setHasSelection] = useState(false)
  const [composing, setComposing] = useState(false)
  const composition = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const [explode, setExplode] = useState(0)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [loaded, setLoaded] = useState<{ id: string; font: LoadedFont } | null>(null)
  const [fontError, setFontError] = useState<string | null>(null)
  const font = loaded?.id === fontId ? loaded.font : null
  useEffect(() => {
    let cancelled = false
    setFontError(null)
    const option = FONT_OPTIONS.find((f) => f.id === fontId)!
    loadFont(option.url).then((font) => {
      if (!cancelled) setLoaded({ id: fontId, font })
    }).catch(() => {
      if (!cancelled) setFontError('โหลดฟอนต์ไม่สำเร็จ ลองเปลี่ยนฟอนต์หรือรีเฟรชหน้าอีกครั้ง')
    })
    return () => { cancelled = true }
  }, [fontId])

  useEffect(() => {
    if (composing) return
    const timer = setTimeout(() => {
      const text = cleanClickerText(draft)
      setOptions((o) => (text === o.text ? o : { ...o, text }))
    }, 200)
    return () => clearTimeout(timer)
  }, [draft, composing])

  useEffect(() => {
    try {
      localStorage.setItem(CLICKER_KEY, JSON.stringify({ options, colours, fontId }))
    } catch {
      // Not saved; the design still works for this visit.
    }
  }, [options, colours, fontId])

  const deferred = useDeferredValue(options)
  const deferredColours = useDeferredValue(colours)
  const model = useMemo(() => {
    if (!font) return null
    try {
      return buildClicker(font, deferred, deferredColours)
    } catch {
      return { parts: [], print: [], colours: {}, keys: [], width: 0, height: 0, thickness: 0, warning: 'สร้างแบบไม่สำเร็จ ลองเปลี่ยนชื่อหรือฟอนต์' }
    }
  }, [font, deferred, deferredColours])
  const parts = useMemo(() => model?.parts ?? [], [model])
  useEffect(() => () => {
    const all = new Set([...(model?.parts ?? []), ...(model?.print ?? [])])
    all.forEach((part) => part.geometry.dispose())
  }, [model])

  const busy = composing || cleanClickerText(draft) !== options.text || deferred !== options || deferredColours !== colours || !font
  const set = <K extends keyof ClickerOptions>(key: K, value: ClickerOptions[K]) => {
    setMessage(null)
    setOptions((o) => ({ ...o, [key]: value }))
  }
  const keys = keysOf(draft)
  const palette = CLICKER_PALETTES.find((p) => sameClickerColours(p.colours, colours))

  function addIcon(icon: string) {
    if (composition.current) return
    setMessage(null)
    const el = input.current
    const at = el?.selectionStart ?? draft.length
    const next = insertClickerIcon(draft, icon, at, el?.selectionEnd ?? at)
    setDraft(next.text)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(next.caret, next.caret)
      setHasSelection(false)
    })
  }

  function setKeyColour(i: number, colour: string) {
    setMessage(null)
    setColours((c) => withClickerKeyColour(c, i, colour))
  }

  const baseName = safeName(options.text.trim() || 'พวงกุญแจ')
  function download(kind: 'zip' | 'stl') {
    if (busy || !model || model.print.length === 0) return
    const cost = EXPORT_COST[kind]
    try {
      const data = kind === 'stl'
        ? printableStl(model.print)
        : buildZip({ baseName, parts: model.print, readme: clickerReadme(model, options, partsList(partStats(model.print))) })
      if (!spend(cost, `${kind.toUpperCase()} พวงกุญแจปุ่ม ${baseName}`)) {
        setMessage({ tone: 'error', text: `เครดิตทดลองไม่พอ ต้องใช้ ${cost} เครดิต เหลือ ${credits(demo)} เครดิต` })
        return
      }
      downloadBlob(data, `${baseName}-พวงกุญแจปุ่ม.${kind}`, kind === 'zip' ? 'application/zip' : 'model/stl')
      setMessage({ tone: 'ok', text: `ดาวน์โหลดแล้ว หัก ${cost} เครดิตทดลอง` })
    } catch (err) {
      setMessage({ tone: 'error', text: `ส่งออกไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  const files = model?.print.length ?? 0
  const isSwitch = options.build === 'switch'

  return (
    <div className="page gen lightbox keychain">
      <header className="page-head">
        <h1>พวงกุญแจปุ่มคีย์บอร์ด</h1>
        <p>
          ตัวอักษรละ 1 ปุ่ม ต่อกันเป็นพวง เลือกสีกรอบทีละปุ่ม ทำแบบตกแต่งพิมพ์ชิ้นเดียว หรือแบบกดได้จริงที่ใส่สวิตช์คีย์บอร์ด ได้ไฟล์ STL แยกสีพร้อมพิมพ์
        </p>
      </header>
      <div className="gen-layout">
        <div className="gen-form">
          <section className="lbx-step" aria-labelledby="ck-1">
            <h2 id="ck-1"><span>1</span> ตัวอักษรบนปุ่ม</h2>
            <label className="field">
              <span className="field-label">
                ชื่อหรือคำ <small className="tabular">{keys.length}/{MAX_KEYS} ปุ่ม</small>
              </span>
              <input
                ref={input}
                onSelect={(e) => setHasSelection(e.currentTarget.selectionStart !== e.currentTarget.selectionEnd)}
                type="text"
                value={draft}
                placeholder="เช่น MALI หรือ มะลิ"
                onCompositionStart={() => { composition.current = true; setComposing(true) }}
                onCompositionEnd={(e) => {
                  composition.current = false
                  setComposing(false)
                  setDraft(cleanClickerText(e.currentTarget.value))
                }}
                onChange={(e) => {
                  setMessage(null)
                  setDraft(composition.current ? e.target.value : cleanClickerText(e.target.value))
                }}
              />
            </label>
            <p className="note">1 ตัวอักษร = 1 ปุ่ม สระและวรรณยุกต์อยู่บนปุ่มเดียวกับตัวอักษร เว้นวรรคไม่นับเป็นปุ่ม</p>
            <div className="field">
              <span className="field-label">ปุ่มรูปภาพ</span>
              <div className="seg seg-small ck-icons" role="group" aria-label="เพิ่มปุ่มรูปภาพ">
                {ICONS.map((icon) => (
                  <button key={icon} type="button" disabled={composing || (keys.length >= MAX_KEYS && !hasSelection)} onMouseDown={(e) => e.preventDefault()} onClick={() => addIcon(icon)} aria-label={`เพิ่มปุ่ม ${icon}`}>{icon}</button>
                ))}
              </div>
            </div>
            <label className="field">
              <span className="field-label">ฟอนต์</span>
              <select value={fontId} onChange={(e) => { setMessage(null); setFontId(e.target.value) }}>
                {FONT_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label} · {f.note}</option>)}
              </select>
            </label>
            {fontError && <p className="form-error" role="alert">{fontError}</p>}
          </section>

          <section className="lbx-step" aria-labelledby="ck-2">
            <h2 id="ck-2"><span>2</span> แบบ</h2>
            <div className="ck-builds" role="group" aria-label="แบบการพิมพ์">
              {BUILDS.map((b) => (
                <button key={b.id} type="button" aria-pressed={options.build === b.id} onClick={() => set('build', b.id)}>
                  <strong>{b.label}</strong>
                  <small>{b.note}</small>
                </button>
              ))}
            </div>
            <div className="seg seg-small" role="group" aria-label="ขอบกรอบ">
              {EDGES.map((e) => (
                <button key={e.id} type="button" aria-pressed={options.edge === e.id} onClick={() => set('edge', e.id)}>{e.label}</button>
              ))}
            </div>
            <div className="seg seg-small" role="group" aria-label="การเรียงปุ่ม">
              {LAYOUTS.map((l) => (
                <button key={l.id} type="button" aria-pressed={options.layout === l.id} onClick={() => set('layout', l.id)}>{l.label}</button>
              ))}
            </div>
            <div className="option-card" data-on={options.loop || undefined}>
              <label className="option-head">
                <span><span className="option-title">หูห้อยพร้อมรู</span> <small>รูขนาด 3.5 มม. ใส่ห่วงหรือสายคล้อง</small></span>
                <input type="checkbox" role="switch" className="switch" checked={options.loop} onChange={(e) => set('loop', e.target.checked)} />
              </label>
            </div>
          </section>

          <section className="lbx-step" aria-labelledby="ck-3">
            <h2 id="ck-3"><span>3</span> สี</h2>
            <ul className="kc-palettes" aria-label="ชุดสี">
              {CLICKER_PALETTES.map((p) => (
                <li key={p.id}>
                  <button type="button" aria-pressed={palette?.id === p.id} onClick={() => { setMessage(null); setColours(p.colours) }} title={p.name}>
                    <span className="ck-swatch" aria-hidden="true">
                      {Array.from({ length: 4 }, (_, i) => <span key={i} style={{ background: frameColour(p.colours, i) }} />)}
                    </span>
                    <span className="kc-palette-name">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            {keys.length > 0 && (
              <div className="field">
                <span className="field-label">สีกรอบทีละปุ่ม</span>
                <div className="ck-keys">
                  {keys.map((k, i) => (
                    <label key={i} title={`สีกรอบปุ่ม ${k}`}>
                      <input type="color" value={frameColour(colours, i)} onChange={(e) => setKeyColour(i, e.target.value)} aria-label={`สีกรอบปุ่มที่ ${i + 1} (${k})`} />
                      <span>{k}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="kc-own">
              <label>
                <input type="color" value={colours.cap} onChange={(e) => setColours((c) => ({ ...c, cap: e.target.value }))} />
                <span>ปุ่ม</span>
              </label>
              <label>
                <input type="color" value={colours.letter} onChange={(e) => setColours((c) => ({ ...c, letter: e.target.value }))} />
                <span>ตัวอักษร</span>
              </label>
            </div>
            <p className="note">{palette ? `ชุด${palette.name}` : 'สีที่เลือกเอง'} · กรอบสีเดียวกันรวมเป็นไฟล์เดียว</p>
          </section>

          <section className="lbx-step" aria-labelledby="ck-4">
            <h2 id="ck-4"><span>4</span> ส่งออกไฟล์</h2>
            <button type="button" className="btn btn-primary btn-block" disabled={busy || files === 0} onClick={() => download('zip')}>
              <Icon name="download" size={16} /> ZIP แยกสี {files ? `${files} ไฟล์ ` : ''}+ วิธีพิมพ์ <span className="cost">{EXPORT_COST.zip} เครดิต</span>
            </button>
            <button type="button" className="btn btn-ghost btn-block" disabled={busy || files === 0} onClick={() => download('stl')}>
              STL รวมชิ้นเดียว (พิมพ์สีเดียว) <span className="cost">{EXPORT_COST.stl} เครดิต</span>
            </button>
            <p className="note">
              {isSwitch
                ? 'ในไฟล์ ปุ่มวางเรียงข้างตัวเรือนพร้อมพิมพ์ ใช้สวิตช์คีย์บอร์ดแบบ MX (Cherry MX, Gateron, Kailh, Outemu) ปุ่มละ 1 ตัว แนะนำพิมพ์ปุ่มเดียวลองความพอดีก่อน'
                : 'ไฟล์แยกสีวางตรงกันอยู่แล้ว ลากทุกไฟล์เข้า Bambu Studio พร้อมกัน ตอบ "ใช่" ให้โหลดเป็นวัตถุเดียว แล้วกำหนดสีให้แต่ละชิ้น'}
            </p>
            {message && <p className={`form-${message.tone === 'ok' ? 'ok' : 'error'}`} role="status">{message.text}</p>}
          </section>
        </div>

        <div className="gen-view lbx-view">
          <Viewer parts={parts} colors={model?.colours} explodeMM={explode} frameKey={`${options.layout}-${options.build}-${model?.keys.length ?? 0}`} className="sheet-viewer" label="ตัวอย่างพวงกุญแจปุ่ม 3 มิติ" />
          <p className="gen-tag" role="status">
            {model && parts.length
              ? `${model.width.toFixed(1)} × ${model.height.toFixed(1)} มม. · หนา ${model.thickness.toFixed(1)} มม. · ${model.keys.length} ปุ่ม`
              : fontError ? 'โหลดฟอนต์ไม่สำเร็จ' : font ? 'พิมพ์ตัวอักษรเพื่อเริ่ม' : 'กำลังโหลดฟอนต์'}
            {busy && font && ' · กำลังคำนวณ'}
          </p>
          <div className="lbx-tools">
            <label className="tool">
              <Icon name="explode" size={16} /> แยกชิ้น
              <input type="range" min={0} max={12} step={0.5} value={explode} onChange={(e) => setExplode(Number(e.target.value))} aria-label="ระยะแยกชิ้น" />
            </label>
          </div>
          {isSwitch && parts.length > 0 && <p className="note">สีเทาคือสวิตช์ที่ซื้อแยก แสดงให้เห็นตำแหน่งเท่านั้น ไม่อยู่ในไฟล์</p>}
          {model?.warning && <p className="ed-warn lbx-warn" role="status">{model.warning}</p>}
        </div>
      </div>
    </div>
  )
}
