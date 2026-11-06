/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { isValidElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ query: '', index: 0, id: 0, states: [] as unknown[], setters: [] as ReturnType<typeof vi.fn>[], effects: [] as (() => unknown)[] }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const i = harness.index++
    const value = i in harness.states ? harness.states[i] : typeof initial === 'function' ? initial() : initial
    const setter = vi.fn()
    harness.setters[i] = setter
    return [value, setter]
  },
  useId: () => 'control-' + harness.id++,
  useEffect: (effect: () => unknown) => harness.effects.push(effect), useDeferredValue: (value: unknown) => value,
  useMemo: (fn: () => unknown) => fn(), useRef: (value: unknown) => ({ current: value }),
}))
vi.mock('../router', () => ({ useTitle() {}, useLocation: () => ({ query: new URLSearchParams(harness.query) }), Link: 'a' }))
vi.mock('../lib/account', () => ({ useDemo: () => ({}), credits: () => 100, EXPORT_COST: {}, spend: vi.fn() }))
vi.mock('../lib/artwork', () => ({
  textToRegion: vi.fn((_font: unknown, text: string, height: number, spacing: number) => {
    const width = text === 'W\niiiiii' ? Math.max(height * 3, height + spacing * 6) : height * 2 + spacing
    return [[[0, 0], [width, 0], [width, height * (text.includes('\n') ? 2 : 1)], [0, height * (text.includes('\n') ? 2 : 1)]]]
  }),
  svgToRegion: () => [], imageToRegion: () => [], readImage: vi.fn(),
}))
vi.mock('../three/Viewer', () => ({ Viewer: 'viewer' }))
import Editor, { cleanDraft, portableDraft, Range, switchDraftStyle } from './Editor'
import { CUSTOM_FONT_ID, FONT_OPTIONS } from '../lib/fonts'
import { STYLES } from '../lib/styles'
import { textToRegion } from '../lib/artwork'
import { bounds } from '../lib/geo2d'
import { fontFromArrayBuffer } from '../lib/hb'
import { encodeShare } from '../lib/share'

function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!isValidElement<{ children?: ReactNode }>(node)) return []
  return [node as any, ...nodes(node.props.children)]
}
beforeEach(() => { harness.query = ''; harness.index = 0; harness.id = 0; harness.states = []; harness.setters = []; harness.effects = [] })

for (const valid of [true, false]) {
  it(`shows the ${valid ? 'success' : 'error'} share message after consuming the launch URL`, () => {
    const hash = '#d=' + (valid ? encodeShare({ text: 'Shared design' }) : 'broken')
    const location = { href: 'https://jjdesign.test/app' + hash, hash }
    const replaceState = vi.fn(() => { location.hash = '' })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
    vi.stubGlobal('window', { location, history: { state: null, replaceState }, addEventListener: vi.fn() })
    try {
      Editor()
      harness.effects[2]()
      expect(replaceState).toHaveBeenCalled()
      expect(location.hash).toBe('')
      harness.effects[4]()
      expect(harness.setters[5]).toHaveBeenCalledWith(expect.objectContaining({ tone: valid ? 'ok' : 'error' }))
    } finally { vi.unstubAllGlobals() }
  })
}

it('removes launch inputs only after autosave succeeds, so refresh keeps later edits', () => {
  vi.useFakeTimers()
  const replaceState = vi.fn(), setItem = vi.fn()
  vi.stubGlobal('localStorage', { getItem: () => null, setItem })
  vi.stubGlobal('window', { location: { href: 'https://jjdesign.test/app?style=front-lit-lip&text=OLD#d=abc', hash: '' }, history: { state: null, replaceState } })
  try {
    Editor()
    harness.effects[1]()
    expect(replaceState).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(setItem).toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledWith(null, '', '/app')
    replaceState.mockClear()
    setItem.mockImplementation(() => { throw new Error('quota') })
    harness.effects[1]()
    vi.runAllTimers()
    expect(replaceState).not.toHaveBeenCalled()
  } finally { vi.useRealTimers(); vi.unstubAllGlobals() }
})

