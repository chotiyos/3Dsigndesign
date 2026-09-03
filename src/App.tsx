import { useEffect, useMemo, useState } from 'react'
import type * as THREE from 'three'
import { FONT_OPTIONS } from './lib/fonts'
import { loadFont, type LoadedFont } from './lib/hb'
import { buildDxf } from './lib/exportDxf'
import { downloadBlob, exportStlBinary } from './lib/exportModel'
import { buildFrontLitParts, type SignPart, type SignPartId } from './lib/signParts'
import { parseSvgToShapes } from './lib/svgToShapes'
import { shapeTextToShapes } from './lib/textToShapes'
import { Viewer } from './three/Viewer'

const LAYER_LABELS: { id: SignPartId; label: string }[] = [
  { id: 'front', label: 'อะคริลิกหน้า' },
  { id: 'wall', label: 'ผนังตัวอักษร' },
  { id: 'back', label: 'แผ่นหลัง' },
]

type Mode = 'text' | 'svg'

interface ShapesSource {
  shapes: THREE.Shape[]
  upem: number
  widthFontUnits: number
}

const EMPTY_SOURCE: ShapesSource = { shapes: [], upem: 1, widthFontUnits: 0 }

function App() {
  const [mode, setMode] = useState<Mode>('text')

  const [fontId, setFontId] = useState(FONT_OPTIONS[0].id)
  const [font, setFont] = useState<LoadedFont | null>(null)
  const [fontError, setFontError] = useState<string | null>(null)
  const [text, setText] = useState('ไก่')

  const [svgSource, setSvgSource] = useState<ShapesSource | null>(null)
  const [svgFileName, setSvgFileName] = useState<string | null>(null)
  const [svgError, setSvgError] = useState<string | null>(null)

  const [heightMM, setHeightMM] = useState(200)
  const [wallThicknessMM, setWallThicknessMM] = useState(10)
  const [bodyDepthMM, setBodyDepthMM] = useState(50)
  const [frontThicknessMM, setFrontThicknessMM] = useState(3)
  const [backThicknessMM, setBackThicknessMM] = useState(3)
  const [explodeMM, setExplodeMM] = useState(0)
  const [visibility, setVisibility] = useState<Record<SignPartId, boolean>>({
    front: true,
    wall: true,
    back: true,
  })

  const fontOption = FONT_OPTIONS.find((f) => f.id === fontId) ?? FONT_OPTIONS[0]

  useEffect(() => {
    let cancelled = false
    setFont(null)
    setFontError(null)
    loadFont(fontOption.url)
      .then((loaded) => {
        if (!cancelled) setFont(loaded)
      })
      .catch((err) => {
        if (!cancelled) setFontError(String(err))
      })
    return () => {
      cancelled = true
    }
  }, [fontOption.url])

  const { shapes: textShapes, shapeError } = useMemo(() => {
    if (!font || !text) {
      return { shapes: EMPTY_SOURCE, shapeError: null as string | null }
    }
    try {
      const result = shapeTextToShapes(font, text)
      return {
        shapes: { shapes: result.shapes, upem: result.upem, widthFontUnits: result.width },
        shapeError: null,
      }
    } catch (err) {
      return { shapes: EMPTY_SOURCE, shapeError: String(err) }
    }
  }, [font, text])

  function handleSvgFile(file: File) {
    setSvgError(null)
    setSvgFileName(file.name)
    file
      .text()
      .then((text) => {
        const result = parseSvgToShapes(text)
        setSvgSource({ shapes: result.shapes, upem: result.upem, widthFontUnits: result.width })
      })
      .catch((err) => {
        setSvgSource(null)
        setSvgError(String(err))
      })
  }

  const activeSource: ShapesSource =
    mode === 'svg' ? (svgSource ?? EMPTY_SOURCE) : textShapes
  const activeError = mode === 'svg' ? svgError : shapeError

  const { parts, partsError } = useMemo(() => {
    if (activeSource.shapes.length === 0) {
      return { parts: [] as SignPart[], partsError: null as string | null }
    }
    try {
      const built = buildFrontLitParts(activeSource.shapes, activeSource.upem, heightMM, {
        wallThicknessMM,
        bodyDepthMM,
        frontThicknessMM,
        backThicknessMM,
      })
      return { parts: built, partsError: null }
    } catch (err) {
      return { parts: [] as SignPart[], partsError: String(err) }
    }
  }, [activeSource, heightMM, wallThicknessMM, bodyDepthMM, frontThicknessMM, backThicknessMM])

  const widthMM = (activeSource.widthFontUnits / activeSource.upem) * heightMM
  const totalDepthMM = backThicknessMM + bodyDepthMM + frontThicknessMM
  const ready = mode === 'text' ? font !== null : true
  const canExport = parts.length > 0 && !partsError

  function handleExportStl() {
    const buffer = exportStlBinary(parts, activeSource.upem, heightMM, visibility)
    downloadBlob(buffer, 'aksign-3d.stl', 'model/stl')
  }

  function handleExportDxf() {
    const scale = heightMM / activeSource.upem
    const dxf = buildDxf([{ layer: 'CUT', shapes: activeSource.shapes }], scale)
    downloadBlob(dxf, 'aksign-3d.dxf', 'application/dxf')
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <aside className="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto border-r border-neutral-800 p-5">
        <div>
          <h1 className="text-lg font-semibold">Aksign 3D — ตัวออกแบบ</h1>
          <p className="mt-1 text-xs text-neutral-500">
            พิมพ์ข้อความไทย/อังกฤษ หรืออัปโหลด SVG แล้วดูโมเดล 3D แบบเรียลไทม์
          </p>
        </div>

        <div className="flex rounded-md border border-neutral-700 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`flex-1 rounded px-2 py-1.5 ${mode === 'text' ? 'bg-neutral-700 text-white' : 'text-neutral-400'}`}
          >
            พิมพ์ข้อความ
          </button>
          <button
            type="button"
            onClick={() => setMode('svg')}
            className={`flex-1 rounded px-2 py-1.5 ${mode === 'svg' ? 'bg-neutral-700 text-white' : 'text-neutral-400'}`}
          >
            อัปโหลด SVG
          </button>
        </div>

        {mode === 'text' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-400">ข้อความ</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-lg outline-none focus:border-neutral-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-400">แบบอักษร</label>
              <select
                value={fontId}
                onChange={(e) => setFontId(e.target.value)}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-400">ไฟล์ SVG</label>
            <input
              type="file"
              accept="image/svg+xml,.svg"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleSvgFile(file)
              }}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-300 file:mr-2 file:rounded file:border-0 file:bg-neutral-700 file:px-2 file:py-1 file:text-neutral-200"
            />
            {svgFileName && !svgError && (
              <p className="text-xs text-neutral-500">โหลดแล้ว: {svgFileName}</p>
            )}
          </div>
        )}

        <ParamSlider
          label="ความสูงตัวอักษร"
          unit="มม."
          value={heightMM}
          min={20}
          max={600}
          step={1}
          onChange={setHeightMM}
        />
        <ParamSlider
          label="ความหนาผนัง"
          unit="มม."
          value={wallThicknessMM}
          min={2}
          max={40}
          step={0.5}
          onChange={setWallThicknessMM}
        />
        <ParamSlider
          label="ความลึกผนัง (ตัวป้าย)"
          unit="มม."
          value={bodyDepthMM}
          min={5}
          max={150}
          step={1}
          onChange={setBodyDepthMM}
        />
        <ParamSlider
          label="ความหนาอะคริลิกหน้า"
          unit="มม."
          value={frontThicknessMM}
          min={1}
          max={15}
          step={0.5}
          onChange={setFrontThicknessMM}
        />
        <ParamSlider
          label="ความหนาแผ่นหลัง"
          unit="มม."
          value={backThicknessMM}
          min={1}
          max={15}
          step={0.5}
          onChange={setBackThicknessMM}
        />

        <div className="flex flex-col gap-3 border-t border-neutral-800 pt-4">
          <ParamSlider
            label="แยกชิ้น (exploded view)"
            unit="มม."
            value={explodeMM}
            min={0}
            max={150}
            step={1}
            onChange={setExplodeMM}
          />
          <div className="flex flex-col gap-1.5">
            {LAYER_LABELS.map(({ id, label }) => (
              <label key={id} className="flex items-center gap-2 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  checked={visibility[id]}
                  onChange={(e) => setVisibility((v) => ({ ...v, [id]: e.target.checked }))}
                  className="accent-neutral-200"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-neutral-800 pt-4">
          <span className="text-xs font-medium text-neutral-400">ส่งออกไฟล์ผลิต</span>
          <button
            type="button"
            disabled={!canExport}
            onClick={handleExportStl}
            className="rounded-md bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ดาวน์โหลด STL (สำหรับพิมพ์ 3D)
          </button>
          <button
            type="button"
            disabled={!canExport}
            onClick={handleExportDxf}
            className="rounded-md border border-neutral-600 px-3 py-2 text-xs font-medium text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ดาวน์โหลด DXF (เส้นตัดหน้า/หลัง)
          </button>
        </div>

        <div className="mt-auto rounded-md border border-neutral-800 bg-neutral-900/60 p-3 text-xs text-neutral-400">
          {mode === 'text' && !font && !fontError && <p>กำลังโหลดฟอนต์…</p>}
          {fontError && <p className="text-red-400">โหลดฟอนต์ล้มเหลว: {fontError}</p>}
          {activeError && <p className="text-red-400">{activeError}</p>}
          {partsError && <p className="text-red-400">สร้างชิ้นส่วนล้มเหลว: {partsError}</p>}
          {ready && !activeError && !partsError && activeSource.shapes.length > 0 && (
            <p>
              กว้าง {widthMM.toFixed(1)} มม. · สูง {heightMM.toFixed(1)} มม. · ลึกรวม{' '}
              {totalDepthMM.toFixed(1)} มม. · {parts.length} ชิ้นส่วน
            </p>
          )}
          {ready && mode === 'svg' && !svgSource && !svgError && (
            <p>เลือกไฟล์ SVG เพื่อเริ่มต้น</p>
          )}
        </div>
      </aside>

      <main className="relative flex-1">
        {ready ? (
          <Viewer
            parts={parts}
            upem={activeSource.upem}
            heightMM={heightMM}
            explodeMM={explodeMM}
            visibility={visibility}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-500">
            กำลังเตรียม 3D…
          </div>
        )}
      </main>
    </div>
  )
}

function ParamSlider({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-neutral-400">{label}</label>
        <span className="text-xs text-neutral-500">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-neutral-200"
      />
    </div>
  )
}

export default App
