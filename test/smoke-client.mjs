/**
 * Headless smoke test for the StarMap client half.
 *
 * Builds a minimal React/DOM/Canvas harness, loads client.js through the real
 * __ModuleLoader__ contract, renders the panel, then drives the engine for a
 * few hundred frames across every layout, range and focus state.
 */
import { existsSync, readFileSync } from 'node:fs'

/** Fixture: any captured `/api/dsh-memory-starmap/graph` body. Point STARMAP_FIXTURE at one. */
const fixturePath = process.env.STARMAP_FIXTURE ?? new URL('./fixture-graph.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1')
if (!existsSync(fixturePath)) {
  console.error(`capture a graph first: curl -s http://127.0.0.1:28675/api/dsh-memory-starmap/graph -o ${fixturePath}`)
  process.exit(1)
}
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))

// ---------------------------------------------------------------- mini react
const state = { hooks: [], effects: [], index: 0, ended: [] }
let current

function createElement(type, props, ...children) {
  const element = { type, props: props ?? {}, children: children.flat() }
  if (element.props.ref !== undefined) element.ref = element.props.ref
  return element
}
function useState(initial) {
  const index = state.index++
  if (!(index in state.hooks)) state.hooks[index] = typeof initial === 'function' ? initial() : initial
  return [state.hooks[index], (value) => {
    state.hooks[index] = typeof value === 'function' ? value(state.hooks[index]) : value
  }]
}
function useRef(initial) {
  const index = state.index++
  if (!(index in state.hooks)) state.hooks[index] = { current: initial }
  return state.hooks[index]
}
function useEffect(fn, deps) {
  const index = state.index++
  state.effects.push({ index, fn, deps })
}
function useMemo(fn) {
  state.index++
  return fn()
}
const React = { createElement, useState, useEffect, useRef, useMemo, Fragment: 'Fragment' }

// ---------------------------------------------------------------- fake dom
const created = []
function makeContext() {
  const noop = () => {}
  const gradient = { addColorStop: noop }
  return {
    canvas: undefined,
    setTransform: noop, clearRect: noop, fillRect: noop, beginPath: noop, closePath: noop,
    arc: noop, fill: noop, stroke: noop, moveTo: noop, lineTo: noop, quadraticCurveTo: noop, rect: noop, roundRect: noop, setLineDash: noop, ellipse: noop, createPattern: () => null, measureText: () => ({ width: 120 }),
    bezierCurveTo: noop, fillText: noop, drawImage: noop, save: noop, restore: noop,
    translate: noop, scale: noop, rotate: noop,
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    textAlign: 'start', textBaseline: 'alphabetic', font: '', fillStyle: '', strokeStyle: '',
    lineWidth: 1, lineCap: 'butt', globalAlpha: 1,
  }
}
function makeCanvas() {
  const context = makeContext()
  const canvas = {
    tagName: 'CANVAS',
    width: 0,
    height: 0,
    style: {},
    dataset: {},
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 1280, height: 760, left: 0, top: 0, top2: 0 }),
    addEventListener: () => {},
    removeEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    focus: () => {},
  }
  context.canvas = canvas
  created.push(canvas)
  return canvas
}
function makeNode(tag) {
  if (tag === 'canvas') return makeCanvas()
  return {
    tagName: String(tag).toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    appendChild() {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}

const frames = []
const dom = {
  createElement: (tag) => makeNode(tag),
  createTextNode: (text) => ({ text }),
}
const win = {
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  addEventListener: () => {},
  removeEventListener: () => {},
  requestAnimationFrame: (callback) => { frames.push(callback); return frames.length },
  cancelAnimationFrame: () => {},
  setTimeout,
  clearTimeout,
}
globalThis.window = win
globalThis.document = dom
globalThis.requestAnimationFrame = win.requestAnimationFrame
globalThis.cancelAnimationFrame = win.cancelAnimationFrame
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback }
  observe() { this.callback() }
  disconnect() {}
}