it('flushes pending text edits on leaving the editor before the autosave timer', () => {
  const setItem = vi.fn(), addEventListener = vi.fn(), removeEventListener = vi.fn()
  vi.stubGlobal('localStorage', { getItem: () => null, setItem })
  vi.stubGlobal('window', { location: { hash: '' }, addEventListener, removeEventListener })
  try {
    Editor()
    const cleanup = harness.effects[2]() as () => void
    expect(setItem).not.toHaveBeenCalled()
    cleanup()
    expect(JSON.parse(setItem.mock.calls[0][1]).text).toBe('ร้านของฉัน')
    expect(removeEventListener).toHaveBeenCalledWith('pagehide', addEventListener.mock.calls[0][1])
  } finally { vi.unstubAllGlobals() }
})

it('keeps colours separate between styles and restores them after a project round trip', () => {
  const first = STYLES[0].id, second = STYLES[1].id
  const draft = { ...cleanDraft({}), styleId: first, colors: { A: '#123456' } } as Parameters<typeof switchDraftStyle>[0]
  const changed = switchDraftStyle(draft, second)
  expect(changed.colors).toEqual({})
  const restored = cleanDraft(JSON.parse(JSON.stringify({ ...changed, colors: { A: '#abcdef' } })))
  const back = switchDraftStyle(restored as typeof draft, first)
  expect(back.colors).toEqual({ A: '#123456' })
  expect(switchDraftStyle(back, second).colors).toEqual({ A: '#abcdef' })
})

it('explains empty outlines instead of leaving a blank viewer with disabled exports', () => {
  harness.states[0] = { ...cleanDraft({}), source: 'text', text: '\u200b', fontId: FONT_OPTIONS[0].id, styleId: STYLES[0].id }
  harness.states[3] = { id: FONT_OPTIONS[0].id, font: {} }
  vi.mocked(textToRegion).mockReturnValueOnce([])
  expect(nodes(Editor()).some(n => n.props.role === 'alert' && n.props.children === 'ไม่พบรูปทรงตัวอักษร ลองเปลี่ยนข้อความหรือฟอนต์')).toBe(true)
  harness.index = 0
  harness.states[0] = { ...harness.states[0] as object, source: 'svg', svgText: '<svg/>' }
  expect(nodes(Editor()).some(n => n.props.role === 'alert' && n.props.children === 'ไม่พบรูปทรงใน SVG ใช้ไฟล์ที่มีเส้นปิดและเติมสีแล้ว')).toBe(true)
  expect(cleanDraft({ fontId: 'missing-font' }).fontId).toBe(FONT_OPTIONS[0].id)
})

it('restores hidden parts and offers a colour control in the export table on phones', async () => {
  harness.states[0] = { ...cleanDraft({}), source: 'text', text: 'AB', fontId: FONT_OPTIONS[0].id, styleId: STYLES[0].id }
  harness.states[1] = 4
  harness.states[3] = { id: FONT_OPTIONS[0].id, font: {} }
  expect(nodes(Editor()).some(n => n.type === 'input' && n.props.className === 'part-color')).toBe(true)
  harness.index = 0
  harness.states[1] = 1
  const input = nodes(Editor()).find(n => n.type === 'input' && n.props.accept === '.jjd,application/json')!
  await input.props.onChange({ target: { files: [{ name: 'hidden.jjd', text: async () => JSON.stringify({ app: 'jjdesign', version: 1, draft: { hiddenParts: ['A'] } }) }], value: '' } })
  expect(harness.setters[10]).toHaveBeenCalledWith(new Set(['A']))
  expect(cleanDraft({ hiddenParts: ['A', 'Z25', 'bad'] }).hiddenParts).toEqual(['A', 'Z25'])
})

it('opens a ready file with its preset instead of unrelated saved dimensions and materials', () => {
  harness.query = 'style=front-lit-lip&file=open-sign'
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({
    source: 'svg', text: 'OLD', heightMM: 900, spacingMM: 50, fontId: FONT_OPTIONS[1].id,
    values: { 'front-lit-lip': { depth: 180 } }, materials: { 'front-lit-lip': { B: 'metal' } }, colors: { B: '#123456' },
  }) })
  try {
    const tree = nodes(Editor())
    expect(tree.find(n => n.type === Range && n.props.label === 'ขนาดตัวอักษร (ขนาดฟอนต์)')?.props.value).toBe(150)
    expect(tree.find(n => n.type === Range && n.props.label === 'ความลึกตัวอักษร')?.props.value).toBe(50)
    vi.useFakeTimers()
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem })
    harness.effects[1]()
    vi.runAllTimers()
    expect(JSON.parse(setItem.mock.calls[0][1])).toMatchObject({ source: 'text', text: 'OPEN', fontId: FONT_OPTIONS[0].id, heightMM: 150, spacingMM: 0, materials: {}, colors: {} })
  } finally { vi.useRealTimers(); vi.unstubAllGlobals() }
})

