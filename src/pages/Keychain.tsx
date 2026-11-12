import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { credits, EXPORT_COST, spend, useDemo } from '../lib/account'
import {
  buildBubble, bubbleReadme, cleanBubble, cleanColours, cleanText, DEFAULT_BUBBLE, graphemes, MAX_CHARS, MAX_ROWS, PALETTES, words,
  type BubbleColours, type BubbleOptions, type BubblePurpose, type BubbleShape, type BubbleStyle,
} from '../lib/bubbleKeychain'
import { buildZip, downloadBlob, partsList, partStats, printableStl, safeName } from '../lib/exportModel'
import { charmPath, charmViewBox, CHARM_GROUPS, CHARMS } from '../lib/charms'
import { FONT_OPTIONS } from '../lib/fonts'
import { loadFont, type LoadedFont } from '../lib/hb'
import { useTitle } from '../router'
import { Viewer } from '../three/Viewer'
import { Icon } from '../ui/Icon'
import { Range } from '../ui/Range'

export const KEYCHAIN_KEY = 'jjdesign-keychain-v1'
const DEFAULT_FONT = 'mitr-semibold'
const SIZES = [40, 50, 60]
const GRIP_SIZES = [35, 40, 45]
const PURPOSES: { id: BubblePurpose; label: string }[] = [
  { id: 'keychain', label: 'พวงกุญแจ' },
  { id: 'grip', label: 'แผ่นติด Griptok' },
]
const STYLES: { id: BubbleStyle; label: string }[] = [
  { id: 'name', label: 'ชื่อทั้งคำ' },
  { id: 'initial', label: 'ตัวอักษรใหญ่ + ชื่อ' },
  { id: 'charm', label: 'ชื่อ + ลายการ์ตูน' },
]
const SHAPES: { id: BubbleShape; label: string }[] = [
  { id: 'circle', label: 'วงกลม' },
  { id: 'contour', label: 'ตามรูปชื่อ' },
]
const LAYERS: { key: keyof BubbleColours; label: string }[] = [
  { key: 'base', label: 'ฐาน' },
  { key: 'bubble', label: 'ขอบบับเบิล' },
  { key: 'letter', label: 'ตัวอักษร' },
]
const layerLabel = (key: keyof BubbleColours, style: BubbleStyle) =>
  style === 'initial' ? { base: 'ฐานและแถบชื่อ', bubble: 'ตัวใหญ่และชื่อ', letter: 'ตัวอักษร' }[key] : LAYERS.find((l) => l.key === key)!.label

interface Saved {
  options: BubbleOptions
  colours: BubbleColours
  fontId: string
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEYCHAIN_KEY) ?? 'null') as Record<string, unknown> | null
    if (raw && typeof raw === 'object') {
      const fontId = FONT_OPTIONS.some((f) => f.id === raw.fontId) ? (raw.fontId as string) : DEFAULT_FONT
      const options = cleanBubble(raw.options)
      options.rows = Math.min(options.rows, Math.max(1, words(options.text).length))
      return { options, colours: cleanColours(raw.colours), fontId }
    }
  } catch {
    // Storage blocked or damaged: start fresh.
  }
  return { options: DEFAULT_BUBBLE, colours: PALETTES[0].colours, fontId: DEFAULT_FONT }
}

