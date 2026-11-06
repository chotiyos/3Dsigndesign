import { isValidElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ index: 0, id: 0, states: [] as unknown[], setters: [] as ReturnType<typeof vi.fn>[], effects: [] as (() => unknown)[] }))
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
vi.mock('../router', () => ({ useTitle() {}, useLocation: () => ({ query: new URLSearchParams() }), Link: 'a' }))
vi.mock('../lib/account', () => ({ useDemo: () => ({}), credits: () => 100, EXPORT_COST: {}, spend: vi.fn() }))
vi.mock('../lib/artwork', () => ({
  textToRegion: (_font: unknown, text: string, height: number, spacing: number) => [[
    [0, 0], [height * 2 + spacing, 0], [height * 2 + spacing, height * (text.includes('\n') ? 2 : 1)], [0, height * (text.includes('\n') ? 2 : 1)],
  ]],
  svgToRegion: () => [], imageToRegion: () => [], readImage: vi.fn(),
}))
vi.mock('../three/Viewer', () => ({ Viewer: 'viewer' }))
import Editor, { cleanDraft, portableDraft, Range } from './Editor'
import { CUSTOM_FONT_ID, FONT_OPTIONS } from '../lib/fonts'
import { STYLES } from '../lib/styles'

function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!isValidElement<{ children?: ReactNode }>(node)) return []
  return [node as any, ...nodes(node.props.children)]
}
beforeEach(() => { harness.index = 0; harness.id = 0; harness.states = []; harness.setters = []; harness.effects = [] })

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