it('does not replace a recoverable autosave with an oversized SVG missing its artwork', () => {
  vi.useFakeTimers()
  const setItem = vi.fn()
  vi.stubGlobal('localStorage', { getItem: () => null, setItem })
  try {
    harness.states[0] = { ...cleanDraft({}), fontId: FONT_OPTIONS[0].id, source: 'svg', svgText: 'x'.repeat(400_000), styleId: STYLES[0].id }
    Editor()
    harness.effects[1]()
    vi.runAllTimers()
    expect(setItem).not.toHaveBeenCalled()
  } finally { vi.useRealTimers(); vi.unstubAllGlobals() }
})

it('validates persisted materials and colors, retaining valid per-style choices', () => {
  const id = STYLES[0].id
  const result = cleanDraft(JSON.parse(JSON.stringify({
    materials: { [id]: { A: 'metal', B: 'led', C: 'invalid', nonsense: 'print' }, unknown: { A: 'metal' } },
    colors: { A: '#aabbcc', B: {}, C: 'invalid' },
  })))
  expect(result.materials).toEqual({ [id]: { A: 'metal' } })
  expect(result.colors).toEqual({ A: '#aabbcc' })
  expect(cleanDraft({ materials: { [id]: ['metal'] } } as any).materials).toEqual({})
  expect(cleanDraft({ fontId: CUSTOM_FONT_ID }).fontId).toBe(FONT_OPTIONS[0].id)
})

it('clears hidden letters when switching styles or opening another project', async () => {
  harness.states[1] = 2
  const tree = nodes(Editor())
  tree.find(n => n.props.className === 'pick')!.props.onClick()
  expect(harness.setters[10]).toHaveBeenCalledWith(new Set())
  harness.index = 0
  harness.states[1] = 1
  const project = nodes(Editor()).find(n => n.type === 'input' && n.props.accept === '.jjd,application/json')
  expect(project).toBeDefined()
  await project!.props.onChange({ target: { files: [{ name: 'sample.jjd', text: async () => JSON.stringify({ app: 'jjdesign', version: 1, draft: {} }) }], value: 'sample.jjd' } })
  expect(harness.setters[10]).toHaveBeenCalledWith(new Set())
})

it('persists image outlines and their measured height as an SVG source', () => {
  const draft = { ...cleanDraft({}), source: 'image', heightMM: 200 } as Parameters<typeof portableDraft>[0]
  const saved = portableDraft(draft, [[[0, 0], [100, 0], [100, 190], [0, 190]], [[10, 10], [10, 20], [20, 20], [20, 10]]])
  expect(saved.source).toBe('svg')
  expect(saved.heightMM).toBe(190)
  expect(saved.svgText).toContain('viewBox="0 -190 100 190"')
  expect(saved.svgText).toContain('M0,0L100,0L100,-190L0,-190ZM10,-10L10,-20L20,-20L20,-10Z')
  expect(cleanDraft(JSON.parse(JSON.stringify(saved))).source).toBe('svg')
})

for (const text of ['AB', 'AB\nCD']) {
  it('fits exact width and height with fixed tracking: ' + JSON.stringify(text), () => {
    const draft = { ...cleanDraft({}), source: 'text', text, fontId: FONT_OPTIONS[0].id, heightMM: 200, spacingMM: 100, styleId: STYLES[0].id }
    harness.states[0] = draft
    harness.states[1] = 1
    harness.states[3] = { id: draft.fontId, font: {} }
    const tree = nodes(Editor())
    const controls = tree.filter(n => n.type === Range && n.props.slider === false)
    expect(controls).toHaveLength(2)
    controls[0].props.onChange(700)
    expect(harness.setters[0].mock.calls[0][0](draft).heightMM).toBeCloseTo(300, 3)
    controls[1].props.onChange(600)
    expect(harness.setters[0].mock.calls[1][0](draft).heightMM).toBeCloseTo(text.includes('\n') ? 300 : 600, 3)
    controls[0].props.onChange(1e9)
    expect(harness.setters[0].mock.calls[2][0](draft).heightMM).toBeCloseTo(1500, 3)
    controls[0].props.onChange(1)
    expect(harness.setters[0].mock.calls[3][0](draft).heightMM).toBeCloseTo(10, 3)
  })
}