function flush(framecount = 1) {
  for (let step = 0; step < framecount; step += 1) {
    const batch = frames.splice(0, frames.length)
    if (batch.length === 0) return step
    for (const callback of batch) callback(1000 + step * 16)
  }
  return framecount
}

// ---------------------------------------------------------------- loader
let plugin
win.__ModuleLoader__ = {
  load({ id, factory }) {
    if (id !== '@local/dsh-memory-starmap') throw new Error(`unexpected module id ${id}`)
    plugin = factory((name) => {
      if (name === 'react') return React
      throw new Error(`unexpected require(${name})`)
    })
  },
}

await import('file:///D:/dsh-plugins/dsh-memory-starmap/client.js')
if (plugin === undefined) throw new Error('client module did not load')

// ---------------------------------------------------------------- apply
const registered = { panes: [], mains: [], dicts: [] }
const fakeCtx = {
  effect: (fn) => { const dispose = fn(); return dispose },
  locale: {
    register: (namespace, dictionaries) => { registered.dicts.push({ namespace, dictionaries }); return () => {} },
    bind: (namespace) => (key) => {
      const entry = registered.dicts.find((item) => item.namespace === namespace)
      const value = entry?.dictionaries?.zh?.[key] ?? entry?.dictionaries?.en?.[key]
      if (value === undefined) throw new Error(`missing locale key ${namespace}:${key}`)
      return value
    },
  },
  slots: {
    inject: (name, fn) => { fn(); return () => {} },
    register: (registration, component) => {
      if (registration.name === 'sidebar.panellist') registered.panes.push({ registration, component })
      else registered.mains.push({ registration, component })
      return () => {}
    },
  },
}
plugin.apply(fakeCtx)
if (registered.panes.length !== 1 || registered.mains.length !== 1) {
  throw new Error(`slot registration incomplete ${JSON.stringify(Object.keys(registered))}`)
}
const navLabel = registered.panes[0].registration.label
console.log('nav label:', navLabel(), '| order:', registered.panes[0].registration.order, '| main key:', registered.mains[0].registration.key)
console.log('icon renders:', typeof registered.panes[0].component === 'function' ? 'component' : typeof registered.panes[0].component)
const glyph = registered.panes[0].component({ size: 18, active: true })
console.log('glyph children:', glyph.children.length)

// ---------------------------------------------------------------- fetch mock
let fetchCount = 0
globalThis.fetch = async (url) => {
  fetchCount += 1
  if (url !== 'api/dsh-memory-starmap/graph') throw new Error(`unexpected fetch ${url}`)
  return { ok: true, status: 200, statusText: 'OK', json: async () => JSON.parse(JSON.stringify(fixture)) }
}

// ---------------------------------------------------------------- render loop
function render() {
  state.index = 0
  state.effects = []
  let element = registered.mains[0].component({})
  let guard = 0
  while (element !== null && typeof element === 'object' && typeof element.type === 'function' && guard < 10) {
    element = element.type(element.props ?? {})
    guard += 1
  }
  return element
}
function collectRefs(element) {
  if (element === null || typeof element !== 'object') return
  if (element.props?.ref !== undefined) {
    element.props.ref.current = makeNode(element.type)
  }
  for (const child of element.children ?? []) collectRefs(child)
}
async function runEffects() {
  const pending = state.effects
  state.effects = []
  for (const effect of pending) {
    const result = effect.fn()
    state.ended.push(result)
  }
}

let tree = render()
collectRefs(tree)
await runEffects()
await new Promise((resolve) => setTimeout(resolve, 30))
tree = render()
collectRefs(tree)
await runEffects()
await new Promise((resolve) => setTimeout(resolve, 30))

console.log('fetch calls:', fetchCount)
const stage = tree.children.find((child) => child?.props?.className === 'dsh-msm-stage')
if (stage === undefined) throw new Error('stage not rendered')
console.log('stage children:', stage.children.filter(Boolean).length)

