import { useDeferredValue, useEffect, useMemo, useState, type JSX } from 'react'
import { credits, EXPORT_COST, spend, useDemo } from '../lib/account'
import { buildZip, downloadBlob, partsList, partStats, printableStl, safeName } from '../lib/exportModel'
import { GIFT_FONTS } from '../lib/fonts'
import {
  cleanText, cleanValues, DEFAULT_GIFT_FONT, defaults, findGift, fontKey, neededFonts, GIFT_GROUPS, GIFTS, graphemeCount, parseGiftStorage, toModel, topView,
  type GiftDesign, type GiftGroup, type GiftModel, type GiftParam, type GiftValues, type SavedGift,
} from '../lib/gifts'
import { loadFont, type LoadedFont } from '../lib/hb'
import { Link, useTitle } from '../router'
import { Viewer } from '../three/Viewer'
import { Icon } from '../ui/Icon'
import { Range } from '../ui/Range'

// v2: the designs were rebuilt with new settings; older saves do not fit them.
export const GIFTS_KEY = 'jjdesign-gifts-v2'

function readSaved(): Record<string, SavedGift> {
  try {
    return parseGiftStorage(localStorage.getItem(GIFTS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeSaved(id: string, entry: SavedGift) {
  try {
    localStorage.setItem(GIFTS_KEY, JSON.stringify({ ...readSaved(), [id]: entry }))
  } catch {
    // Not saved; the design still works for this visit.
  }
}

const HEX = /^#[0-9a-f]{6}$/i

/** Full pages that belong in the catalogue too (the keychain makers). */
const PAGES: { href: string; name: string; blurb: string; group: GiftGroup; art: JSX.Element }[] = [
  {
    href: '/keychain', name: 'พวงกุญแจชื่อบับเบิล', group: 'keychain',
    blurb: 'ชื่ออ้วนกลม 3 สี ทำแผ่นติด Griptok ตัวอักษรใหญ่ หรือชื่อกับลายการ์ตูน',
    art: (
      <svg viewBox="0 0 120 90">
        <circle cx="60" cy="47" r="38" fill="#2bb3c0" />
        <circle cx="60" cy="8" r="7" fill="#2bb3c0" /><circle cx="60" cy="8" r="3" fill="#f3f5fa" />
        <text x="60" y="56" textAnchor="middle" fontSize="27" fontWeight="800" fill="#fff" stroke="#1d4e6e" strokeWidth="4" paintOrder="stroke">Ploy</text>
      </svg>
    ),
  },
  {
    href: '/clicker', name: 'พวงกุญแจปุ่มคีย์บอร์ด', group: 'keychain',
    blurb: 'ตัวอักษรละปุ่ม แบบตกแต่งหรือกดได้จริงด้วยสวิตช์ มีแบบดินสอ',
    art: (
      <svg viewBox="0 0 120 90">
        {['#e5484d', '#f5a524', '#46a758'].map((c, i) => (
          <g key={c} transform={`translate(${14 + i * 32} 28)`}>
            <rect width="30" height="30" rx="6" fill={c} />
            <rect x="5" y="5" width="20" height="20" rx="4" fill="#f7f7f5" />
            <text x="15" y="21" textAnchor="middle" fontSize="14" fontWeight="800" fill="#1f1f1f">{'JJD'[i]}</text>
          </g>
        ))}
      </svg>
    ),
  },
  {
    href: '/twotone', name: 'พวงกุญแจชื่อสองสี', group: 'keychain',
    blurb: 'ฐานสีเดียว ตัวอักษรนูนขาวหรือดำ 4 แบบ ปรับขนาดและความหนาละเอียด',
    art: (
      <svg viewBox="0 0 120 90">
        <rect x="12" y="28" width="96" height="36" rx="18" fill="#f48fb1" />
        <text x="60" y="54" textAnchor="middle" fontSize="24" fontWeight="800" fill="#fff">Mali</text>
      </svg>
    ),
  },
]
const defaultColours = (d: GiftDesign) => Object.fromEntries(d.colours.map((c) => [c.key, c.default]))

/** Loads several fonts; `fonts` is set once every one of them is ready. */
function useFonts(ids: string[]) {
  const key = [...new Set(ids)].sort().join('|')
  const [loaded, setLoaded] = useState<{ key: string; fonts: Record<string, LoadedFont> } | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    setError(false)
    const list = key.split('|').filter(Boolean)
    Promise.all(list.map((id) => loadFont((GIFT_FONTS.find((f) => f.id === id) ?? GIFT_FONTS[0]).url).then((font) => [id, font] as const)))
      .then((pairs) => { if (!cancelled) setLoaded({ key, fonts: Object.fromEntries(pairs) }) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [key])
  return { fonts: loaded?.key === key ? loaded.fonts : null, error }
}

/** The build context from loaded fonts. */
const contextOf = (fonts: Record<string, LoadedFont>) => ({ font: fonts[DEFAULT_GIFT_FONT] ?? Object.values(fonts)[0], fonts })

/** Fonts the catalogue thumbnails need: every design's default fonts. */
const THUMB_FONTS = [...new Set(GIFTS.flatMap((d) => neededFonts(d, defaults(d))))]

/** The whole catalogue, or one design when the path names it. */
export default function Gifts({ id }: { id?: string }) {
  const design = id ? findGift(id) : undefined
  if (id && !design) return <GiftCatalogue missing />
  return design ? <GiftEditor key={design.id} design={design} /> : <GiftCatalogue />
}

// ——— catalogue ———

function GiftCatalogue({ missing = false }: { missing?: boolean }) {
  useTitle('ของขวัญใส่ชื่อ')
  const [group, setGroup] = useState<GiftGroup | 'all'>('all')
  const { fonts: thumbFonts } = useFonts(THUMB_FONTS)
  const groups = GIFT_GROUPS.filter((g) => GIFTS.some((d) => d.group === g.id) || PAGES.some((pg) => pg.group === g.id))
  const shown = GIFTS.filter((d) => group === 'all' || d.group === group)
  const pages = PAGES.filter((pg) => group === 'all' || pg.group === group)
  const count = (g: GiftGroup) => GIFTS.filter((d) => d.group === g).length + PAGES.filter((pg) => pg.group === g).length
  // Built one design at a time, yielding to the page between them.
  const [thumbs, setThumbs] = useState<Record<string, ReturnType<typeof topView>>>({})
  useEffect(() => {
    if (!thumbFonts) return
    const ctx = contextOf(thumbFonts)
    let cancelled = false
    const queue = GIFTS.filter((d) => !thumbs[d.id])
    const next = () => {
      const d = queue.shift()
      if (!d || cancelled) return
      try {
        const result = d.build(ctx, defaults(d))
        const view = topView(result.layers, defaultColours(d), d.upright)
        if (!cancelled) setThumbs((t) => ({ ...t, [d.id]: view }))
      } catch {
        // A thumbnail that fails stays blank; the design page shows the error.
      }
      timer = window.setTimeout(next, 16)
    }
    let timer: number | undefined = window.setTimeout(next, 16)
    return () => { cancelled = true; clearTimeout(timer) }
    // Thumbnails depend on the fonts only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbFonts])

  return (
    <div className="page gifts">
      <header className="page-head">
        <h1>ของขวัญใส่ชื่อ</h1>
        <p>แบบพิมพ์ 3D ใส่ชื่อได้ทุกชิ้น ป้ายอักษร ป้ายชื่อ พวงกุญแจ และอีกมาก ปรับชื่อ ขนาด ความหนา และสีได้เอง ได้ไฟล์ STL แยกสีพร้อมพิมพ์</p>
      </header>
      {missing && <p className="form-error" role="alert">ไม่พบแบบนี้ เลือกแบบอื่นจากรายการด้านล่าง</p>}
      <nav className="gift-tabs" aria-label="หมวดหมู่">
        <button type="button" aria-pressed={group === 'all'} onClick={() => setGroup('all')}>ทั้งหมด <small>{GIFTS.length + PAGES.length}</small></button>
        {groups.map((g) => (
          <button key={g.id} type="button" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
            {g.name} <small>{count(g.id)}</small>
          </button>
        ))}
      </nav>
      <ul className="gift-grid">
        {pages.map((pg) => (
          <li key={pg.href}>
            <Link href={pg.href} className="gift-card">
              <span className="gift-thumb" aria-hidden="true">{pg.art}</span>
              <span className="gift-card-name">{pg.name}</span>
              <span className="gift-card-blurb">{pg.blurb}</span>
            </Link>
          </li>
        ))}
        {shown.map((d) => {
          const view = thumbs[d.id]
          return (
            <li key={d.id}>
              <Link href={`/gifts/${d.id}`} className="gift-card">
                <span className="gift-thumb" aria-hidden="true">
                  {view
                    ? <svg viewBox={view.viewBox}>{view.paths.map((p, i) => <path key={i} d={p.d} fill={p.fill} fillRule="evenodd" />)}</svg>
                    : <span className="gift-thumb-wait" />}
                </span>
                <span className="gift-card-name">{d.name}</span>
                <span className="gift-card-blurb">{d.blurb}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ——— one design ———

function ParamField({ p, value, onChange, onText }: { p: GiftParam; value: string | number | boolean; onChange: (v: string | number | boolean) => void; onText: (v: string) => void }) {
  if (p.kind === 'number') {
    return <Range label={p.label} unit={p.unit ?? ''} hint={p.hint} value={value as number} min={p.min ?? 0} max={p.max ?? 100} step={p.step ?? 1} onChange={onChange} />
  }
  if (p.kind === 'toggle') {
    return (
      <div className="option-card" data-on={value || undefined}>
        <label className="option-head">
          <span><span className="option-title">{p.label}</span>{p.hint && <> <small>{p.hint}</small></>}</span>
          <input type="checkbox" role="switch" className="switch" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        </label>
      </div>
    )
  }
  if (p.kind === 'choice') {
    return (
      <div className="field">
        <span className="field-label">{p.label}</span>
        <div className="seg seg-small gift-choice" role="group" aria-label={p.label}>
          {p.options?.map((op) => (
            <button key={op.id} type="button" aria-pressed={value === op.id} onClick={() => onChange(op.id)}>{op.label}</button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <label className="field">
      <span className="field-label">{p.label} <small className="tabular">{graphemeCount(String(value))}/{p.maxChars ?? 24}</small></span>
      <input type="text" value={String(value)} onChange={(e) => onText(e.target.value)} placeholder={p.hint} />
      {p.hint && <small className="note">{p.hint}</small>}
    </label>
  )
}

function GiftEditor({ design }: { design: GiftDesign }) {
  useTitle(design.name)
  const demo = useDemo()
  const [saved] = useState(() => readSaved()[design.id] ?? {})
  const [values, setValues] = useState<GiftValues>(() => cleanValues(design, saved.values))
  // Text is typed into a draft and applied after a pause (and after IME composition).
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(design.params.filter((p) => p.kind === 'text').map((p) => [p.key, String(values[p.key])])))
  const [composing, setComposing] = useState(false)
  const [colours, setColours] = useState<Record<string, string>>(() => {
    const out = defaultColours(design)
    for (const [k, c] of Object.entries(saved.colours ?? {})) if (k in out && typeof c === 'string' && HEX.test(c)) out[k] = c.toLowerCase()
    return out
  })
  // Each text keeps its own font in the values (key@font); older saves had one font for all.
  const { fonts, error: fontError } = useFonts(neededFonts(design, values))
  const font = fonts ? contextOf(fonts).font : null
  const [explode, setExplode] = useState(0)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (composing) return
    const timer = setTimeout(() => {
      setValues((v) => {
        const next = { ...v }
        let changed = false
        for (const p of design.params) {
          if (p.kind !== 'text') continue
          const text = cleanText(drafts[p.key] ?? '', p.maxChars)
          if (text !== v[p.key]) { next[p.key] = text; changed = true }
        }
        return changed ? next : v
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [drafts, design, composing])

  useEffect(() => writeSaved(design.id, { values, colours }), [design.id, values, colours])

  const deferred = useDeferredValue(values)
  const model = useMemo<GiftModel | null>(() => {
    if (!fonts) return null
    try {
      return toModel(design, design.build(contextOf(fonts), deferred), defaultColours(design))
    } catch {
      return { parts: [], tints: {}, width: 0, height: 0, thickness: 0, layers: [], warning: 'สร้างแบบไม่สำเร็จ ลองเปลี่ยนข้อความหรือขนาด' }
    }
  }, [design, fonts, deferred])
  const parts = useMemo(() => model?.parts ?? [], [model])
  useEffect(() => () => { parts.forEach((p) => p.geometry.dispose()) }, [parts])
  // Upright designs are modelled standing (z up) for printing; turn a copy to face the viewer.
  const viewParts = useMemo(() => (design.upright ? parts.map((p) => ({ ...p, geometry: p.geometry.clone().rotateX(-Math.PI / 2) })) : parts), [design.upright, parts])
  useEffect(() => () => { if (viewParts !== parts) viewParts.forEach((p) => p.geometry.dispose()) }, [viewParts, parts])
  // Colours tint the preview only, so changing them never rebuilds.
  const used = design.colours.filter((c) => model?.layers.some((l) => l.colour === c.key))
  const tints = useMemo(() => Object.fromEntries(parts.map((p, i) => [p.code, colours[used[i]?.key] ?? '#cccccc'])), [parts, colours, used])

  const busy = composing || deferred !== values || !font || design.params.some((p) => p.kind === 'text' && cleanText(drafts[p.key] ?? '', p.maxChars) !== values[p.key])
  const set = (key: string, v: string | number | boolean) => { setMessage(null); setValues((o) => cleanValues(design, { ...o, [key]: v })) }
  const shown = design.params.filter((p) => !p.when || p.when.is.includes(values[p.when.key]))
  const textParams = shown.filter((p) => p.kind === 'text')
  const shapeParams = shown.filter((p) => p.kind !== 'text' && !['base', 'raise'].includes(p.key))
  const thickParams = shown.filter((p) => ['base', 'raise'].includes(p.key))

  const firstText = String(values[design.params.find((p) => p.kind === 'text')?.key ?? ''] ?? '')
  const baseName = safeName(`${design.name}-${firstText}`.trim())
  function download(kind: 'zip' | 'stl') {
    if (busy || !model || parts.length === 0) return
    const cost = EXPORT_COST[kind]
    try {
      const list = used.map((c, i) => `  ${parts[i]?.code ?? '?'} ${c.label.padEnd(16)} ${colours[c.key]}`)
      const readme = [
        `JJDesign — ${design.name}`,
        ...design.params.filter((p) => p.kind === 'text').map((p) => `${p.label}: ${values[p.key]}`),
        design.upright
          ? `ขนาด กว้าง ${model.width.toFixed(1)} × ลึก ${model.height.toFixed(1)} × สูง ${model.thickness.toFixed(1)} มม. (พิมพ์ตั้งตรงตามไฟล์)`
          : `ขนาด ${model.width.toFixed(1)} × ${model.height.toFixed(1)} มม. · หนารวม ${model.thickness.toFixed(1)} มม.`,
        model.warning ?? '',
        '',
        partsList(partStats(parts)),
        '',
        'สีที่เลือก',
        ...list,
        '',
        'พิมพ์หลายสีใน Bambu Studio (หรือ OrcaSlicer)',
        '1. ลากไฟล์ STL ทุกไฟล์ในโฟลเดอร์ พลาสติกพิมพ์ เข้าโปรแกรมพร้อมกัน ตอบ "ใช่" ให้โหลดเป็นวัตถุเดียว',
        '2. กำหนดเส้นพลาสติกให้แต่ละชิ้นตามสีด้านบน',
        '3. ชั้น 0.2 มม. ผนัง 2–3 เส้น เติม 15–20% ตรวจทิศทางและซัพพอร์ตตามคำแนะนำของแต่ละแบบ',
        ...(design.howTo ?? []),
        'ถ้าพิมพ์สีเดียว ใช้ไฟล์ -ทั้งหมด.stl ไฟล์เดียว',
        '',
        'ไฟล์ทุกไฟล์หน่วยมิลลิเมตร แกน Z ชี้ขึ้น',
        '',
      ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n')
      const data = kind === 'stl' ? printableStl(parts) : buildZip({ baseName, parts, readme })
      if (!spend(cost, `${kind.toUpperCase()} ${design.name}`)) {
        setMessage({ tone: 'error', text: `เครดิตทดลองไม่พอ ต้องใช้ ${cost} เครดิต เหลือ ${credits(demo)} เครดิต` })
        return
      }
      downloadBlob(data, `${baseName}.${kind}`, kind === 'zip' ? 'application/zip' : 'model/stl')
      setMessage({ tone: 'ok', text: `ดาวน์โหลดแล้ว หัก ${cost} เครดิตทดลอง` })
    } catch (err) {
      setMessage({ tone: 'error', text: `ส่งออกไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  const group = GIFT_GROUPS.find((g) => g.id === design.group)
  return (
    <div className="page gen lightbox keychain gifts">
      <header className="page-head">
        <p className="gift-crumb"><Link href="/gifts">ของขวัญใส่ชื่อ</Link> · {group?.name}</p>
        <h1>{design.name}</h1>
        <p>{design.blurb}</p>
      </header>
      <div className="gen-layout">
        <div className="gen-form">
          <section className="lbx-step" aria-labelledby="gf-1">
            <h2 id="gf-1"><span>1</span> ข้อความ</h2>
            {textParams.map((p) => (
              <label key={p.key} className="field">
                <span className="field-label">{p.label} <small className="tabular">{graphemeCount(drafts[p.key] ?? '')}/{p.maxChars ?? 24}</small></span>
                <input
                  type="text"
                  value={drafts[p.key] ?? ''}
                  placeholder={p.hint}
                  onCompositionStart={() => setComposing(true)}
                  onCompositionEnd={(e) => { setComposing(false); const val = e.currentTarget.value; setDrafts((d) => ({ ...d, [p.key]: cleanText(val, p.maxChars) })) }}
                  onChange={(e) => { setMessage(null); const val = e.target.value; const isComposing = composing || (e.nativeEvent as InputEvent).isComposing; setDrafts((d) => ({ ...d, [p.key]: isComposing ? val : cleanText(val, p.maxChars) })) }}
                />
                {p.hint && <small className="note">{p.hint}</small>}
                {/* A link only becomes a QR code: its font is never drawn. */}
                {p.key !== 'link' && <select
                  className="gift-font"
                  aria-label={`ฟอนต์ของ${p.label}`}
                  value={String(values[fontKey(p.key)] ?? DEFAULT_GIFT_FONT)}
                  onChange={(e) => set(fontKey(p.key), e.target.value)}
                >
                  {GIFT_FONTS.map((f) => <option key={f.id} value={f.id}>ฟอนต์ {f.label} · {f.note}</option>)}
                </select>}
              </label>
            ))}
            <p className="note">ฟอนต์อังกฤษตัวอ้วนใช้กับภาษาอังกฤษและตัวเลขเท่านั้น ชื่อภาษาไทยเลือก Kanit Prompt Mitr หรือ Itim</p>
            {fontError && <p className="form-error" role="alert">โหลดฟอนต์ไม่สำเร็จ ลองเปลี่ยนฟอนต์หรือรีเฟรชหน้าอีกครั้ง</p>}
          </section>

          <section className="lbx-step" aria-labelledby="gf-2">
            <h2 id="gf-2"><span>2</span> รูปทรงและขนาด</h2>
            {shapeParams.map((p) => <ParamField key={p.key} p={p} value={values[p.key]} onChange={(v) => set(p.key, v)} onText={() => {}} />)}
            <details className="kc-more" open>
              <summary>ความหนา</summary>
              {thickParams.map((p) => <ParamField key={p.key} p={p} value={values[p.key]} onChange={(v) => set(p.key, v)} onText={() => {}} />)}
              {model && !design.upright && model.thickness > 0 && <p className="note">หนารวม <strong className="tabular">{model.thickness.toFixed(1)} มม.</strong> ความหนาแต่ละชั้นหาร 0.2 มม. ลงตัว สีจะเปลี่ยนตรงรอยต่อพอดี</p>}
            </details>
            <button type="button" className="btn btn-ghost" onClick={() => {
              const d = defaults(design)
              setValues(d)
              setColours(defaultColours(design))
              setDrafts(Object.fromEntries(design.params.filter((p) => p.kind === 'text').map((p) => [p.key, String(d[p.key])])))
            }}>
              <Icon name="reset" size={16} /> ค่าเริ่มต้นของแบบนี้
            </button>
          </section>

          <section className="lbx-step" aria-labelledby="gf-3">
            <h2 id="gf-3"><span>3</span> สี</h2>
            <div className="kc-own gift-colours">
              {(model ? used : design.colours).map((c) => (
                <label key={c.key}>
                  <input type="color" value={colours[c.key]} onChange={(e) => { const val = e.target.value; setColours((o) => ({ ...o, [c.key]: val })) }} />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
            <p className="note">แต่ละสีเป็นไฟล์ STL ของตัวเอง วางตรงกันพร้อมพิมพ์หลายสี</p>
          </section>

          <section className="lbx-step" aria-labelledby="gf-4">
            <h2 id="gf-4"><span>4</span> ส่งออกไฟล์</h2>
            <button type="button" className="btn btn-primary btn-block" disabled={busy || parts.length === 0} onClick={() => download('zip')}>
              <Icon name="download" size={16} /> ZIP แยกสี {parts.length || ''} ไฟล์ + วิธีพิมพ์ <span className="cost">{EXPORT_COST.zip} เครดิต</span>
            </button>
            <button type="button" className="btn btn-ghost btn-block" disabled={busy || parts.length === 0} onClick={() => download('stl')}>
              STL รวมชิ้นเดียว (พิมพ์สีเดียว) <span className="cost">{EXPORT_COST.stl} เครดิต</span>
            </button>
            {message && <p className={`form-${message.tone === 'ok' ? 'ok' : 'error'}`} role="status">{message.text}</p>}
          </section>
        </div>

        <div className="gen-view lbx-view">
          <Viewer parts={viewParts} colors={tints} explodeMM={explode} frameKey={`${design.id}|${Math.round(Math.log2(Math.max(model?.width ?? 1, model?.height ?? 1, 1)) * 2)}`} className="sheet-viewer" label={`ตัวอย่าง ${design.name} 3 มิติ`} />
          <p className="gen-tag" role="status">
            {model && parts.length
              ? design.upright
                ? `กว้าง ${(model.width / 10).toFixed(1)} × ลึก ${(model.height / 10).toFixed(1)} × สูง ${(model.thickness / 10).toFixed(1)} ซม. · ${parts.length} สี`
                : `${(model.width / 10).toFixed(1)} × ${(model.height / 10).toFixed(1)} ซม. · หนา ${model.thickness.toFixed(1)} มม. · ${parts.length} สี`
              : fontError ? 'โหลดฟอนต์ไม่สำเร็จ' : font ? (model?.warning ? 'สร้างแบบไม่ได้' : 'พิมพ์ข้อความเพื่อเริ่ม') : 'กำลังโหลดฟอนต์'}
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
