import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import type { BufferGeometry } from 'three'
import { revolve, merge, extrude } from '../lib/solid'
import { circle, ring, union } from '../lib/geo2d'
import { Parts } from '../lib/styles/kit'
import type { SignPart } from '../lib/styles'
import { useTitle } from '../router'
import { Viewer } from '../three/Viewer'
import { Icon } from '../ui/Icon'

/**
 * The AI page shows the intended flow with sample models built locally. It is
 * not connected to any AI service and says so on screen.
 */
/** Turns a Z-up solid of revolution so it stands upright in the viewer (Y up). */
const upright = (g: BufferGeometry) => g.rotateX(-Math.PI / 2)

interface Sample {
  id: string
  title: string
  build: () => SignPart[]
}

const SAMPLES: Sample[] = [
  {
    id: 'vase',
    title: 'แจกันทรงหยดน้ำ',
    build: () => {
      const profile: [number, number][] = [[0, 0]]
      for (let i = 0; i <= 24; i++) {
        const t = i / 24
        profile.push([22 + Math.sin(t * Math.PI * 1.2) * 26 - t * 10, t * 140])
      }
      profile.push([0, 140])
      return new Parts().solid('แจกัน', 'accent', upright(revolve(profile, 72))).done()
    },
  },
  {
    id: 'trophy',
    title: 'ถ้วยรางวัล',
    build: () => {
      const cup = upright(revolve([[0, 0], [34, 0], [34, 8], [10, 14], [8, 50], [34, 70], [42, 120], [0, 120]], 64))
      const handles = merge([extrude(ring(circle(-46, 92, 14, 32), 4), 6, -3), extrude(ring(circle(46, 92, 14, 32), 4), 6, -3)])
      return new Parts().solid('ถ้วย', 'metal', cup).solid('หูจับ', 'metal', handles, 0.5).done()
    },
  },
  {
    id: 'lamp',
    title: 'โคมไฟตั้งโต๊ะ',
    build: () => {
      const base = upright(revolve([[0, 0], [40, 0], [40, 10], [8, 16], [6, 90], [0, 90]], 64))
      const shade = upright(revolve([[0, 86], [18, 86], [48, 140], [0, 140]], 64))
      return new Parts().solid('ฐานโคม', 'print', base).solid('โป๊ะไฟ', 'opal', shade, 0.5).done()
    },
  },
  {
    id: 'badge',
    title: 'ตราสัญลักษณ์กลม',
    build: () => {
      const disc = extrude(union(circle(0, 0, 60, 96)), 6, 0)
      const rim = extrude(ring(circle(0, 0, 60, 96), 6), 4, 6)
      const star: [number, number][] = []
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 16 : 38
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2
        star.push([Math.cos(a) * r, Math.sin(a) * r])
      }
      return new Parts()
        .solid('พื้นตรา', 'print', disc)
        .solid('ขอบตรา', 'accent', rim, 0.4)
        .slab('ดาว', 'accent', [star], 4, 6, 0.8)
        .done()
    },
  },
]

export default function Gen() {
  useTitle('โมเดลจาก AI')
  const [mode, setMode] = useState<'text' | 'image'>('text')
  const [prompt, setPrompt] = useState('')
  const [picked, setPicked] = useState(SAMPLES[0].id)
  const [imageName, setImageName] = useState<string | null>(null)
  const [explained, setExplained] = useState(false)
  const sample = SAMPLES.find((s) => s.id === picked) ?? SAMPLES[0]
  const parts = useMemo(() => sample.build(), [sample])
  useEffect(() => () => { parts.forEach((part) => part.geometry.dispose()) }, [parts])

  const onImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) setImageName(file.name)
  }

  return (
    <div className="page gen">
      <header className="page-head">
        <h1>โมเดล 3D จากคำบรรยายหรือรูปภาพ</h1>
        <p>
          หน้านี้แสดงขั้นตอนการทำงานด้วยโมเดลตัวอย่าง ยังไม่ได้เชื่อมต่อบริการ AI จริง โมเดลด้านล่างสร้างจากสูตรในเว็บนี้
        </p>
      </header>
      <div className="gen-layout">
        <form
          className="gen-form"
          onSubmit={(e) => {
            e.preventDefault()
            setExplained(true)
          }}
        >
          <div className="seg" role="tablist" aria-label="ประเภทข้อมูล">
            <button type="button" role="tab" aria-selected={mode === 'text'} onClick={() => setMode('text')}>คำบรรยาย</button>
            <button type="button" role="tab" aria-selected={mode === 'image'} onClick={() => setMode('image')}>รูปภาพ</button>
          </div>
          {mode === 'text' ? (
            <label className="field">
              <span className="field-label">อยากได้โมเดลอะไร</span>
              <textarea rows={4} maxLength={500} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="เช่น ช้างไทยนั่งบนฐานกลม ลายไทยรอบฐาน" />
              <small className="range-hint">{prompt.length}/500</small>
            </label>
          ) : (
            <label className="drop">
              <Icon name="image" size={22} />
              <strong>{imageName ?? 'เลือกรูปวัตถุ'}</strong>
              <span>รูปวัตถุชิ้นเดียว พื้นหลังเรียบ ได้ผลดีที่สุด</span>
              <input type="file" accept="image/*" onChange={onImage} className="sr-only" />
            </label>
          )}
          <button type="submit" className="btn btn-primary btn-block">
            <Icon name="spark" size={16} /> สร้างโมเดล
          </button>
          {explained && (
            <p className="notice" role="status">
              ยังสร้างโมเดลจริงไม่ได้ เพราะยังไม่ได้เชื่อมต่อบริการ AI ลองหมุนดูโมเดลตัวอย่างด้านขวาเพื่อเห็นผลลัพธ์ที่จะได้
            </p>
          )}
          <h2 className="gen-sub">ตัวอย่างผลลัพธ์</h2>
          <ul className="gen-samples">
            {SAMPLES.map((s) => (
              <li key={s.id}>
                <button type="button" aria-pressed={s.id === picked} onClick={() => setPicked(s.id)}>{s.title}</button>
              </li>
            ))}
          </ul>
        </form>
        <div className="gen-view">
          <Viewer parts={parts} explodeMM={0} frameKey={sample.id} autoRotate className="sheet-viewer" label={`โมเดลตัวอย่าง ${sample.title}`} />
          <p className="gen-tag">ตัวอย่าง · {sample.title}</p>
        </div>
      </div>
    </div>
  )
}