export default function Keychain() {
  useTitle('พวงกุญแจชื่อบับเบิล')
  const demo = useDemo()
  const [saved] = useState(load)
  const [options, setOptions] = useState<BubbleOptions>(saved.options)
  const [colours, setColours] = useState<BubbleColours>(saved.colours)
  const [fontId, setFontId] = useState(saved.fontId)
  const [draft, setDraft] = useState(saved.options.text)
  const [composing, setComposing] = useState(false)
  const composition = useRef(false)
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
      const text = cleanText(draft)
      setOptions((o) => {
        const rows = Math.min(o.rows, Math.max(1, words(text).length))
        return text === o.text && rows === o.rows ? o : { ...o, text, rows }
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [draft, composing])

  useEffect(() => {
    try {
      localStorage.setItem(KEYCHAIN_KEY, JSON.stringify({ options, colours, fontId }))
    } catch {
      // Not saved; the design still works for this visit.
    }
  }, [options, colours, fontId])

  const deferred = useDeferredValue(options)
  const model = useMemo(() => {
    if (!font) return null
    try {
      // Colours only tint the preview (below), so changing them never rebuilds.
      return buildBubble(font, deferred, PALETTES[0].colours)
    } catch {
      return { parts: [], colours: {}, rows: [], letterHeight: 0, width: 0, height: 0, warning: 'สร้างแบบไม่สำเร็จ ลองเปลี่ยนชื่อหรือฟอนต์' }
    }
  }, [font, deferred])
  const parts = useMemo(() => model?.parts ?? [], [model])
  useEffect(() => () => { parts.forEach((part) => part.geometry.dispose()) }, [parts])
  const tints = useMemo(() => {
    const out: Record<string, string> = {}
    // The initial style prints the name in the big letter's colour.
    const keys: (keyof BubbleColours)[] = options.style === 'initial' ? ['base', 'bubble', 'bubble'] : LAYERS.map((l) => l.key)
    parts.forEach((part, i) => (out[part.code] = colours[keys[i]]))
    return out
  }, [parts, colours, options.style])

  const busy = composing || cleanText(draft) !== options.text || deferred !== options || !font
  const set = <K extends keyof BubbleOptions>(key: K, value: BubbleOptions[K]) => {
    setMessage(null)
    setOptions((o) => ({ ...o, [key]: value }))
  }
  const wordCount = words(options.text).length
  const palette = PALETTES.find((p) => LAYERS.every(({ key }) => p.colours[key] === colours[key]))
  const chars = graphemes(draft.trim()).length

  const baseName = safeName(options.text.trim() || 'พวงกุญแจ')
  function download(kind: 'zip' | 'stl') {
    if (busy || !model || parts.length === 0) return
    const cost = EXPORT_COST[kind]
    try {
      const data = kind === 'stl'
        ? printableStl(parts)
        : buildZip({ baseName, parts, readme: bubbleReadme(model, options, colours, partsList(partStats(parts))) })
      if (!spend(cost, `${kind.toUpperCase()} พวงกุญแจ ${baseName}`)) {
        setMessage({ tone: 'error', text: `เครดิตทดลองไม่พอ ต้องใช้ ${cost} เครดิต เหลือ ${credits(demo)} เครดิต` })
        return
      }
      downloadBlob(data, `${baseName}-พวงกุญแจ.${kind}`, kind === 'zip' ? 'application/zip' : 'model/stl')
      setMessage({ tone: 'ok', text: `ดาวน์โหลดแล้ว หัก ${cost} เครดิตทดลอง` })
    } catch (err) {
      setMessage({ tone: 'error', text: `ส่งออกไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  const total = options.base + options.puff + options.letter
  const grip = options.purpose === 'grip'
  const initial = options.style === 'initial'

  return (
    <div className="page gen lightbox keychain">
      <header className="page-head">
        <h1>พวงกุญแจชื่อบับเบิล</h1>
        <p>
          พิมพ์ชื่อภาษาไทยหรืออังกฤษ ระบบทำตัวอักษรอ้วนกลมแบบบับเบิล จัดแถวให้พอดีพวงกุญแจหรือแผ่นติด Griptok หรือทำแบบตัวอักษรใหญ่ + ชื่อ แล้วแยกเป็น 3 สี ได้ไฟล์ STL พร้อมพิมพ์หลายสี
        </p>
      </header>
      <div className="gen-layout">
        <div className="gen-form">
          <section className="lbx-step" aria-labelledby="kc-1">
            <h2 id="kc-1"><span>1</span> ชื่อ</h2>
            <label className="field">
              <span className="field-label">
                ชื่อที่จะทำ <small className="tabular">{chars}/{MAX_CHARS}</small>
              </span>
              <input
                type="text"
                value={draft}
                placeholder="เช่น มะลิ หรือ Ploy"
                onCompositionStart={() => { composition.current = true; setComposing(true) }}
                onCompositionEnd={(e) => {
                  composition.current = false
                  setComposing(false)
                  setDraft(cleanText(e.currentTarget.value))
                }}
                onChange={(e) => {
                  setMessage(null)
                  setDraft(composition.current ? e.target.value : cleanText(e.target.value))
                }}
              />
            </label>
            <div className="field">
              <span className="field-label">แบบตัวอักษร</span>
              <div className="seg seg-small" role="group" aria-label="แบบตัวอักษร">
                {STYLES.map((st) => (
                  <button key={st.id} type="button" aria-pressed={options.style === st.id} onClick={() => set('style', st.id)}>{st.label}</button>
                ))}
              </div>
              {options.style === 'initial' && <small className="note">อักษรตัวแรกของชื่อเป็นตัวใหญ่ ชื่อเต็มวางบนแถบคาดตรงกลาง</small>}
            </div>
            {options.style === 'charm' && <div className="field">
              <span className="field-label">ลายต่อท้ายชื่อ <small>{CHARMS.find((ch) => ch.id === options.charm)?.name}</small></span>
              {CHARM_GROUPS.map((g) => (
                <div key={g.id} className="kc-charm-group">
                  <small>{g.name}</small>
                  <ul className="kc-charms" aria-label={`ลาย${g.name}`}>
                    {CHARMS.filter((ch) => ch.group === g.id).map((ch) => (
                      <li key={ch.id}>
                        <button type="button" aria-pressed={options.charm === ch.id} title={ch.name} aria-label={ch.name} onClick={() => set('charm', ch.id)}>
                          <svg viewBox={charmViewBox(ch.id)} aria-hidden="true"><path d={charmPath(ch.id)} fillRule="evenodd" /></svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>}
            {options.style !== 'initial' && <div className="field">
              <span className="field-label">จำนวนแถว <small>เว้นวรรคระหว่างคำ ระบบจึงแบ่งแถวได้</small></span>
              <div className="seg seg-small" role="group" aria-label="จำนวนแถว">
                <button type="button" aria-pressed={options.rows === 0} onClick={() => set('rows', 0)}>อัตโนมัติ</button>
                {Array.from({ length: MAX_ROWS }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" aria-pressed={options.rows === n} disabled={n > Math.max(1, wordCount)} onClick={() => set('rows', n)}>{n}</button>
                ))}
              </div>
            </div>}
            <label className="field">
              <span className="field-label">ฟอนต์</span>
              <select value={fontId} onChange={(e) => { setMessage(null); setFontId(e.target.value) }}>
                {FONT_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label} · {f.note}</option>)}
              </select>
            </label>
            {fontError && <p className="form-error" role="alert">{fontError}</p>}
          </section>

          <section className="lbx-step" aria-labelledby="kc-2">
            <h2 id="kc-2"><span>2</span> ทำเป็นและขนาด</h2>
            <div className="seg seg-small" role="group" aria-label="ทำเป็น">
              {PURPOSES.map((pp) => (
                <button key={pp.id} type="button" aria-pressed={options.purpose === pp.id} onClick={() => {
                  setMessage(null)
                  setOptions((o) => o.purpose === pp.id ? o : cleanBubble({ ...o, purpose: pp.id, size: pp.id === 'grip' ? 40 : 50 }))
                }}>{pp.label}</button>
              ))}
            </div>
            {grip
              ? <p className="note">แผ่นกลมไม่มีหูห้อย ติดบนหน้าตัวจับมือถือแบบปกติหรือ MagSafe ที่หน้าแบน วัดหน้าตัวจับก่อนเลือกขนาด</p>
              : <div className="seg seg-small" role="group" aria-label="รูปทรง">
                {SHAPES.map((s) => (
                  <button key={s.id} type="button" aria-pressed={options.shape === s.id} onClick={() => set('shape', s.id)}>{s.label}</button>
                ))}
              </div>}
            <div className="seg seg-small" role="group" aria-label="ขนาดสำเร็จ">
              {(grip ? GRIP_SIZES : SIZES).map((s) => (
                <button key={s} type="button" aria-pressed={options.size === s} onClick={() => set('size', s)}>{s / 10} ซม.</button>
              ))}
            </div>
            <Range
              label={grip || options.shape === 'circle' ? 'เส้นผ่านศูนย์กลาง' : 'ด้านยาวสุด'}
              unit="มม." value={options.size} min={30} max={grip ? 60 : 80} step={1}
              hint={grip ? 'เท่ากับหน้าตัวจับหรือเล็กกว่าเล็กน้อย' : 'ไม่รวมหูห้อย'}
              onChange={(v) => set('size', v)}
            />
            {!grip && <div className="option-card" data-on={options.loop || undefined}>
              <label className="option-head">
                <span><span className="option-title">หูห้อยพร้อมรู</span> <small>รูขนาด 3.5 มม. ใส่ห่วงพวงกุญแจ</small></span>
                <input type="checkbox" role="switch" className="switch" checked={options.loop} onChange={(e) => set('loop', e.target.checked)} />
              </label>
            </div>}
            <details className="kc-more" open>
              <summary>ความหนาและขอบโดยละเอียด</summary>
              <Range label="ความหนาฐาน" unit="มม." value={options.base} min={1.2} max={4} step={0.2} onChange={(v) => set('base', v)} />
              <Range label={initial ? 'ความสูงตัวอักษรใหญ่' : 'ความสูงขอบบับเบิล'} unit="มม." value={options.puff} min={0.8} max={5} step={0.2} onChange={(v) => set('puff', v)} />
              <Range label="ตัวอักษรนูนจากขอบ" unit="มม." value={options.letter} min={0.4} max={3} step={0.2} onChange={(v) => set('letter', v)} />
              <Range label="ความกว้างขอบรอบตัวอักษร" unit="มม." value={options.outline} min={1.2} max={5} step={0.2} onChange={(v) => set('outline', v)} />
              <Range label="ขอบฐานรอบนอก" unit="มม." hint="พื้นฐานที่เห็นรอบขอบบับเบิล" value={options.rim} min={0.6} max={4} step={0.2} onChange={(v) => set('rim', v)} />
              <p className="note">หนารวม <strong className="tabular">{total.toFixed(1)} มม.</strong> ความหนาแต่ละชั้นควรหารด้วยความสูงชั้นพิมพ์ลงตัว (เช่น 0.2 มม.) สีจะเปลี่ยนตรงรอยต่อพอดี</p>
            </details>
          </section>

          <section className="lbx-step" aria-labelledby="kc-3">
            <h2 id="kc-3"><span>3</span> สี</h2>
            <ul className="kc-palettes" aria-label="ชุดสี">
              {PALETTES.map((p) => (
                <li key={p.id}>
                  <button type="button" aria-pressed={palette?.id === p.id} onClick={() => setColours(p.colours)} title={p.name}>
                    <span className="kc-swatch" aria-hidden="true" style={{ background: p.colours.base }}>
                      <span style={{ background: p.colours.bubble }}>
                        <span style={{ background: p.colours.letter }} />
                      </span>
                    </span>
                    <span className="kc-palette-name">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="kc-own">
              {LAYERS.filter(({ key }) => !initial || key !== 'letter').map(({ key }) => ({ key, label: layerLabel(key, options.style) })).map(({ key, label }) => (
                <label key={key}>
                  <input type="color" value={colours[key]} onChange={(e) => setColours((c) => ({ ...c, [key]: e.target.value }))} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="note">{palette ? `ชุด${palette.name}` : 'สีที่เลือกเอง'} · สีในไฟล์ ZIP จดไว้ให้ในรายการชิ้นส่วน</p>
          </section>

          <section className="lbx-step" aria-labelledby="kc-4">
            <h2 id="kc-4"><span>4</span> ส่งออกไฟล์</h2>
            <button type="button" className="btn btn-primary btn-block" disabled={busy || parts.length === 0} onClick={() => download('zip')}>
              <Icon name="download" size={16} /> ZIP แยกสี 3 ไฟล์ + วิธีพิมพ์ <span className="cost">{EXPORT_COST.zip} เครดิต</span>
            </button>
            <button type="button" className="btn btn-ghost btn-block" disabled={busy || parts.length === 0} onClick={() => download('stl')}>
              STL รวมชิ้นเดียว (พิมพ์สีเดียว) <span className="cost">{EXPORT_COST.stl} เครดิต</span>
            </button>
            <p className="note">ไฟล์แยกสีวางตรงกันอยู่แล้ว ลากทั้ง 3 ไฟล์เข้า Bambu Studio พร้อมกัน ตอบ "ใช่" ให้โหลดเป็นวัตถุเดียว แล้วกำหนดสีให้แต่ละชิ้น</p>
            {message && <p className={`form-${message.tone === 'ok' ? 'ok' : 'error'}`} role="status">{message.text}</p>}
          </section>
        </div>

        <div className="gen-view lbx-view">
          <Viewer parts={parts} colors={tints} explodeMM={explode} frameKey={`${options.purpose}-${options.style}-${options.shape}-${options.size}-${options.loop}`} className="sheet-viewer" label="ตัวอย่างพวงกุญแจ 3 มิติ" />
          <p className="gen-tag" role="status">
            {model && parts.length
              ? `${model.width.toFixed(1)} × ${model.height.toFixed(1)} มม. · ${initial ? `ตัวใหญ่ ${model.rows[0]} · ชื่อสูง` : 'ตัวอักษรสูง'} ${model.letterHeight.toFixed(1)} มม.${initial ? '' : ` · ${model.rows.length} แถว`}`
              : fontError ? 'โหลดฟอนต์ไม่สำเร็จ' : font ? 'พิมพ์ชื่อเพื่อเริ่ม' : 'กำลังโหลดฟอนต์'}
            {busy && font && ' · กำลังคำนวณ'}
          </p>
          <div className="lbx-tools">
            <label className="tool">
              <Icon name="explode" size={16} /> แยกชั้นสี
              <input type="range" min={0} max={12} step={0.5} value={explode} onChange={(e) => setExplode(Number(e.target.value))} aria-label="ระยะแยกชั้นสี" />
            </label>
          </div>
          {model?.warning && <p className="ed-warn lbx-warn" role="status">{model.warning}</p>}
        </div>
      </div>
    </div>
  )
}
