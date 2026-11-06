import { useDeferredValue, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { credits, EXPORT_COST, spend, useDemo } from '../lib/account'
import { readImage } from '../lib/artwork'
import { buildZip, downloadBlob, printableStl, safeName } from '../lib/exportModel'
import { lightboxReadme } from '../lib/lightboxReadme'
import {
  borderColour, buildLightbox, DEFAULT_LIGHTBOX, quantize, stripLength, toHex, traceColours,
  type LayerSetting, type LightboxOptions, type LightboxShape, type Quantized,
} from '../lib/lightbox'
import { useTitle } from '../router'
import { Viewer } from '../three/Viewer'
import { Icon } from '../ui/Icon'
import { Range } from '../ui/Range'

const SHAPES: { id: LightboxShape; label: string }[] = [
  { id: 'rect', label: 'สี่เหลี่ยม' },
  { id: 'circle', label: 'วงกลม' },
  { id: 'hex', label: 'หกเหลี่ยม' },
  { id: 'contour', label: 'ตามรูป' },
]

const MOUNTS = ['ไม่มี', 'รูสกรู', 'รูแขวน']
/** Pixels across the traced picture: about 0.5 mm per pixel on a 160 mm box. */
const TRACE_SIDE = 320

/** A small night scene drawn on the spot, so the page has something to show before an upload. */
function sampleImage(): ImageData | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 220
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#1d2f6f'
    ctx.fillRect(0, 0, 320, 220)
    ctx.fillStyle = '#f6c945'
    ctx.beginPath()
    ctx.arc(232, 62, 30, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2f8f5b'
    ctx.beginPath()
    ctx.moveTo(0, 220)
    ctx.lineTo(0, 150)
    ctx.quadraticCurveTo(90, 90, 170, 150)
    ctx.quadraticCurveTo(250, 200, 320, 140)
    ctx.lineTo(320, 220)
    ctx.fill()
    ctx.fillStyle = '#f3efe4'
    ctx.fillRect(70, 128, 44, 36)
    ctx.beginPath()
    ctx.moveTo(62, 130)
    ctx.lineTo(92, 104)
    ctx.lineTo(122, 130)
    ctx.fill()
    return ctx.getImageData(0, 0, 320, 220)
  } catch {
    return null
  }
}

function layersFor(q: Quantized): LayerSetting[] {
  const background = borderColour(q)
  return q.palette.map((c, j) => ({ on: j !== background, colour: toHex(c), thick: 0.6 }))
}