it('gives repeated labels unique ids and labels the numeric input without a slider', () => {
  const props = { label: 'size', unit: 'mm', value: 10, min: 1, max: 20, step: 1, onChange: vi.fn(), slider: false }
  const first = nodes(Range(props)), second = nodes(Range(props))
  const input = first.find(n => n.type === 'input')!
  expect(first.find(n => n.type === 'label')!.props.htmlFor).toBe(input.props.id)
  expect(second.find(n => n.type === 'input')!.props.id).not.toBe(input.props.id)
  input.props.onBlur({ target: { value: '100' } })
  expect(props.onChange).toHaveBeenCalledWith(20)
})

it('fits exact width when the widest line changes, without measuring during unrelated controls', () => {
  const draft = { ...cleanDraft({}), source: 'text', text: 'W\niiiiii', fontId: FONT_OPTIONS[0].id, heightMM: 100, spacingMM: 100, styleId: STYLES[0].id }
  harness.states[0] = draft
  harness.states[3] = { id: draft.fontId, font: {} }
  const tree = nodes(Editor())
  vi.mocked(textToRegion).mockClear()
  tree.find(n => n.props['aria-label'] === 'แสดงตาราง')!.props.onClick()
  expect(textToRegion).not.toHaveBeenCalled()
  tree.find(n => n.type === Range && n.props.label === 'กว้างจริง')!.props.onChange(1800.01)
  const fitted = harness.setters[0].mock.calls[0][0](draft)
  expect(bounds(textToRegion({} as any, draft.text, fitted.heightMM, draft.spacingMM)).w).toBeCloseTo(1800.01, 2)
})

it('preserves sub-centimillimetre font sizes needed for an exact width', () => {
  const draft = { ...cleanDraft({}), source: 'text', text: 'AB', fontId: FONT_OPTIONS[0].id, heightMM: 200, spacingMM: 0, styleId: STYLES[0].id }
  harness.states[0] = draft
  harness.states[3] = { id: draft.fontId, font: {} }
  nodes(Editor()).find(n => n.type === Range && n.props.label === 'กว้างจริง')!.props.onChange(700.01)
  expect(harness.setters[0].mock.calls[0][0](draft).heightMM * 2).toBeCloseTo(700.01, 4)
})

it('fits real multiline outlines with tracking across a change of widest line', async () => {
  const actual = await vi.importActual<typeof import('../lib/artwork')>('../lib/artwork')
  const bytes = readFileSync('public/fonts/Kanit-Bold.ttf')
  const font = fontFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  const original = vi.mocked(textToRegion).getMockImplementation()!
  vi.mocked(textToRegion).mockImplementation(actual.textToRegion)
  try {
    for (const spacingMM of [50, -30]) {
      harness.index = 0
      const draft = { ...cleanDraft({}), source: 'text', text: 'WW\niiiiii', fontId: FONT_OPTIONS[0].id, heightMM: 100, spacingMM, styleId: STYLES[0].id }
      harness.states[0] = draft
      harness.states[3] = { id: draft.fontId, font }
      const tree = nodes(Editor())
      tree.find(n => n.type === Range && n.props.label === 'กว้างจริง')!.props.onChange(1000.01)
      const fitted = harness.setters[0].mock.calls[0][0](draft)
      expect(bounds(actual.textToRegion(font, draft.text, fitted.heightMM, spacingMM)).w).toBeCloseTo(1000.01, 1)
    }
  } finally { vi.mocked(textToRegion).mockImplementation(original) }
})

