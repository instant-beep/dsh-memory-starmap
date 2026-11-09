// Dump the heart layout exactly as the engine computes it, so the geometry can be
// rendered offline and eyeballed before shipping.
import { readFileSync, writeFileSync } from 'node:fs'

const fixture = JSON.parse(readFileSync(new URL('./fixture-graph.json', import.meta.url), 'utf8'))

function heartOutline(t) {
  const s = Math.sin(t)
  const x = (16 * s * s * s) / 16
  const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17
  return [x, y]
}
const HEART_Y_OFFSET = 0.145
const HEART_DEPTH = 0.62
const HEART_ARC = (() => {
  const steps = 512
  const points = []
  for (let index = 0; index <= steps; index += 1) points.push(heartOutline((index / steps) * Math.PI * 2))
  const lengths = [0]
  for (let index = 1; index <= steps; index += 1) {
    const [ax, ay] = points[index - 1]
    const [bx, by] = points[index]
    lengths.push(lengths[index - 1] + Math.hypot(bx - ax, by - ay))
  }
  const total = lengths[steps]
  const table = []
  let cursor = 0
  for (let index = 0; index <= 720; index += 1) {
    const target = (index / 720) * total
    while (cursor < steps - 1 && lengths[cursor + 1] < target) cursor += 1
    const span = lengths[cursor + 1] - lengths[cursor] || 1
    const local = (target - lengths[cursor]) / span
    table.push(((cursor + local) / steps) * Math.PI * 2)
  }
  return table
})()
function heartAt(fraction) {
  const index = Math.min(720, Math.max(0, Math.round(fraction * 720)))
  return heartOutline(HEART_ARC[index])
}
function hashCode(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}
function pseudoRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}
function clusterSpread(count) {
  return 240 + Math.sqrt(count) * 46
}

const nodes = fixture.nodes.map((node) => ({ ...node }))
const byWeight = nodes.slice().sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))
byWeight.forEach((node, index) => { node.spriteRank = index })

const total = nodes.length
const spread = clusterSpread(total)
const scale = Math.max(300, spread * 0.5)
const rng = pseudoRandom(hashCode('heart:' + total))
const offset = rng()

const outlineCount = Math.max(12, Math.round(total * 0.38))
const placed = nodes.map((node) => {
  const rank = total > 1 ? (node.spriteRank ?? 0) / (total - 1) : 0
  const random = pseudoRandom(hashCode('h' + node.id))
  const pour = random()
  const [ux, uy] = heartAt(pour)
  const onOutline = (node.spriteRank ?? 0) < outlineCount
  const shell = onOutline ? 0.94 + random() * 0.06 : 0.08 + random() * 0.84
  const radius = shell * (0.99 + random() * 0.02)
  const side = random() < 0.5 ? 1 : -1
  const bulge = Math.sqrt(Math.max(0, 1 - radius * radius)) * HEART_DEPTH
  return {
    id: node.id,
    kind: node.kind,
    rank,
    shell,
    onOutline,
    x: ux * radius * scale,
    y: (uy + HEART_Y_OFFSET) * radius * scale,
    z: side * bulge * scale,
  }
})

writeFileSync(new URL('./heart-layout.json', import.meta.url), JSON.stringify({ scale, nodes: placed }, null, 0))
console.log('scale', scale.toFixed(1), 'nodes', placed.length)
const xs = placed.map((p) => p.x), ys = placed.map((p) => p.y), zs = placed.map((p) => p.z)
console.log('bbox x', Math.min(...xs).toFixed(0), Math.max(...xs).toFixed(0),
  'y', Math.min(...ys).toFixed(0), Math.max(...ys).toFixed(0),
  'z', Math.min(...zs).toFixed(0), Math.max(...zs).toFixed(0))
const shells = placed.map((p) => p.shell)
console.log('shell min/mean/max', Math.min(...shells).toFixed(2), (shells.reduce((a,b)=>a+b,0)/shells.length).toFixed(2), Math.max(...shells).toFixed(2))
