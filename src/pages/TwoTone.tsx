import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { credits, EXPORT_COST, spend, useDemo } from '../lib/account'
import { cleanText, MAX_CHARS } from '../lib/bubbleKeychain'
import { charmPath, charmViewBox, CHARM_GROUPS, CHARMS } from '../lib/charms'
import { buildZip, downloadBlob, partsList, partStats, printableStl, safeName } from '../lib/exportModel'
import { FONT_OPTIONS } from '../lib/fonts'
import { loadFont, type LoadedFont } from '../lib/hb'
import {
  buildTwoTone, cleanTwoTone, cleanTwoToneColours, DEFAULT_TWOTONE, SIZE_PRESETS, TWOTONE_MODES, TWOTONE_RANGES, TWOTONE_PALETTES, twoToneChars, twoToneReadme,
  type TwoToneColours, type TwoToneOptions, type TwoToneSize,
} from '../lib/twoTone'
import { useTitle } from '../router'
import { Viewer } from '../three/Viewer'
import { Icon } from '../ui/Icon'
import { Range } from '../ui/Range'

export const TWOTONE_KEY = 'jjdesign-twotone-v1'
const DEFAULT_FONT = 'mitr-semibold'

interface Saved {
  options: TwoToneOptions
  colours: TwoToneColours
  fontId: string
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(TWOTONE_KEY) ?? 'null') as Record<string, unknown> | null
    if (raw && typeof raw === 'object') {
      const fontId = FONT_OPTIONS.some((f) => f.id === raw.fontId) ? (raw.fontId as string) : DEFAULT_FONT
      return { options: cleanTwoTone(raw.options), colours: cleanTwoToneColours(raw.colours), fontId }
    }
  } catch {
    // Storage blocked or damaged: start fresh.
  }
  return { options: DEFAULT_TWOTONE, colours: TWOTONE_PALETTES[0].colours, fontId: DEFAULT_FONT }
}

