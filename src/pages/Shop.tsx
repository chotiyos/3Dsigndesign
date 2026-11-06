import { useState } from 'react'
import { READY_FILES, type ReadyFile } from '../data/shop'
import { credits, EXPORT_COST, spend, useDemo } from '../lib/account'
import { textToRegion } from '../lib/artwork'
import { downloadBlob, partsToStl, safeName } from '../lib/exportModel'
import { FONT_OPTIONS } from '../lib/fonts'
import { loadFont } from '../lib/hb'
import { buildStyle, defaultValues, findStyle } from '../lib/styles'
import { Link, useTitle } from '../router'
import { Icon } from '../ui/Icon'
import { StyleThumb } from '../ui/StyleThumb'


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
      let data: Uint8Array
      try {
        data = partsToStl(parts)
      } finally {
        parts.forEach((part) => part.geometry.dispose())
      }
      if (!spend(EXPORT_COST.file, `ไฟล์สำเร็จรูป ${file.title}`)) {
        setNote(`เครดิตทดลองไม่พอ ต้องใช้ ${EXPORT_COST.file} เครดิต`)
        return
      }
      downloadBlob(data, `${safeName(file.title)}.stl`, 'model/stl')
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
                <Link href={`/app?style=${style.id}&file=${encodeURIComponent(file.id)}`} className="btn btn-ghost">
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

