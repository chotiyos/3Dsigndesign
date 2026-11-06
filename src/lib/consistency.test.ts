import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { Box3, BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { applyMaterials, buildStyle, defaultValues, STYLES, type SignPart } from './styles'
import { bounds, diff, islands, rect, union, type Region } from './geo2d'
import { buildZip, dxfLayer, modelSize, partFolder, partRow, partsList, partStats, partsToStl, safeName } from './exportModel'
import { buildDxf } from './exportDxf'
import { analyse } from './solid'
import { bridgeArt } from './bridges'
import { placeBlock } from './blocks'
import { costSheet, DEFAULT_RATES, sheetKey } from './estimate'
import { planModules, powerFor } from './ledPlan'
import { jobSheetHtml } from './jobSheet'
import { buildLightbox, DEFAULT_LIGHTBOX, stripLength } from './lightbox'
import { lightboxReadme } from './lightboxReadme'

// A counter, separate letter and floating mark exercise the same Region input
// that shaped Thai text supplies, without a browser/font loading dependency.
function lettering(h: number): Region {
  return union(diff(rect(0, 0, h * .6, h), rect(0, 0, h * .2, h * .4)), rect(h, 0, h * .25, h), rect(h, h * .7, h * .15, h * .1))
}

/** Independent binary STL decoder: skip normals and attribute bytes. */
function decode(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)
  expect(bytes.length).toBe(84 + count * 50)
  const positions = new Float32Array(count * 9)
  for (let i = 0; i < count; i++) for (let j = 0; j < 9; j++) positions[i * 9 + j] = view.getFloat32(84 + i * 50 + 12 + j * 4, true)
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(positions, 3))
  geometry.computeBoundingBox()
  return geometry
}

function nearBox(a: Box3, b: Box3) {
  for (const edge of ['min', 'max'] as const) for (const axis of ['x', 'y', 'z'] as const) expect(Math.abs(a[edge][axis] - b[edge][axis])).toBeLessThanOrEqual(.01)
}

/** Connected triangle components after welding positions to 0.001 mm. */
function components(geometry: BufferGeometry) {
  const p = geometry.getAttribute('position')
  const parent: number[] = []
  const vertices = new Map<string, number>()
  const root = (n: number): number => {
    while (parent[n] !== n) { parent[n] = parent[parent[n]]; n = parent[n] }
    return n
  }
  for (let t = 0; t < p.count; t += 3) {
    const ids: number[] = []
    for (let j = 0; j < 3; j++) {
      const i = t + j
      const key = [p.getX(i), p.getY(i), p.getZ(i)].map(n => Math.round(n * 1000)).join(',')
      if (!vertices.has(key)) { vertices.set(key, parent.length); parent.push(parent.length) }
      ids.push(vertices.get(key)!)
    }
    parent[root(ids[1])] = root(ids[0])
    parent[root(ids[2])] = root(ids[0])
  }
  return new Set(parent.map((_, i) => root(i))).size
}

/** Decode DXF group pairs rather than comparing the writer to itself. */
function checkDxf(text: string, region: Region) {
  const lines = text.split(/\r?\n/)
  let outlines = 0
  const points: number[][] = []
  for (let i = 0; i < lines.length; i += 2) {
    if (lines[i] === '0' && lines[i + 1] === 'POLYLINE') outlines++
    if (lines[i] === '10') points.push([Number(lines[i + 1])])
    if (lines[i] === '20') points.at(-1)!.push(Number(lines[i + 1]))
  }
  expect(outlines).toBe(region.length)
  expect(points.length).toBe(region.reduce((n, p) => n + p.length, 0))
  const expected = bounds(region)
  for (const [i, lo, hi] of [[0, expected.minX, expected.maxX], [1, expected.minY, expected.maxY]]) {
    expect(Math.abs(Math.min(...points.map(p => p[i])) - lo)).toBeLessThan(.001)
    expect(Math.abs(Math.max(...points.map(p => p[i])) - hi)).toBeLessThan(.001)
  }
}

