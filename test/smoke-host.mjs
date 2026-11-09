/** Local harness: run the Host half without Cordis and inspect the graph. */
import { apply } from 'file:///D:/dsh-plugins/dsh-memory-starmap/index.js'

const routes = []
const ctx = {
  get: () => undefined,
  effect: (fn) => { fn() },
  webServer: { register: (route) => { routes.push(route); return () => {} } },
}
apply(ctx, { mnemonHome: 'C:/Users/12764/.mnemon' })

const req = {
  method: 'GET',
  url: '/api/dsh-memory-starmap/graph',
  socket: { remoteAddress: '127.0.0.1' },
  headers: { host: '127.0.0.1:28675' },
}

const chunks = []
const res = {
  writeHead: (status, headers) => { res.status = status },
  end: (payload) => { chunks.push(payload) },
}

const started = Date.now()
await routes[0].handler(req, res)
const ms = Date.now() - started
const body = JSON.parse(chunks.join(''))
console.log('status', res.status, 'ms', ms, 'bytes', chunks.join('').length)
console.log('stats', JSON.stringify(body.stats))
console.log('roots', JSON.stringify(body.roots))
console.log('warnings', JSON.stringify(body.warnings))

const kinds = {}
for (const node of body.nodes) kinds[node.kind] = (kinds[node.kind] ?? 0) + 1
console.log('node kinds', JSON.stringify(kinds))
const edgeKinds = {}
for (const edge of body.edges) edgeKinds[edge.kind] = (edgeKinds[edge.kind] ?? 0) + 1
console.log('edge kinds', JSON.stringify(edgeKinds))

const heavy = [...body.nodes].sort((a, b) => b.weight - a.weight).slice(0, 8)
for (const node of heavy) console.log('top', node.kind, node.weight, '|', node.label.slice(0, 48))
console.log('sample doc', JSON.stringify(body.nodes.find((n) => n.kind === 'document')).slice(0, 420))
console.log('sample skill', JSON.stringify(body.nodes.find((n) => n.kind === 'skill')).slice(0, 300))
console.log('sample runtime', JSON.stringify(body.nodes.find((n) => n.kind === 'runtime')).slice(0, 300))
const semantic = body.edges.filter((e) => e.kind === 'semantic').slice(0, 3)
console.log('semantic sample', JSON.stringify(semantic))
const skillEdges = body.edges.filter((e) => e.kind === 'skill')
console.log('skill edges', skillEdges.length, JSON.stringify(skillEdges.slice(0, 3)))
const runtimeEdges = body.edges.filter((e) => e.kind === 'runtime').length
console.log('runtime edges', runtimeEdges)