// the canvas effect created the engine; drive it
const canvas = created.find((item) => item.width > 0)
if (canvas === undefined) throw new Error('engine did not size the canvas')

// reach the engine through the module-level ref captured by the component
// (the component closed over it, so walk frames instead)
flush(1)
console.log('canvas size:', canvas.width, 'x', canvas.height, '| sprites so far:', created.filter((c) => c.width === 96).length)

// find the engine instance through the ref the component closed over
function findEngine() {
  const hook = state.hooks.find((item) => item && item.current && Array.isArray(item.current.nodes) && typeof item.current.paint === 'function')
  return hook?.current
}
const map = findEngine()
if (map === undefined) throw new Error('engine instance not reachable')

console.log('nodes:', map.nodes.length, 'edges:', map.edges.length, 'dist:', Math.round(map.view.dist), 'yaw:', map.view.yaw.toFixed(2))
const bounds = (list) => {
  const xs = list.map((node) => node.x)
  const ys = list.map((node) => node.y)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

flush(600)
const b1 = bounds(map.nodes)
console.log('after settling bounds:', Math.round(b1.w), 'x', Math.round(b1.h), '| dist:', Math.round(map.view.dist), '| alpha:', map.alpha.toFixed(3), '| depth spread:', Math.round(Math.max(...map.nodes.map((n) => n.z)) - Math.min(...map.nodes.map((n) => n.z))))
const bad = map.nodes.filter((node) => !Number.isFinite(node.x) || !Number.isFinite(node.y))
console.log('non-finite nodes:', bad.length)
if (bad.length > 0) throw new Error('layout produced NaN coordinates')

// pick round trip: screen -> world -> node
const sample = map.nodes.find((node) => node.kind === 'document')
const screen = map.toScreen(sample.x, sample.y, sample.z)
const picked = map.pick(screen.x, screen.y)
console.log('pick hit:', picked?.id === sample.id, '| screen:', Math.round(screen.x), Math.round(screen.y))

// shortest-path tracing between two stars
const docs = map.nodes.filter((node) => node.kind === 'document')
const from = docs.find((node) => map.degree.get(node.id) >= 2) ?? docs[0]
const far = docs.find((node) => node !== from && map.degree.get(node.id) >= 2) ?? docs[1]
map.select(from)
map.select(far, { trace: true })
console.log('traced path:', map.path === undefined ? 'none' : `${map.path.length} hops, ${map.path.nodes.size} stars, ${map.path.edges.size} edges`)
if (map.path !== undefined && map.path.length < 1) throw new Error('trace produced an empty chain')
map.select(undefined)
console.log('path cleared:', map.path === undefined)

// card payload exposes addressable conversation ids for navigation
const docStar = map.nodes.find((node) => node.kind === 'document')
const exposed = map.exposeNode(docStar)
const sessionNeighbours = exposed.relations.filter((relation) => relation.nodeKind === 'session')
console.log('doc card relations:', exposed.relations.length, '| with sessionId:', sessionNeighbours.filter((r) => typeof r.sessionId === 'string').length, '| relatedSessionId:', typeof exposed.relatedSessionId)
if (sessionNeighbours.length > 0 && exposed.relatedSessionId === undefined) throw new Error('document star cannot reach its conversation')
const sessionStar = map.nodes.find((node) => node.kind === 'session' && typeof node.meta?.sessionId === 'string')
console.log('session star addressable:', sessionStar === undefined ? 'none' : sessionStar.meta.sessionId.slice(0, 8))

// handoff note: paste-ready markdown built from the live map
const handoff = map.handoff(map.exposeNode(docStar))
const handoffLines = handoff.split(String.fromCharCode(10))
console.log('handoff:', handoffLines.length, 'lines /', handoff.length, 'bytes | head:', handoffLines[0])
if (!handoff.includes('# 上下文交接')) throw new Error('handoff note has no heading')
if (!handoff.includes('## 最近记忆')) throw new Error('handoff note has no memory section')
if (handoffLines.length < 10) throw new Error('handoff note is too thin to be useful')

// focus + selection path used by the card
map.select(sample)
console.log('highlight size:', map.highlight.size, '| degree:', map.degree.get(sample.id))
flush(20)
map.focusOn(sample)
flush(30)
console.log('camera after focus: dist', Math.round(map.view.dist), 'yaw', map.view.yaw.toFixed(2))

for (const layout of ['orbital', 'cluster', 'force']) {
  map.setLayout(layout)
  flush(60)
  const b = bounds(map.nodes)
  console.log(`layout ${layout}: bounds ${Math.round(b.w)}x${Math.round(b.h)}`)
}
for (const days of [30, 90, 0]) {
  map.setRange(days)
  flush(10)
  const visible = map.nodes.filter((node) => map.lodVisible(node)).length
  console.log(`range ${days}: visible ${visible}`)
}
// layered layout: each kind settles at its own height
map.setLayout('layers')
flush(200)
const strata = new Map()
for (const node of map.nodes) {
  const list = strata.get(node.kind) ?? []
  list.push(node.y)
  strata.set(node.kind, list)
}
const meanY = Object.fromEntries([...strata].map(([kind, list]) => [kind, Math.round(list.reduce((total, value) => total + value, 0) / list.length)]))
console.log('strata mean y:', JSON.stringify(meanY))
if (!(meanY.document > meanY.session && meanY.session > meanY.file)) throw new Error('strata ordering is wrong')
map.setLayout('force')
flush(40)

// replay: partial playhead hides stars that had not appeared yet
map.setPlayhead(0.35)
flush(4)
const lit = map.nodes.filter((node) => map.lodVisible(node)).length
console.log('replay at 35%: lit', lit, 'of', map.nodes.length)
if (!(lit < map.nodes.length)) throw new Error('replay did not hide unborn stars')
map.setPlayhead(1)
flush(4)
console.log('replay at 100%: lit', map.nodes.filter((node) => map.lodVisible(node)).length)

map.setHiddenKinds(new Set(['file']))
flush(10)
console.log('hidden file -> visible', map.nodes.filter((node) => map.lodVisible(node)).length)
map.setHiddenKinds(new Set())
map.select(undefined)

// LOD switch
map.view.dist = 3200
map.view.target.dist = 3200
flush(5)
const lodLow = map.nodes.filter((node) => map.lodVisible(node)).length
map.view.dist = 480
map.view.target.dist = 480
flush(5)
const lodHigh = map.nodes.filter((node) => map.lodVisible(node)).length
console.log('lod low/high visible:', lodLow, '/', lodHigh)
if (!(lodHigh > lodLow)) throw new Error('level of detail did not react to zoom')

// pan + wheel handlers
map.onPointerDown({ offsetX: 400, offsetY: 300, pointerId: 1 })
map.onPointerMove({ target: map.canvas, clientX: 460, clientY: 340 })
map.onPointerUp({ pointerId: 1 })
map.onWheel({ preventDefault: () => {}, offsetX: 600, offsetY: 400, deltaY: -220 })
flush(20)
console.log('camera after orbit/zoom: yaw', map.view.yaw.toFixed(2), 'pitch', map.view.pitch.toFixed(2), 'dist', Math.round(map.view.dist))
console.log('projection sanity:', JSON.stringify(map.view.project(0, 0, 0, 1280, 760)), 'near', JSON.stringify(map.view.project(0, 0, 800, 1280, 760)))
map.dispose()
for (const cleanup of state.ended.splice(0)) {
  if (typeof cleanup === 'function') cleanup()
}
console.log('SMOKE_OK frames:', frames.length)
process.exit(0)