function check(parts: SignPart[], hidden = new Set<string>()) {
  const visible = parts.filter(p => !hidden.has(p.code))
  expect(visible.length).toBeGreaterThan(0)
  const stats = partStats(visible)
  const list = partsList(stats)
  const files = unzipSync(buildZip({ baseName: 'test', parts: visible, readme: list }))
  expect(strFromU8(files['รายการชิ้นส่วน.txt'])).toBe(list)
  expect(list.split('\n').length).toBe(visible.length)
  const combined = decode(partsToStl(visible))
  const zipCombined = files[Object.keys(files).find(n => !n.includes('/') && n.endsWith('.stl'))!]
  expect(Buffer.compare(zipCombined, partsToStl(visible))).toBe(0)
  const expectedBox = new Box3()
  const expectedPositions: number[] = []
  for (const s of stats) {
    const p = s.part
    const geometry = p.geometry
    const position = geometry.getAttribute('position')
    expect(position.count, p.label).toBeGreaterThan(0)
    expect(Array.from(position.array).every(Number.isFinite), p.label).toBe(true)
    const flat = geometry.index ? geometry.toNonIndexed() : geometry
    for (const value of flat.getAttribute('position').array) expectedPositions.push(value)
    geometry.computeBoundingBox()
    expectedBox.union(geometry.boundingBox!)
    const stem = `${partFolder(p)}/${p.code}-${safeName(p.label)}`
    const parsed = decode(files[`${stem}.stl`])
    nearBox(parsed.boundingBox!, geometry.boundingBox!)
    expect(parsed.getAttribute('position').count).toBe(flat.getAttribute('position').count)
    // A claimed closed surface must remain closed after serialization.
    if (s.watertight) expect(analyse(parsed).watertight, p.label).toBe(true)
    if (p.cut) {
      checkDxf(strFromU8(files[`${stem}.dxf`]), p.cut)
      checkDxf(buildDxf([{ layer: dxfLayer(p), region: p.cut }]), p.cut)
    } else expect(files[`${stem}.dxf`]).toBeUndefined()
    parsed.dispose()
    if (flat !== geometry) flat.dispose()
  }
  // Equality of every triangle also proves offsets, omitted parts and order.
  expect(Array.from(combined.getAttribute('position').array)).toEqual(expectedPositions)
  nearBox(combined.boundingBox!, expectedBox)
  const size = modelSize(visible)
  const actual = combined.boundingBox!.getSize(new Vector3())
  expect([size.w, size.h, size.d]).toEqual(actual.toArray())
  expect(Object.keys(files).filter(n => n.endsWith('.stl')).length).toBe(visible.length + 1)
  expect(Object.keys(files).filter(n => n.endsWith('.dxf')).length).toBe(visible.filter(p => p.cut).length)
  const cuts = visible.filter(p => p.cut)
  if (cuts.length) checkDxf(buildDxf(cuts.map(p => ({ layer: dxfLayer(p), region: p.cut! }))), cuts.flatMap(p => p.cut!))
  const cavity = visible.find(p => p.rear)?.rear?.cavity
  const modules = cavity ? planModules(cavity, 60).length : 0
  const power = powerFor(modules, .72)
  const rates = { ...DEFAULT_RATES, led: 5, psu: 100, labour: 200, margin: 10 }
  const cost = costSheet(stats, { modules, supplies: power.supplies }, rates)
  const printed = stats.filter(s => !s.part.cut && s.part.material !== 'led').reduce((n, s) => n + s.grams, 0)
  expect(cost.lines.find(l => l.key === 'filament')?.qty ?? 0).toBeCloseTo(printed / 1000, 10)
  for (const line of cost.lines.filter(l => l.key.startsWith('sheet:'))) {
    const area = stats.filter(s => s.part.cut && `sheet:${sheetKey(s.part.material, s.part.profile?.depth ?? s.size.z)}` === line.key).reduce((n, s) => { const b = bounds(s.part.cut!); return n + b.w * b.h / 1e6 }, 0)
    expect(line.qty).toBeCloseTo(area, 10)
  }
  expect(cost.lines.find(l => l.key === 'led')?.qty ?? 0).toBe(modules)
  expect(cost.total).toBeCloseTo(cost.lines.reduce((n, l) => n + l.qty * l.rate, 0) * 1.1, 8)
  const html = jobSheetHtml({ shop: '', customer: '', job: '', notes: '', date: new Date('2026-01-01'), image: null, style: 'test', text: '', size, parts: stats.map(partRow), figures: [['LED', String(modules)]], cost: { ...cost, margin: 10 } })
  for (const s of stats) {
    const row = partRow(s)
    expect(row.code).toBe(s.part.code)
    expect(row.label).toBe(s.part.label)
    expect(row.size).toBe([s.size.x, s.size.y, s.size.z].map(n => n.toFixed(1)).join('×'))
    expect(row.grams).toBe(s.part.material === 'led' ? '—' : s.grams.toFixed(0))
    const line = list.split('\n').find(l => l.startsWith(`${s.part.code}  `))!
    expect(line).toBe([row.code, row.label, row.material, row.method, row.size + ' มม.', row.grams === '—' ? '—' : `~${row.grams} กรัม`].join('  '))
    expect(list).toContain(row.size)
    expect(html).toContain(row.size)
    expect(html).toContain(row.grams)
  }
  combined.dispose()
}