export default function Lightbox() {
  useTitle('กล่องไฟจากรูป')
  const demo = useDemo()
  const [image, setImage] = useState<ImageData | null>(null)
  const [imageName, setImageName] = useState<string | null>(null)
  const [count, setCount] = useState(4)
  const [options, setOptions] = useState<LightboxOptions>(DEFAULT_LIGHTBOX)
  const [night, setNight] = useState(false)
  const [explode, setExplode] = useState(0)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    setImage((current) => current ?? sampleImage())
  }, [])

  const deferredCount = useDeferredValue(count)
  const quantized = useMemo(() => (image ? quantize(image, deferredCount) : null), [image, deferredCount])
  const traced = useMemo(() => (quantized ? traceColours(quantized) : []), [quantized])
  const [layers, setLayers] = useState<LayerSetting[]>([])
  // New colours (another picture or colour count) start from the picture's own colours.
  const [layersFrom, setLayersFrom] = useState<Quantized | null>(null)
  if (quantized && layersFrom !== quantized) {
    setLayersFrom(quantized)
    setLayers(layersFor(quantized))
  }

  const deferredOptions = useDeferredValue(options)
  const deferredLayers = useDeferredValue(layers)
  const model = useMemo(() => {
    if (!quantized || deferredLayers.length !== traced.length) return null
    try {
      return buildLightbox(quantized, traced, deferredLayers, deferredOptions)
    } catch {
      return null
    }
  }, [quantized, traced, deferredLayers, deferredOptions])
  const parts = useMemo(() => model?.parts ?? [], [model])
  useEffect(() => () => { parts.forEach((part) => part.geometry.dispose()) }, [parts])

  const busy = deferredOptions !== options || deferredLayers !== layers || deferredCount !== count
  const set = <K extends keyof LightboxOptions>(key: K, value: LightboxOptions[K]) => setOptions((o) => ({ ...o, [key]: value }))
  const setRear = (key: string, value: number) => setOptions((o) => ({ ...o, rear: { ...o.rear, [key]: value } }))
  const setLayer = (j: number, change: Partial<LayerSetting>) => setLayers((all) => all.map((layer, i) => (i === j ? { ...layer, ...change } : layer)))

  async function onImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setImage(await readImage(file, TRACE_SIDE))
      setImageName(file.name)
      setMessage(null)
    } catch {
      setMessage({ tone: 'error', text: 'อ่านรูปนี้ไม่ได้ ลองไฟล์ JPG PNG หรือ WEBP' })
    }
  }

  const baseName = safeName(imageName ? imageName.replace(/\.[^.]+$/, '') : 'กล่องไฟ')
  function download(kind: 'zip' | 'stl') {
    if (busy || parts.length === 0) return
    const cost = EXPORT_COST[kind]
    try {
      const data = kind === 'stl'
        ? printableStl(parts)
        : buildZip({ baseName, parts, readme: lightboxReadme(parts) })
      if (!spend(cost, `${kind.toUpperCase()} กล่องไฟ ${baseName}`)) {
        setMessage({ tone: 'error', text: `เครดิตทดลองไม่พอ ต้องใช้ ${cost} เครดิต เหลือ ${credits(demo)} เครดิต` })
        return
      }
      downloadBlob(data, `${baseName}-กล่องไฟ.${kind}`, kind === 'zip' ? 'application/zip' : 'model/stl')
      setMessage({ tone: 'ok', text: `ดาวน์โหลดแล้ว หัก ${cost} เครดิตทดลอง` })
    } catch (err) {
      setMessage({ tone: 'error', text: `ส่งออกไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` })
    }
  }


  const strip = stripLength(parts)

  return (
    <div className="page gen lightbox">
      <header className="page-head">
        <h1>กล่องไฟจากรูป</h1>
        <p>
          อัปโหลดรูปหรือโลโก้ ระบบแยกสีเป็นชั้นบางบนแผ่นกระจายแสง แล้วสร้างกรอบ ฝาหลัง และที่ยึดให้ครบ ได้ไฟล์พิมพ์ 3D หลายสีพร้อมใช้
        </p>
      </header>
      <div className="gen-layout">
        <div className="gen-form">
          <section className="lbx-step" aria-labelledby="lbx-1">
            <h2 id="lbx-1"><span>1</span> รูปภาพ</h2>
            <label className="drop">
              <Icon name="image" size={22} />
              <strong>{imageName ?? 'เลือกรูป (ตอนนี้แสดงรูปตัวอย่าง)'}</strong>
              <span>JPG PNG WEBP หรือ SVG · ภาพสีเรียบ ขอบคม ได้ผลดีที่สุด</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onImage} className="sr-only" />
            </label>
          </section>

          <section className="lbx-step" aria-labelledby="lbx-2">
            <h2 id="lbx-2"><span>2</span> สีและชั้นพิมพ์</h2>
            <Range label="จำนวนสี" unit="สี" value={count} min={2} max={8} step={1} onChange={(v) => setCount(Math.round(v))} />
            <ul className="lbx-colours">
              {layers.map((layer, j) => (
                <li key={j} data-off={!layer.on || undefined}>
                  <input type="color" value={layer.colour} aria-label={`สีเส้นพลาสติกชั้นที่ ${j + 1}`} onChange={(e) => setLayer(j, { colour: e.target.value })} />
                  <span className="lbx-colour-name">
                    <strong>สี {j + 1}</strong>
                    <small className="tabular">
                      {quantized ? `${Math.round((quantized.counts[j] / Math.max(1, quantized.width * quantized.height)) * 100)}% ของรูป` : ''}
                    </small>
                  </span>
                  <label className="lbx-thick">
                    <input type="number" min={0.2} max={3} step={0.2} value={layer.thick} aria-label={`ความหนาชั้นสี ${j + 1} (มม.)`}
                      onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setLayer(j, { thick: Math.min(3, Math.max(0.2, v)) }) }} />
                    <span>มม.</span>
                  </label>
                  <input type="checkbox" role="switch" className="switch" checked={layer.on} aria-label={`พิมพ์สี ${j + 1}`} onChange={(e) => setLayer(j, { on: e.target.checked })} />
                </li>
              ))}
            </ul>
            <p className="note">ปิดสีไหน ตรงนั้นจะเห็นแสงขาวจากแผ่นกระจายแสง ระบบปิดสีพื้นหลังให้ก่อน สีอ่อนและชั้นบางแสงผ่านมากกว่า</p>
            <Range label="ความหนาแผ่นกระจายแสง" unit="มม." value={options.diffuser} min={0.4} max={3} step={0.2} onChange={(v) => set('diffuser', v)} />
          </section>

          <section className="lbx-step" aria-labelledby="lbx-3">
            <h2 id="lbx-3"><span>3</span> รูปทรงและขนาดกล่อง</h2>
            <div className="seg seg-small" role="group" aria-label="รูปทรงกล่อง">
              {SHAPES.map((s) => (
                <button key={s.id} type="button" aria-pressed={options.shape === s.id} onClick={() => set('shape', s.id)}>{s.label}</button>
              ))}
            </div>
            <Range label={options.shape === 'circle' || options.shape === 'hex' ? 'เส้นผ่านศูนย์กลาง' : 'ความกว้าง'} unit="มม." value={options.width} min={60} max={400} step={1} onChange={(v) => set('width', v)} />
            {options.shape === 'rect' && <Range label="มุมโค้ง" unit="มม." value={options.radius} min={0} max={60} step={1} onChange={(v) => set('radius', v)} />}
            <Range label="ขอบรอบรูป" unit="มม." value={options.margin} min={0} max={30} step={0.5} onChange={(v) => set('margin', v)} />
            <Range label="ความลึกกล่อง" unit="มม." value={options.depth} min={12} max={80} step={1} hint="ช่องว่างสำหรับไฟเส้นและสายไฟ ยิ่งลึกแสงยิ่งกระจายเรียบ" onChange={(v) => set('depth', v)} />
            <Range label="ความหนาผนัง" unit="มม." value={options.wall} min={1.2} max={6} step={0.2} onChange={(v) => set('wall', v)} />
          </section>

          <section className="lbx-step" aria-labelledby="lbx-4">
            <h2 id="lbx-4"><span>4</span> ไฟและการติดตั้ง</h2>
            <div className="option-card" data-on={options.rear.wire > 0 || undefined}>
              <label className="option-head">
                <span><span className="option-title">รูสายไฟที่ฝาหลัง</span></span>
                <input type="checkbox" role="switch" className="switch" checked={options.rear.wire > 0} onChange={(e) => setRear('wire', e.target.checked ? 1 : 0)} />
              </label>
              {options.rear.wire > 0 && <Range label="ขนาดรูสายไฟ" unit="มม." value={options.rear.wireD} min={3} max={14} step={0.5} onChange={(v) => setRear('wireD', v)} />}
            </div>
            <div className="option-card" data-on={options.rear.mount > 0 || undefined}>
              <div className="option-head"><span><span className="option-title">ยึดผนัง</span></span></div>
              <div className="seg seg-small" role="group" aria-label="ยึดผนัง">
                {MOUNTS.map((m, i) => (
                  <button key={m} type="button" aria-pressed={options.rear.mount === i} onClick={() => setRear('mount', i)}>{m}</button>
                ))}
              </div>
            </div>
            <div className="option-card" data-on={options.rear.deskBase > 0 || undefined}>
              <label className="option-head">
                <span><span className="option-title">ฐานตั้งโต๊ะ</span></span>
                <input type="checkbox" role="switch" className="switch" checked={options.rear.deskBase > 0} onChange={(e) => setRear('deskBase', e.target.checked ? 1 : 0)} />
              </label>
              {options.rear.deskBase > 0 && <Range label="ความสูงฐาน" unit="มม." value={options.rear.baseH} min={6} max={40} step={1} onChange={(v) => setRear('baseH', v)} />}
            </div>
            {strip > 0 && <p className="note">ไฟเส้น LED รอบด้านในกรอบ ยาวประมาณ <strong className="tabular">{(strip / 10).toFixed(0)} ซม.</strong></p>}
          </section>

          <section className="lbx-step" aria-labelledby="lbx-5">
            <h2 id="lbx-5"><span>5</span> ส่งออกไฟล์</h2>
            <button type="button" className="btn btn-primary btn-block" disabled={busy || parts.length === 0} onClick={() => download('zip')}>
              <Icon name="download" size={16} /> ZIP แยกไฟล์ทุกชิ้นและทุกสี <span className="cost">{EXPORT_COST.zip} เครดิต</span>
            </button>
            <button type="button" className="btn btn-ghost btn-block" disabled={busy || parts.length === 0} onClick={() => download('stl')}>
              STL รวมชิ้นเดียว <span className="cost">{EXPORT_COST.stl} เครดิต</span>
            </button>
            {message && <p className={`form-${message.tone === 'ok' ? 'ok' : 'error'}`} role="status">{message.text}</p>}
          </section>
        </div>

        <div className="gen-view lbx-view">
          <Viewer parts={parts} colors={model?.colours} explodeMM={explode} night={night} frameKey={`${options.shape}-${imageName ?? 'sample'}`} className="sheet-viewer" label="ตัวอย่างกล่องไฟ 3 มิติ" />
          <p className="gen-tag">
            {model && model.width > 0 ? `${model.width.toFixed(0)} × ${model.height.toFixed(0)} มม. · ${parts.length} ชิ้น` : 'ยังไม่มีสีที่พิมพ์'}
            {busy && ' · กำลังคำนวณ'}
          </p>
          <div className="lbx-tools">
            <button type="button" className="tool" aria-pressed={night} onClick={() => setNight(!night)}>
              <Icon name={night ? 'moon' : 'sun'} size={16} /> {night ? 'เปิดไฟ' : 'กลางวัน'}
            </button>
            <label className="tool">
              <Icon name="explode" size={16} /> แยกชิ้น
              <input type="range" min={0} max={60} value={explode} onChange={(e) => setExplode(Number(e.target.value))} aria-label="ระยะแยกชิ้น" />
            </label>
          </div>
          {parts.filter((p) => p.warning).map((p) => <p key={p.id} className="ed-warn lbx-warn" role="status">{p.warning}</p>)}
        </div>
      </div>
    </div>
  )
}