export default function TwoTone() {
  useTitle('พวงกุญแจชื่อสองสี')
  const demo = useDemo()
  const [saved] = useState(load)
  const [options, setOptions] = useState<TwoToneOptions>(saved.options)
  const [colours, setColours] = useState<TwoToneColours>(saved.colours)
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
      setOptions((o) => (text === o.text ? o : { ...o, text }))
    }, 250)
    return () => clearTimeout(timer)
  }, [draft, composing])

  useEffect(() => {
    try {
      localStorage.setItem(TWOTONE_KEY, JSON.stringify({ options, colours, fontId }))
    } catch {
      // Not saved; the design still works for this visit.
    }
  }, [options, colours, fontId])

  const deferred = useDeferredValue(options)
  const model = useMemo(() => {
    if (!font) return null
    try {
      // Colours only tint the preview, so changing them never rebuilds.
      return buildTwoTone(font, deferred, TWOTONE_PALETTES[0].colours)
    } catch {
      return { parts: [], colours: {}, rows: [], letterHeight: 0, width: 0, height: 0, warning: 'สร้างแบบไม่สำเร็จ ลองเปลี่ยนชื่อหรือฟอนต์' }
    }
  }, [font, deferred])
  const parts = useMemo(() => model?.parts ?? [], [model])
  useEffect(() => () => { parts.forEach((part) => part.geometry.dispose()) }, [parts])
  const tints = useMemo(() => {
    const out: Record<string, string> = {}
    parts.forEach((part, i) => (out[part.code] = i === 0 ? colours.base : colours.art))
    return out
  }, [parts, colours])

  const busy = composing || cleanText(draft) !== options.text || deferred !== options || !font
  const set = <K extends keyof TwoToneOptions>(key: K, value: TwoToneOptions[K]) => {
    setMessage(null)
    setOptions((o) => ({ ...o, [key]: value }))
  }
  const palette = TWOTONE_PALETTES.find((p) => p.colours.base === colours.base && p.colours.art === colours.art)
  const initial = options.mode === 'initial'
  const sizeLabel = (s: TwoToneSize) => (initial ? `ตัวใหญ่ ${SIZE_PRESETS[s].big / 10} ซม.` : `ตัวอักษร ${SIZE_PRESETS[s].letter / 10} ซม.`)
  const preset = (Object.keys(SIZE_PRESETS) as TwoToneSize[]).find((k) =>
    (Object.keys(SIZE_PRESETS[k]) as (keyof (typeof SIZE_PRESETS)[TwoToneSize])[]).every((key) => SIZE_PRESETS[k][key] === options[key]))
  const range = (key: keyof typeof TWOTONE_RANGES) => {
    const [min, max, step] = TWOTONE_RANGES[key]
    return { min, max, step, value: options[key], onChange: (v: number) => set(key, v) }
  }
  const words = options.text.trim().split(/\s+/).filter(Boolean).length

  const baseName = safeName(options.text.trim() || 'พวงกุญแจ')
  function download(kind: 'zip' | 'stl') {
    if (busy || !model || parts.length === 0) return
    const cost = EXPORT_COST[kind]
    try {
      const data = kind === 'stl'
        ? printableStl(parts)
        : buildZip({ baseName, parts, readme: twoToneReadme(model, options, colours, partsList(partStats(parts))) })
      if (!spend(cost, `${kind.toUpperCase()} พวงกุญแจสองสี ${baseName}`)) {
        setMessage({ tone: 'error', text: `เครดิตทดลองไม่พอ ต้องใช้ ${cost} เครดิต เหลือ ${credits(demo)} เครดิต` })
        return
      }
      downloadBlob(data, `${baseName}-พวงกุญแจสองสี.${kind}`, kind === 'zip' ? 'application/zip' : 'model/stl')
      setMessage({ tone: 'ok', text: `ดาวน์โหลดแล้ว หัก ${cost} เครดิตทดลอง` })
    } catch (err) {
      setMessage({ tone: 'error', text: `ส่งออกไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  return (
    <div className="page gen lightbox keychain twotone">
      <header className="page-head">
        <h1>พวงกุญแจชื่อสองสี</h1>
        <p>
          ฐานสีเดียว ตัวอักษรและลายนูนสีขาวหรือดำ เลือกได้ 4 แบบ ชื่อต่อลายการ์ตูน ตัวอักษรใหญ่ ชื่อทั้งคำ หรือป้ายชื่อมีขอบ ไทยหรืออังกฤษ ขึ้น 2 แถวได้ หนา 6 มม. ได้ไฟล์ STL พร้อมพิมพ์สองสี
        </p>
      </header>
      <div className="gen-layout">
        <div className="gen-form">
          <section className="lbx-step" aria-labelledby="tt-1">
            <h2 id="tt-1"><span>1</span> แบบ</h2>
            <div className="ck-builds tt-modes" role="group" aria-label="แบบพวงกุญแจ">
              {TWOTONE_MODES.map((m) => (
                <button key={m.id} type="button" aria-pressed={options.mode === m.id} onClick={() => set('mode', m.id)}>
                  <strong>{m.label}</strong>
                  <small>{m.note}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="lbx-step" aria-labelledby="tt-2">
            <h2 id="tt-2"><span>2</span> ชื่อ</h2>
            <label className="field">
              <span className="field-label">
                ชื่อที่จะทำ <small className="tabular">{twoToneChars(draft)}/{MAX_CHARS}</small>
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
            <p className="note">{initial ? 'ตัวใหญ่ใช้พยัญชนะหรือตัวอักษรอังกฤษตัวแรกของชื่อ' : 'ชื่อยาวระบบย่อตัวอักษรหรือแบ่งเป็น 2 แถวที่เว้นวรรคให้พอดี'}</p>
            <label className="field">
              <span className="field-label">ฟอนต์</span>
              <select value={fontId} onChange={(e) => { setMessage(null); setFontId(e.target.value) }}>
                {FONT_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label} · {f.note}</option>)}
              </select>
            </label>
            {fontError && <p className="form-error" role="alert">{fontError}</p>}
            {options.mode === 'charm' && (
              <div className="field">
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
              </div>
            )}
          </section>

          <section className="lbx-step" aria-labelledby="tt-3">
            <h2 id="tt-3"><span>3</span> ขนาดและความหนา</h2>
            <div className="seg seg-small" role="group" aria-label="ขนาดสำเร็จ">
              {(['small', 'large'] as const).map((s) => (
                <button key={s} type="button" aria-pressed={preset === s} onClick={() => { setMessage(null); setOptions((o) => ({ ...o, ...SIZE_PRESETS[s] })) }}>
                  {s === 'small' ? 'เล็ก' : 'ใหญ่'} · {sizeLabel(s)}
                </button>
              ))}
            </div>
            {initial
              ? <Range label="ความสูงตัวอักษรใหญ่" unit="มม." {...range('big')} />
              : <Range label="ความยาวสูงสุด" unit="มม." hint="ไม่รวมหูห้อย ชื่อยาวจะย่อให้พอดี" {...range('maxLength')} />}
            <Range label={initial ? 'ความสูงชื่อสูงสุด' : 'ความสูงตัวอักษรสูงสุด'} unit="มม." hint="ชื่อยาวอาจเล็กกว่านี้เพื่อให้พอดี" {...range('letter')} />
            <div className="field">
              <span className="field-label">จำนวนแถว <small>เว้นวรรคระหว่างคำจึงแบ่งแถวได้</small></span>
              <div className="seg seg-small" role="group" aria-label="จำนวนแถว">
                {[0, 1, 2].map((n) => (
                  <button key={n} type="button" aria-pressed={options.rows === n} disabled={n === 2 && words < 2} onClick={() => set('rows', n)}>{n === 0 ? 'อัตโนมัติ' : `${n} แถว`}</button>
                ))}
              </div>
            </div>
            <Range label="ความหนาฐาน" unit="มม." {...range('base')} />
            <Range label="ตัวอักษรนูนจากฐาน" unit="มม." {...range('art')} />
            <Range label={initial ? 'ขอบฐานรอบชื่อ' : 'ขอบฐานรอบตัวอักษร'} unit="มม." {...range('margin')} />
            {options.mode === 'plate' && <Range label="ความกว้างขอบนูน" unit="มม." {...range('rim')} />}
            <p className="note">หนารวม <strong className="tabular">{(options.base + options.art).toFixed(1)} มม.</strong> ความหนาแต่ละชั้นหาร 0.2 มม. ลงตัว สีจะเปลี่ยนตรงรอยต่อพอดี</p>
            <div className="option-card" data-on={options.loop || undefined}>
              <label className="option-head">
                <span><span className="option-title">หูห้อยพร้อมรู</span> <small>รูขนาด 3.5 มม. ใส่ห่วงหรือสายคล้อง</small></span>
                <input type="checkbox" role="switch" className="switch" checked={options.loop} onChange={(e) => set('loop', e.target.checked)} />
              </label>
            </div>
          </section>

          <section className="lbx-step" aria-labelledby="tt-4">
            <h2 id="tt-4"><span>4</span> สี</h2>
            <ul className="kc-palettes" aria-label="ชุดสี">
              {TWOTONE_PALETTES.map((p) => (
                <li key={p.id}>
                  <button type="button" aria-pressed={palette?.id === p.id} onClick={() => setColours(p.colours)} title={p.name}>
                    <span className="kc-swatch" aria-hidden="true" style={{ background: p.colours.base }}>
                      <span style={{ background: p.colours.art, width: 14, height: 14 }} />
                    </span>
                    <span className="kc-palette-name">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="kc-own">
              <label>
                <input type="color" value={colours.base} onChange={(e) => setColours((c) => ({ ...c, base: e.target.value }))} />
                <span>ฐาน</span>
              </label>
              <label>
                <input type="color" value={colours.art} onChange={(e) => setColours((c) => ({ ...c, art: e.target.value }))} />
                <span>ตัวอักษรและลาย</span>
              </label>
            </div>
          </section>

          <section className="lbx-step" aria-labelledby="tt-5">
            <h2 id="tt-5"><span>5</span> ส่งออกไฟล์</h2>
            <button type="button" className="btn btn-primary btn-block" disabled={busy || parts.length === 0} onClick={() => download('zip')}>
              <Icon name="download" size={16} /> ZIP แยกสี 2 ไฟล์ + วิธีพิมพ์ <span className="cost">{EXPORT_COST.zip} เครดิต</span>
            </button>
            <button type="button" className="btn btn-ghost btn-block" disabled={busy || parts.length === 0} onClick={() => download('stl')}>
              STL รวมชิ้นเดียว (พิมพ์สีเดียว) <span className="cost">{EXPORT_COST.stl} เครดิต</span>
            </button>
            <p className="note">ไม่มีระบบหลายสีก็พิมพ์ได้ หยุดเปลี่ยนเส้นพลาสติกที่ความสูง 4.8 มม. วิธีทำอยู่ในไฟล์ ZIP</p>
            {message && <p className={`form-${message.tone === 'ok' ? 'ok' : 'error'}`} role="status">{message.text}</p>}
          </section>
        </div>

        <div className="gen-view lbx-view">
          <Viewer parts={parts} colors={tints} explodeMM={explode} frameKey={JSON.stringify([deferred, fontId])} className="sheet-viewer" label="ตัวอย่างพวงกุญแจสองสี 3 มิติ" />
          <p className="gen-tag" role="status">
            {model && parts.length
              ? `${(model.width / 10).toFixed(1)} × ${(model.height / 10).toFixed(1)} ซม. · ตัวอักษรสูง ${model.letterHeight.toFixed(1)} มม. · ${model.rows.length} แถว`
              : fontError ? 'โหลดฟอนต์ไม่สำเร็จ' : font ? (model?.warning ? 'สร้างแบบไม่ได้' : 'พิมพ์ชื่อเพื่อเริ่ม') : 'กำลังโหลดฟอนต์'}
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