it('commits Enter through blur once and does not commit unchanged sizes', () => {
  const onChange = vi.fn()
  const input = nodes(Range({ label: 'size', unit: 'mm', value: 10, min: 1, max: 100, step: 1, onChange })).find(n => n.type === 'input')!
  input.props.onBlur({ target: { value: '10' } })
  expect(onChange).not.toHaveBeenCalled()
  const blur = vi.fn(() => input.props.onBlur({ target: { value: '20' } }))
  input.props.onKeyDown({ key: 'Enter', currentTarget: { blur } })
  expect(blur).toHaveBeenCalledOnce()
  expect(onChange).toHaveBeenCalledExactlyOnceWith(20)
})

it('restores the measured size when a parent cannot apply the requested dimension', () => {
  const onChange = vi.fn()
  const input = nodes(Range({ label: 'กว้างจริง', unit: 'มม.', value: 400, min: 1, max: 100000, step: 0.01, slider: false, onChange })).find(n => n.type === 'input')!
  input.props.onFocus()
  input.props.onChange({ target: { value: '9000' } })
  input.props.onBlur({ target: { value: '9000' } })
  expect(onChange).toHaveBeenCalledExactlyOnceWith(9000)
  // A font already at its upper limit can leave the actual width at 400.
  // No changed-value effect runs in that case, so blur must restore it.
  expect(harness.setters[0]).toHaveBeenLastCalledWith('400')
})

it('retains old opal picks and new printed-opal picks through project sanitation', () => {
  const id = STYLES[0].id
  expect(cleanDraft({ materials: { [id]: { A: 'opal', B: 'opalprint' } } }).materials).toEqual({ [id]: { A: 'opal', B: 'opalprint' } })
})

for (const style of STYLES.filter(s => s.params.some(p => p.key === 'seatLip'))) {
  it(`${style.code} lists each lip immediately after its wall in step 4`, () => {
    harness.states[0] = { ...cleanDraft({}), source: 'text', text: 'AB', fontId: FONT_OPTIONS[0].id, styleId: style.id, values: { [style.id]: { seatLip: 1 } } }
    harness.states[1] = 4
    harness.states[3] = { id: FONT_OPTIONS[0].id, font: {} }
    const tree = nodes(Editor())
    const rows = tree.filter(n => n.type === 'tr' && nodes(n.props.children).some(c => c.props.className === 'addon-note'))
    expect(rows.length).toBeGreaterThan(0)
    const allRows = tree.filter(n => n.type === 'tr')
    for (const row of rows) {
      const note = nodes(row.props.children).find(n => n.type === 'small')!
      const wall = note.props.children[1]
      const preceding = allRows.slice(0, allRows.indexOf(row)).reverse()
      const previousPart = preceding.find(r => !nodes(r.props.children).some(c => c.props.className === 'addon-note'))!
      expect(nodes(previousPart.props.children).some(n => n.props.className === 'layer-code' && n.props.children === wall)).toBe(true)
    }
    const viewer = tree.find(n => n.type === 'viewer')!
    ;(viewer.props.parts as { geometry: { dispose(): void } }[]).forEach(p => p.geometry.dispose())
  })
}

it('disables DXF when every sheet is hidden and allows changing export visibility in step 4', () => {
  harness.states[0] = { ...cleanDraft({}), source: 'text', text: 'AB', fontId: FONT_OPTIONS[0].id, styleId: STYLES[0].id }
  harness.states[1] = 4
  harness.states[3] = { id: FONT_OPTIONS[0].id, font: {} }
  harness.states[10] = new Set(['A', 'D'])
  const tree = nodes(Editor())
  const dxf = tree.find(n => n.type === 'button' && String(n.props.children).includes('DXF'))!
  expect(dxf.props.disabled).toBe(true)
  const visibility = tree.find(n => n.type === 'input' && n.props['aria-label']?.startsWith('ส่งออก D '))!
  expect(visibility.props.checked).toBe(false)
  visibility.props.onChange()
  expect(harness.setters[10].mock.calls[0][0](new Set(['A', 'D']))).toEqual(new Set(['A']))
  harness.index = 0
  harness.states[10] = new Set(['A'])
  expect(nodes(Editor()).find(n => n.type === 'button' && String(n.props.children).includes('DXF'))!.props.disabled).toBe(false)
})

