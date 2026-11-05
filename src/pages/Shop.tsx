import { useState } from 'react'
import { MATERIALS, READY_FILES, type ReadyFile } from '../data/shop'
import { changeCartQty, clearCart, credits, EXPORT_COST, spend, useDemo } from '../lib/account'
import { textToRegion } from '../lib/artwork'
import { downloadBlob, partsToStl, safeName } from '../lib/exportModel'
import { FONT_OPTIONS } from '../lib/fonts'
import { loadFont } from '../lib/hb'
import { buildStyle, defaultValues, findStyle } from '../lib/styles'
import { Link, useTitle } from '../router'
import { Icon } from '../ui/Icon'
import { StyleThumb } from '../ui/StyleThumb'

const baht = (n: number) => n.toLocaleString('th-TH')

export function Files() {
  useTitle('ไฟล์ 3D สำเร็จรูป')
  const demo = useDemo()
  const [note, setNote] = useState<string | null>(null)

  async function download(file: ReadyFile) {
    const style = findStyle(file.styleId)
    if (credits(demo) < EXPORT_COST.file) {
      setNote(`เครดิตทดลองไม่พอ ต้องใช้ ${EXPORT_COST.file} เครดิต`)
      return
    }
    try {
      const font = await loadFont(FONT_OPTIONS[0].url)
      const art = style.usesArt ? textToRegion(font, file.text, 150, 0) : []
      const parts = buildStyle(style, art, { ...defaultValues(style), ...file.values })
      if (!spend(EXPORT_COST.file, `ไฟล์สำเร็จรูป ${file.title}`)) return
      downloadBlob(partsToStl(parts), `${safeName(file.title)}.stl`, 'model/stl')
      setNote(`ดาวน์โหลด ${file.title} แล้ว หัก ${EXPORT_COST.file} เครดิตทดลอง`)
    } catch {
      setNote('สร้างไฟล์ไม่สำเร็จ ลองอีกครั้ง')
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>ไฟล์ 3D สำเร็จรูป</h1>
        <p>
          ไฟล์ที่ตั้งค่าไว้แล้ว โหลดไปพิมพ์ได้ทันที หรือเปิดในตัวออกแบบเพื่อเปลี่ยนข้อความก่อน ไฟล์ละ {EXPORT_COST.file} เครดิตทดลอง
        </p>
      </header>
      {note && <p className="notice" role="status">{note}</p>}
      <ul className="shelf">
        {READY_FILES.map((file) => {
          const style = findStyle(file.styleId)
          return (
            <li key={file.id} className="shelf-item">
              <StyleThumb style={style} text={file.text || 'ก'} />
              <div className="shelf-body">
                <p className="shelf-code tabular">{style.code}</p>
                <h2>{file.title}</h2>
                <p>{file.note}</p>
              </div>
              <div className="shelf-actions">
                <button type="button" className="btn btn-primary" onClick={() => download(file)}>
                  <Icon name="download" size={16} /> STL <span className="cost">{EXPORT_COST.file}</span>
                </button>
                <Link href={`/app?style=${style.id}${file.text ? `&text=${encodeURIComponent(file.text)}` : ''}`} className="btn btn-ghost">
                  แก้ในตัวออกแบบ
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function Materials() {
  useTitle('ร้านวัสดุ')
  const demo = useDemo()
  const categories = [...new Set(MATERIALS.map((m) => m.category))]
  const [cat, setCat] = useState<string>('all')
  const qty = (id: string) => demo.cart.find((l) => l.id === id)?.qty ?? 0
  return (
    <div className="page">
      <header className="page-head">
        <h1>ร้านวัสดุ</h1>
        <p>เส้นพิมพ์ แผ่นอะคริลิก พลาสวูด และไฟ LED ที่ใช้กับแบบในแคตตาล็อก ราคาและสินค้าในหน้านี้เป็นตัวอย่าง ยังสั่งซื้อจริงไม่ได้</p>
      </header>
      <div className="chips" role="radiogroup" aria-label="หมวดสินค้า">
        <button type="button" role="radio" aria-checked={cat === 'all'} onClick={() => setCat('all')}>ทั้งหมด</button>
        {categories.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={cat === c} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <table className="spec spec-wide price-list">
        <thead>
          <tr><th>สินค้า</th><th>ขนาด</th><th className="num">ราคาตัวอย่าง</th><th className="num">จำนวน</th></tr>
        </thead>
        <tbody>
          {MATERIALS.filter((m) => cat === 'all' || m.category === cat).map((m) => (
            <tr key={m.id}>
              <td>
                <span className="swatch" style={{ background: m.swatch }} aria-hidden="true" />
                <span className="price-name">{m.name}</span>
                <small>{m.category}</small>
              </td>
              <td>{m.spec}</td>
              <td className="num tabular">{baht(m.price)} บาท/{m.unit}</td>
              <td className="num">
                <Stepper value={qty(m.id)} onStep={(d) => changeCartQty(m.id, d)} label={m.name} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="page-foot">
        <Link href="/materials/cart" className="btn btn-primary">
          <Icon name="cart" size={16} /> ดูตะกร้า ({demo.cart.reduce((n, l) => n + l.qty, 0)})
        </Link>
      </p>
    </div>
  )
}

export function Cart() {
  useTitle('ตะกร้าสินค้า')
  const demo = useDemo()
  const [placed, setPlaced] = useState(false)
  const lines = demo.cart
    .map((l) => ({ ...l, item: MATERIALS.find((m) => m.id === l.id) }))
    .filter((l): l is typeof l & { item: NonNullable<typeof l.item> } => Boolean(l.item))
  const total = lines.reduce((sum, l) => sum + l.item.price * l.qty, 0)

  if (placed) {
    return (
      <div className="page page-narrow">
        <h1>บันทึกรายการทดลองแล้ว</h1>
        <p>นี่คือการสาธิต ยังไม่มีการสั่งซื้อหรือตัดเงินจริง เมื่อร้านเปิดรับคำสั่งซื้อ หน้านี้จะเชื่อมกับระบบชำระเงิน</p>
        <Link href="/materials" className="btn btn-ghost">กลับร้านวัสดุ</Link>
      </div>
    )
  }

  return (
    <div className="page page-narrow">
      <h1>ตะกร้าสินค้า</h1>
      {lines.length === 0 ? (
        <p className="empty">
          ตะกร้ายังว่าง <Link href="/materials">เลือกวัสดุ</Link>
        </p>
      ) : (
        <>
          <table className="spec spec-wide">
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.item.name}<small>{l.item.spec}</small></td>
                  <td className="num"><Stepper value={l.qty} onStep={(d) => changeCartQty(l.id, d)} label={l.item.name} /></td>
                  <td className="num tabular">{baht(l.item.price * l.qty)} บาท</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th colSpan={2}>รวม (ราคาตัวอย่าง ไม่รวมค่าส่ง)</th><td className="num tabular">{baht(total)} บาท</td></tr>
            </tfoot>
          </table>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={clearCart}>ล้างตะกร้า</button>
            <button type="button" className="btn btn-primary" onClick={() => { clearCart(); setPlaced(true) }}>
              ยืนยันรายการทดลอง
            </button>
          </div>
          <p className="note">ปุ่มยืนยันไม่ตัดเงินและไม่ส่งข้อมูลไปที่ใด เป็นการสาธิตขั้นตอนเท่านั้น</p>
        </>
      )}
    </div>
  )
}

function Stepper({ value, onStep, label }: { value: number; onStep: (delta: number) => void; label: string }) {
  return (
    <span className="stepper">
      <button type="button" aria-label={`ลด ${label}`} disabled={value <= 0} onClick={() => onStep(-1)}><Icon name="minus" size={14} /></button>
      <span className="tabular" aria-live="polite">{value}</span>
      <button type="button" aria-label={`เพิ่ม ${label}`} disabled={value >= 99} onClick={() => onStep(1)}><Icon name="plus" size={14} /></button>
    </span>
  )
}
