import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { textToRegion } from '../lib/artwork'
import { buildStyle, defaultValues, findStyle, GROUPS, STYLES } from '../lib/styles'
import { useFont } from '../lib/useFont'
import { Link, navigate, useTitle } from '../router'
import { Viewer, type Callout } from '../three/Viewer'
import { Icon } from '../ui/Icon'
import { StyleThumb } from '../ui/StyleThumb'

const HERO_STYLES = ['front-lit-lip', 'two-tier-light', 'halo-back-lit', 'mini-cup', 'desk-block', 'keychain-outline']

export default function Home() {
  useTitle('')
  return (
    <>
      <HeroPlate />
      <ThumbIndex />
      {GROUPS.map((group) => (
        <CatalogueSection key={group.id} groupId={group.id} />
      ))}
      <Process />
      <Formats />
      <Close />
    </>
  )
}

function HeroPlate() {
  const { font } = useFont('kanit-bold')
  const [text, setText] = useState('ร้านของฉัน')
  const [styleId, setStyleId] = useState(HERO_STYLES[0])
  const [night, setNight] = useState(false)
  const [explode, setExplode] = useState(0)
  const deferredText = useDeferredValue(text)
  const style = findStyle(styleId)
  const svgRef = useRef<SVGSVGElement>(null)

  const parts = useMemo(() => {
    if (!font || !deferredText.trim()) return []
    try {
      return buildStyle(style, textToRegion(font, deferredText.slice(0, 40), 200, 0), defaultValues(style))
    } catch {
      return []
    }
  }, [font, deferredText, style])
  useEffect(() => () => { parts.forEach((part) => part.geometry.dispose()) }, [parts])

  const size = useMemo(() => {
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }
    for (const part of parts) {
      part.geometry.computeBoundingBox()
      const b = part.geometry.boundingBox
      if (!b) continue
      box.minX = Math.min(box.minX, b.min.x)
      box.maxX = Math.max(box.maxX, b.max.x)
      box.minY = Math.min(box.minY, b.min.y)
      box.maxY = Math.max(box.maxY, b.max.y)
      box.minZ = Math.min(box.minZ, b.min.z)
      box.maxZ = Math.max(box.maxZ, b.max.z)
    }
    return parts.length ? { w: box.maxX - box.minX, h: box.maxY - box.minY, d: box.maxZ - box.minZ } : null
  }, [parts])

  // The plate opens by pulling the parts apart once, then settles, so the first
  // thing a visitor sees is that a sign is several real parts.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setExplode(40)
      return
    }
    const start = performance.now()
    let frame = 0
    const run = (now: number) => {
      const t = Math.min(1, (now - start - 600) / 1400)
      if (t > 0) setExplode(Math.round(60 * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(run)
    }
    frame = requestAnimationFrame(run)
    return () => cancelAnimationFrame(frame)
  }, [])

  const onCallouts = (callouts: Callout[]) => {
    const svg = svgRef.current
    if (!svg) return
    const rows = svg.querySelectorAll<SVGGElement>('g[data-code]')
    const w = svg.clientWidth
    rows.forEach((row, i) => {
      const c = callouts.find((x) => x.code === row.dataset.code)
      const line = row.querySelector('line')
      if (!c || !line || !c.visible) {
        row.style.opacity = '0'
        return
      }
      row.style.opacity = '1'
      const ty = 28 + i * 30
      line.setAttribute('x1', String(c.x))
      line.setAttribute('y1', String(c.y))
      line.setAttribute('x2', String(w - 168))
      line.setAttribute('y2', String(ty))
      const dot = row.querySelector('circle')
      dot?.setAttribute('cx', String(c.x))
      dot?.setAttribute('cy', String(c.y))
      const label = row.querySelector('text')
      label?.setAttribute('x', String(w - 160))
      label?.setAttribute('y', String(ty + 5))
    })
  }

  const go = (e: FormEvent) => {
    e.preventDefault()
    navigate(`/app?style=${encodeURIComponent(styleId)}&text=${encodeURIComponent(text.trim() || 'ร้านของฉัน')}`)
  }

  return (
    <section className="cover" aria-labelledby="cover-title">
      <div className="cover-copy">
        <h1 id="cover-title">
          พิมพ์ชื่อร้าน
          <br />
          ได้ป้าย 3 มิติ
          <br />
          พร้อมแยกชิ้นผลิต
        </h1>
        <p className="cover-lede">
          แคตตาล็อกป้ายตัวอักษร {STYLES.length} แบบ ตั้งแต่ป้ายไฟหน้าร้านถึงพวงกุญแจ ทุกแบบคำนวณผนัง บ่า และฝาให้จากตัวอักษรจริง
          แล้วส่งออก STL กับ DXF หน่วยมิลลิเมตร
        </p>
        <form className="cover-form" onSubmit={go}>
          <label className="cover-field">
            <span>ชื่อร้านหรือข้อความ</span>
            <input value={text} maxLength={40} onChange={(e) => setText(e.target.value)} placeholder="พิมพ์ชื่อร้านของคุณ" />
          </label>
          <fieldset className="cover-styles">
            <legend>แบบป้าย</legend>
            {HERO_STYLES.map((id) => {
              const s = findStyle(id)
              return (
                <label key={id} className="cover-style">
                  <input type="radio" name="hero-style" value={id} checked={styleId === id} onChange={() => setStyleId(id)} />
                  <span className="tabular">{s.code}</span> {s.name}
                </label>
              )
            })}
          </fieldset>
          <button type="submit" className="btn btn-signal btn-lg">
            ออกแบบต่อในโปรแกรม <Icon name="arrow" />
          </button>
        </form>
      </div>

      <figure className="plate">
        <div className="plate-stage">
          <Viewer parts={parts} explodeMM={explode} night={night} onCallouts={onCallouts} frameKey={`${styleId}|${Math.round((size?.w ?? 0) / 80)}`} className="plate-viewer" label={`ตัวอย่างป้าย ${text} แบบ ${style.name}`} />
          <svg ref={svgRef} className="plate-callouts" aria-hidden="true">
            {parts.map((part) => (
              <g key={part.id} data-code={part.code}>
                <line />
                <circle r="3" />
                <text>
                  {part.code} {part.label}
                </text>
              </g>
            ))}
          </svg>
          <div className="plate-controls">
            <button type="button" className="tool" aria-pressed={night} onClick={() => setNight(!night)}>
              <Icon name={night ? 'moon' : 'sun'} /> <span>{night ? 'เปิดไฟ' : 'ปิดไฟ'}</span>
            </button>
            <label className="tool tool-range">
              <Icon name="explode" />
              <span>แยกชิ้น</span>
              <input type="range" min={0} max={120} value={explode} onChange={(e) => setExplode(Number(e.target.value))} aria-label="ระยะแยกชิ้น" />
            </label>
          </div>
        </div>
        <figcaption className="plate-spec">
          <dl>
            <div>
              <dt>รุ่น</dt>
              <dd className="tabular">{style.code}</dd>
            </div>
            <div>
              <dt>กว้าง</dt>
              <dd className="tabular">{size ? size.w.toLocaleString('th-TH', { maximumFractionDigits: 1 }) : '—'} มม.</dd>
            </div>
            <div>
              <dt>สูง</dt>
              <dd className="tabular">{size ? size.h.toLocaleString('th-TH', { maximumFractionDigits: 1 }) : '—'} มม.</dd>
            </div>
            <div>
              <dt>ลึก</dt>
              <dd className="tabular">{size ? size.d.toLocaleString('th-TH', { maximumFractionDigits: 1 }) : '—'} มม.</dd>
            </div>
            <div>
              <dt>ชิ้นส่วน</dt>
              <dd className="tabular">{parts.length}</dd>
            </div>
          </dl>
          <p>ลากเพื่อหมุนโมเดล · ตัวเลขคำนวณจากข้อความที่พิมพ์ด้วยฟอนต์ Kanit สูง 200 มม.</p>
        </figcaption>
      </figure>
    </section>
  )
}