it('clamps live sheet rates with the same limits used for saved rates', () => {
  harness.states[0] = { ...cleanDraft({}), source: 'text', text: 'AB', fontId: FONT_OPTIONS[0].id, styleId: STYLES[0].id }
  harness.states[1] = 4
  harness.states[3] = { id: FONT_OPTIONS[0].id, font: {} }
  const tree = nodes(Editor())
  const input = tree.find(n => n.type === 'input' && String(n.props['aria-label']).includes('\u0e15\u0e23.\u0e21.'))!
  expect(input).toBeDefined()
  input.props.onChange({ target: { value: '1e308' } })
  const update = harness.setters[14].mock.calls.at(-1)![0]
  const rates = update({ shop: '', filament: 450, sheet: {}, led: 0, psu: 0, labour: 0, margin: 0 })
  expect(Object.values(rates.sheet)).toEqual([1_000_000])
})
it('keeps imported block identities, order, fonts and placement through a share and project round trip', async () => {
  const { encodeShare, decodeShare } = await import('../lib/share')
  const blocks = [{ id: 'first', text: 'ข้อความรอง', fontId: FONT_OPTIONS[1].id, heightMM: 42, spacingMM: 3, x: 123, y: -85 }]
  const saved = cleanDraft({ blocks })
  expect(cleanDraft(decodeShare('#d=' + encodeShare(saved))!).blocks).toEqual(blocks)
  expect(cleanDraft(JSON.parse(JSON.stringify(saved))).blocks).toEqual(blocks)
  expect(cleanDraft({}).blocks).toEqual([])
})

it('blocks incomplete manufacturing exports until every nonempty block has its font and valid outline', () => {
  const draft = { ...cleanDraft({}), source: 'text', text: 'AB', fontId: FONT_OPTIONS[0].id, styleId: STYLES[0].id,
    blocks: [{ id: 'a', text: 'extra', fontId: FONT_OPTIONS[1].id, heightMM: 50, spacingMM: 0, x: 0, y: -100 }] }
  harness.states[0] = draft
  harness.states[1] = 4
  harness.states[3] = { id: draft.fontId, font: {} }
  const zip = () => nodes(Editor()).find(n => n.type === 'button' && String(n.props.children).includes('ZIP'))!
  expect(zip().props.disabled).toBe(true)
  harness.index = 0
  harness.states[20] = { [FONT_OPTIONS[1].id]: {} }
  expect(zip().props.disabled).toBe(false)
  harness.index = 0
  const shapeText = vi.mocked(textToRegion).getMockImplementation()!
  vi.mocked(textToRegion).mockImplementationOnce(shapeText).mockImplementationOnce(() => [])
  expect(zip().props.disabled).toBe(true)
})

it('moves keyboard focus into the scene panel and restores the opener when closed', () => {
  harness.states[23] = true
  const tree = nodes(Editor())
  const panel = tree.find(n => n.props.id === 'scene-panel')!
  const previous = { isConnected: true, focus: vi.fn() }
  const focus = vi.fn()
  panel.props.ref.current = { ownerDocument: { activeElement: previous }, focus }
  const cleanup = harness.effects.at(-1)!() as () => void
  expect(focus).toHaveBeenCalledOnce()
  cleanup()
  expect(previous.focus).toHaveBeenCalledOnce()
})
it('warns when only an extra block uses a custom font in a share link', async () => {
  harness.states[0] = { ...cleanDraft({}), source: 'text', text: 'AB', fontId: FONT_OPTIONS[0].id, styleId: STYLES[0].id,
    blocks: [{ id: 'a', text: 'extra', fontId: CUSTOM_FONT_ID, heightMM: 50, spacingMM: 0, x: 0, y: -100 }] }
  harness.states[1] = 4
  const tree = nodes(Editor())
  vi.stubGlobal('window', { location: { origin: 'https://example.test' } })
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => {}) } })
  try {
    await tree.find(n => n.type === 'button' && String(n.props.children).includes('คัดลอกลิงก์แชร์แบบ'))!.props.onClick()
    expect(harness.setters[5]).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('ฟอนต์ของคุณไม่ได้ไปกับลิงก์') }))
  } finally { vi.unstubAllGlobals() }
})
