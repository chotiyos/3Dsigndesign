import { useEffect, useMemo, useState } from 'react'
import { textToRegion } from '../lib/artwork'
import { buildStyle, defaultValues, GROUPS, STYLES, type StyleGroup } from '../lib/styles'
import { useFont } from '../lib/useFont'
import { MATERIAL_NAMES } from '../three/materials'
import { Viewer } from '../three/Viewer'
import { Link, useTitle } from '../router'
import { Icon } from '../ui/Icon'
import { StyleThumb } from '../ui/StyleThumb'

const MAKE_LABEL = { print: 'พิมพ์ 3D', cut: 'ตัดแผ่น', mixed: 'พิมพ์ + ตัดแผ่น' } as const

export function StylesIndex() {
  useTitle('แคตตาล็อกแบบป้าย')
  const [group, setGroup] = useState<StyleGroup | 'all'>('all')
  const [q, setQ] = useState('')
  const list = STYLES.filter(
    (s) => (group === 'all' || s.group === group) && (!q.trim() || `${s.code} ${s.name} ${s.blurb}`.toLowerCase().includes(q.trim().toLowerCase())),
  )
  return (
    <div className="page">
      <header className="page-head">
        <h1>แคตตาล็อกแบบป้าย</h1>
        <p>{STYLES.length} แบบใน {GROUPS.length} หมวด เลือกแบบแล้วกดออกแบบ ระบบจะเปิดตัวออกแบบพร้อมแบบนั้นให้ทันที</p>
      </header>
      <div className="filters">
        <label className="search">
          <Icon name="search" size={16} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา เช่น ไฟสองชั้น, กล่องไฟ, เฟือง" aria-label="ค้นหาแบบป้าย" />
        </label>
        <div className="chips" role="radiogroup" aria-label="หมวด">
          <button type="button" role="radio" aria-checked={group === 'all'} onClick={() => setGroup('all')}>ทั้งหมด</button>
          {GROUPS.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={group === g.id} onClick={() => setGroup(g.id)}>
              {g.letter} {g.name}
            </button>
          ))}
        </div>
      </div>
      <table className="spec spec-wide catalogue-table">
        <thead>
          <tr>
            <th className="col-thumb"><span className="sr-only">ภาพ</span></th>
            <th>รุ่น</th>
            <th>ชื่อแบบ</th>
            <th className="col-blurb">รายละเอียด</th>
            <th>วิธีผลิต</th>
            <th className="num">ปรับได้</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.id}>
              <td className="col-thumb"><Link href={`/styles/${s.id}`} tabIndex={-1} aria-hidden="true"><StyleThumb style={s} /></Link></td>
              <td className="tabular">{s.code}</td>
              <td><Link href={`/styles/${s.id}`}>{s.name}</Link></td>
              <td className="col-blurb">{s.blurb}</td>
              <td>{MAKE_LABEL[s.make]}</td>
              <td className="num tabular">{s.params.length} ค่า</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length === 0 && <p className="empty">ไม่พบแบบที่ค้นหา ลองคำที่สั้นลง หรือเลือกหมวดทั้งหมด</p>}
    </div>
  )
}

export function StyleDetail({ id }: { id: string }) {
  const style = STYLES.find((s) => s.id === id)
  useTitle(style ? `${style.code} ${style.name}` : 'ไม่พบแบบป้าย')
  const { font } = useFont('kanit-bold')
  const [text, setText] = useState('JJ ป้าย')
  const [explode, setExplode] = useState(30)
  const [night, setNight] = useState(false)
  const parts = useMemo(() => {
    if (!style || !font) return []
    try {
      return buildStyle(style, textToRegion(font, text.trim() || 'ก', 150, 0), defaultValues(style))
    } catch {
      return []
    }
  }, [style, font, text])
  useEffect(() => () => { parts.forEach((part) => part.geometry.dispose()) }, [parts])
  if (!style) return <NotFoundBody />
  const group = GROUPS.find((g) => g.id === style.group)!
  const index = STYLES.indexOf(style)
  const prev = STYLES[index - 1]
  const next = STYLES[index + 1]
  return (
    <div className="page">
      <nav className="crumbs" aria-label="ตำแหน่ง">
        <Link href="/styles">แคตตาล็อก</Link> <Icon name="chevron" size={14} /> <span>หมวด {group.letter} {group.name}</span>
      </nav>
      <div className="sheet">
        <div className="sheet-view">
          <Viewer parts={parts} explodeMM={explode} night={night} frameKey={style.id} className="sheet-viewer" label={`โมเดลตัวอย่าง ${style.name}`} />
          <div className="plate-controls">
            <button type="button" className="tool" aria-pressed={night} onClick={() => setNight(!night)}>
              <Icon name={night ? 'moon' : 'sun'} /> <span>{night ? 'เปิดไฟ' : 'ปิดไฟ'}</span>
            </button>
            <label className="tool tool-range">
              <Icon name="explode" /> <span>แยกชิ้น</span>
              <input type="range" min={0} max={120} value={explode} onChange={(e) => setExplode(Number(e.target.value))} aria-label="ระยะแยกชิ้น" />
            </label>
          </div>
        </div>
        <div className="sheet-body">
          <p className="sheet-code tabular">{style.code}</p>
          <h1>{style.name}</h1>
          <p className="sheet-lede">{style.blurb}</p>
          {style.usesArt && (
            <label className="field">
              <span className="field-label">ลองข้อความ</span>
              <input value={text} maxLength={24} onChange={(e) => setText(e.target.value)} />
            </label>
          )}
          <Link href={`/app?style=${style.id}${style.usesArt ? `&text=${encodeURIComponent(text)}` : ''}`} className="btn btn-signal btn-lg">
            ออกแบบด้วยแบบนี้ <Icon name="arrow" />
          </Link>
          <h2>ชิ้นส่วน</h2>
          <table className="spec">
            <tbody>
              {parts.map((part) => (
                <tr key={part.id}>
                  <td className="tabular">{part.code}</td>
                  <td>{part.label}</td>
                  <td>{MATERIAL_NAMES[part.material]}</td>
                  <td>{part.cut ? 'ตัดแผ่นได้' : 'พิมพ์ 3D'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>ค่าที่ปรับได้</h2>
          <table className="spec">
            <thead>
              <tr><th>ค่า</th><th className="num">เริ่มต้น</th><th className="num">ช่วง</th></tr>
            </thead>
            <tbody>
              {style.params.map((param) => (
                <tr key={param.key}>
                  <td>{param.label}</td>
                  <td className="num tabular">{param.value} {param.unit}</td>
                  <td className="num tabular">{param.min}–{param.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <nav className="sheet-pager" aria-label="แบบก่อนหน้าและถัดไป">
            {prev ? <Link href={`/styles/${prev.id}`}>← {prev.code} {prev.name}</Link> : <span />}
            {next && <Link href={`/styles/${next.id}`}>{next.code} {next.name} →</Link>}
          </nav>
        </div>
      </div>
    </div>
  )
}

export function NotFoundBody() {
  useTitle('ไม่พบหน้านี้')
  return (
    <div className="page page-narrow">
      <h1>ไม่พบหน้านี้</h1>
      <p>ลิงก์อาจพิมพ์ผิด หรือหน้านี้ถูกย้ายไปแล้ว</p>
      <p>
        <Link href="/" className="btn btn-ghost">กลับหน้าแรก</Link> <Link href="/styles" className="btn btn-ghost">ดูแคตตาล็อก</Link>
      </p>
    </div>
  )
}