describe('preview / manufacturing file consistency', () => {
  it('covers the complete 51-style catalogue', () => expect(STYLES).toHaveLength(51))
  for (const style of STYLES) for (const height of [30, 600]) {
    it(`${style.code} ${height} mm: defaults and every geometry choice`, () => {
      const defaults = defaultValues(style)
      const variants = [defaults, ...style.params.filter(p => p.kind).flatMap(p => Array.from({ length: p.max - p.min + 1 }, (_, i) => ({ ...defaults, [p.key]: p.min + i })))]
      for (const values of variants) {
        const built = buildStyle(style, lettering(height), values)
        try { check(applyMaterials(built, undefined)) } finally { built.forEach(p => p.geometry.dispose()) }
      }
    }, 20000)
  }
  for (const mode of [0, 1, 2] as const) it(`bridges ${mode}, extra block, materials round trip and hidden part`, () => {
    const art = lettering(100)
    const layout = union(art, placeBlock(lettering(30), { x: 0, y: -100 }, bounds(art)))
    const joined = bridgeArt(layout, mode, 2)
    if (mode === 2) expect(islands(joined.region)).toHaveLength(1)
    const style = STYLES[0]
    const built = buildStyle(style, joined.region, { ...defaultValues(style), seatLip: 1, wire: 1, mount: 2, deskBase: 1 })
    try {
      const flat = built.find(p => p.profile && p.profile.depth <= 12 && !p.addon && p.material !== 'led')!
      for (const material of ['print', 'acrylic', 'print'] as const) {
        const parts = applyMaterials(built, { [flat.code]: material })
        expect(Boolean(parts.find(p => p.code === flat.code)!.cut)).toBe(material === 'acrylic')
        check(parts, new Set([parts.at(-1)!.code]))
      }
      const wall = built.find(p => built.some(a => a.addon?.wall === p.code))!
      expect(wall).toBeDefined()
      expect(applyMaterials(built, { [wall.code]: 'metal' }).some(p => p.addon)).toBe(false)
      expect(applyMaterials(built, { [wall.code]: 'print' }).some(p => p.addon)).toBe(true)
      check(applyMaterials(built, { [wall.code]: 'metal' }))
      check(applyMaterials(built, { [wall.code]: 'print' }))
    } finally { built.forEach(p => p.geometry.dispose()) }
  })
  for (const height of [30, 600]) it(`supporting plates and boxes stay one piece at ${height} mm`, () => {
    for (const [id, label] of [['keychain-outline', 'พื้นพวงกุญแจ'], ['die-cut-box', 'ผนังกล่อง']]) {
      const parts = buildStyle(STYLES.find(s => s.id === id)!, lettering(height), {})
      try {
        const part = parts.find(p => p.label === label)!
        const parsed = decode(partsToStl([part]))
        try { expect(components(parsed), label).toBe(1) } finally { parsed.dispose() }
      } finally { parts.forEach(p => p.geometry.dispose()) }
    }
  })
  for (const shape of ['rect', 'circle', 'hex', 'contour'] as const) it(`lightbox ${shape}: colour files, frame, diffuser, rear and LED strip`, () => {
    const model = buildLightbox({ width: 60, height: 40 }, [rect(30, -20, 20, 20), rect(50, -20, 10, 10)], [{ on: true, colour: '#ff0000', thick: .6 }, { on: false, colour: '#00ff00', thick: .8 }], { ...DEFAULT_LIGHTBOX, shape })
    try {
      check(model.parts)
      expect(model.parts.filter(p => p.material === 'accent')).toHaveLength(1)
      const length = stripLength(model.parts)
      expect(length).toBeGreaterThan(0)
      const readme = lightboxReadme(model.parts)
      const files = unzipSync(buildZip({ baseName: 'lightbox', parts: model.parts, readme }))
      expect(strFromU8(files['รายการชิ้นส่วน.txt'])).toContain(`${(length / 10).toFixed(0)} ซม.`)
      const size = modelSize(model.parts)
      expect(readme).toContain(`ลึก ${size.d.toFixed(1)} มม.`)
      expect(readme).toContain(partsList(partStats(model.parts)))
    } finally { model.parts.forEach(p => p.geometry.dispose()) }
  })
})