function ThumbIndex() {
  return (
    <nav className="thumb-index" aria-label="หมวดในแคตตาล็อก">
      {GROUPS.map((g) => (
        <a key={g.id} href={`#group-${g.id}`}>
          <span className="thumb-index-letter">{g.letter}</span>
          <span className="thumb-index-name">{g.name}</span>
        </a>
      ))}
    </nav>
  )
}

function CatalogueSection({ groupId }: { groupId: string }) {
  const group = GROUPS.find((g) => g.id === groupId)!
  const styles = STYLES.filter((s) => s.group === groupId)
  return (
    <section className="spread" id={`group-${group.id}`} aria-labelledby={`h-${group.id}`}>
      <header className="spread-head">
        <span className="spread-letter" aria-hidden="true">{group.letter}</span>
        <div>
          <h2 id={`h-${group.id}`}>{group.name}</h2>
          <p>
            {group.note} · {styles.length} แบบ
          </p>
        </div>
      </header>
      <ul className="entries">
        {styles.map((s) => (
          <li key={s.id}>
            <Link href={`/styles/${s.id}`} className="entry">
              <StyleThumb style={s} />
              <span className="entry-code tabular">{s.code}</span>
              <span className="entry-name">{s.name}</span>
              <span className="entry-make">{s.make === 'print' ? 'พิมพ์ 3D' : s.make === 'cut' ? 'ตัดแผ่น' : 'พิมพ์ + ตัดแผ่น'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Process() {
  const rows = [
    ['ใส่แบบ', 'พิมพ์ข้อความหลายบรรทัด เลือกฟอนต์ไทยหรือใช้ฟอนต์ของร้านเอง หรือนำเข้า SVG และรูปโลโก้ขาวดำ'],
    ['เลือกแบบป้าย', `${STYLES.length} แบบใน 7 หมวด แต่ละแบบรู้ว่าต้องมีผนัง บ่า ฝาหน้า แผ่นหลัง หรือแถบไฟตรงไหน`],
    ['ปรับขนาดชิ้นส่วน', 'ความลึก ความหนาผนัง ระยะเผื่อสวม เปลี่ยนแล้วเห็นโมเดลทันที แยกชิ้นดู และเปิดไฟดูตอนกลางคืนได้'],
    ['ส่งออกไฟล์', 'STL ทีละชิ้นหรือรวม DXF สำหรับเลเซอร์และ CNC พร้อมรายการชิ้นส่วนและน้ำหนักวัสดุโดยประมาณ'],
  ]
  return (
    <section className="process" aria-labelledby="process-title">
      <h2 id="process-title">จากข้อความถึงไฟล์ผลิต ในหน้าเดียว</h2>
      <ol>
        {rows.map(([title, body], i) => (
          <li key={title}>
            <span className="process-n tabular">{i + 1}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Formats() {
  return (
    <section className="formats" aria-labelledby="formats-title">
      <h2 id="formats-title">ไฟล์ที่ได้</h2>
      <table className="spec spec-wide">
        <thead>
          <tr>
            <th>ไฟล์</th>
            <th>ใช้กับ</th>
            <th>รายละเอียด</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>STL</td><td>เครื่องพิมพ์ 3D ทุกยี่ห้อ</td><td>หน่วยมิลลิเมตร แยกไฟล์ทีละชิ้นหรือรวมทั้งชุด</td></tr>
          <tr><td>DXF</td><td>เลเซอร์ CNC เครื่องตัดอะคริลิกและพลาสวูด</td><td>เส้นปิดหนึ่งเลเยอร์ต่อชิ้นส่วน เปิดได้ใน LightBurn, AutoCAD, Illustrator</td></tr>
          <tr><td>ZIP</td><td>ส่งต่อให้โรงงาน</td><td>STL และ DXF ทุกชิ้น พร้อมรายการชิ้นส่วน ขนาด และน้ำหนักโดยประมาณ</td></tr>
          <tr><td>.jjd</td><td>เปิดกลับมาแก้</td><td>ไฟล์งานเก็บข้อความ ฟอนต์ แบบ และค่าที่ปรับไว้ทั้งหมด</td></tr>
        </tbody>
      </table>
    </section>
  )
}

function Close() {
  const [text, setText] = useState('')
  return (
    <section className="closing" aria-labelledby="close-title">
      <h2 id="close-title">ลองกับชื่อร้านของคุณ ไม่ต้องสมัคร</h2>
      <form
        className="closing-form"
        onSubmit={(e) => {
          e.preventDefault()
          navigate(`/app?text=${encodeURIComponent(text.trim() || 'ร้านของฉัน')}`)
        }}
      >
        <label className="sr-only" htmlFor="close-text">ชื่อร้าน</label>
        <input id="close-text" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} placeholder="พิมพ์ชื่อร้าน" />
        <button type="submit" className="btn btn-signal btn-lg">เริ่มออกแบบ <Icon name="arrow" /></button>
      </form>
      <p>ออกแบบและหมุนดูได้ฟรีไม่จำกัด ใช้เครดิตเฉพาะตอนดาวน์โหลดไฟล์ผลิต</p>
    </section>
  )
}
