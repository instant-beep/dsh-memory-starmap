/**
 * Memory constellation view — Host half.
 *
 * Reads the live memory system of this profile and derives one graph:
 *
 *   documents  (~/.mnemon/documents/index.json + active/*.md frontmatter)
 *   sessions   (document.sessionIds — the conversation a memory came from)
 *   files      (document.sourcePaths — the code a memory describes)
 *   runtime    (~/.mnemon/runtime/USER.md + MEMORY.md, split on `§`)
 *   skills     (~/.dsh/skills, ~/.agents/skills, project roots, built-ins)
 *   spaces     (mnemon-native insights/edges — reported as pending when the
 *               provider is not installed; never invented)
 *
 * Edges carry the four memory relations the recent memory-graph projects use
 * (mem0 / graphiti: temporal + entity; Understand-Anything: semantic proximity):
 * `session`, `file`, `body` are provenance edges, `semantic` is TF-IDF
 * nearest-neighbour, `runtime` / `skill` are the reference edges that tie a
 * remembered fact back to what it talks about.
 *
 * Everything is read-only. The single route is loopback-only.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, posix, sep } from 'node:path'

export const name = 'memory-starmap'
export const inject = ['webServer']

const ROUTE = '/api/dsh-memory-starmap/graph'
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

/** Description text never needs to be longer than a star card. */
const MAX_DESCRIPTION = 420
/** At most this many semantic neighbours per document. */
const SEMANTIC_PER_DOC = 3
const SEMANTIC_MIN_COSINE = 0.16
const CACHE_TTL_MS = 1500

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function writeJson(res, status, body) {
  res.writeHead(status, { ...JSON_HEADERS })
  res.end(JSON.stringify(body))
}

function isLoopbackAddress(address) {
  if (typeof address !== 'string') return false
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function isLoopbackHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

/** Local browser, same origin, no proxy hop. */
function isLoopbackRequest(request) {
  if (!isLoopbackAddress(request.socket?.remoteAddress)) return false
  if (request.headers['x-forwarded-for'] !== undefined) return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl
  try {
    hostUrl = new URL('http://' + host)
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function isLoopbackOnly(ctx, request) {
  if (isLoopbackRequest(request)) return true
  let pairing
  try {
    pairing = typeof ctx.get === 'function' ? ctx.get('remoteWebUiPairing', false) : undefined
  } catch {
    pairing = undefined
  }
  if (pairing === undefined || pairing === null || typeof pairing.isPairedDevice !== 'function') return false
  try {
    return pairing.isPairedDevice(request) === true
  } catch {
    return false
  }
}

async function readText(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

async function readJson(path) {
  const text = await readText(path)
  if (text === undefined) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

async function listDir(path) {
  try {
    return await readdir(path, { withFileTypes: true })
  } catch {
    return []
  }
}

async function mtimeOf(path) {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return 0
  }
}

function clip(value, max) {
  const text = typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : ''
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

function normalisePath(value) {
  return String(value).split(sep).join(posix.sep)
}

// ---------------------------------------------------------------------------
// documents
// ---------------------------------------------------------------------------

/** Minimal frontmatter reader: enough for `key: value` plus `- item` lists. */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return {}
  const end = text.indexOf('\n---', 3)
  if (end < 0) return {}
  const body = text.slice(3, end)
  const out = {}
  let key
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trimEnd()
    if (line.trim() === '') continue
    const listItem = /^\s*-\s+(.*)$/u.exec(line)
    if (listItem !== null && key !== undefined) {
      if (!Array.isArray(out[key])) out[key] = []
      out[key].push(unquote(listItem[1]))
      continue
    }
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line)
    if (pair === null) continue
    key = pair[1]
    const value = pair[2].trim()
    out[key] = value === '[]' ? [] : value === '' ? [] : unquote(value)
  }
  return out
}

function unquote(value) {
  const text = String(value).trim()
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1)
  }
  return text
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item !== '')
  if (typeof value === 'string' && value !== '') return [value]
  return []
}

function isoOrUndefined(value) {
  if (typeof value !== 'string' || value === '') return undefined
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString()
}

async function loadDocuments(mnemonHome, warnings) {
  const index = await readJson(join(mnemonHome, 'documents', 'index.json'))
  const listed = Array.isArray(index?.documents) ? index.documents : undefined
  if (listed !== undefined) {
    return listed.map((entry) => ({
      id: String(entry.id ?? entry.filename ?? Math.random()),
      title: clip(entry.title ?? '未命名档案', 160),
      description: clip(entry.description ?? '', MAX_DESCRIPTION),
      status: typeof entry.status === 'string' ? entry.status : 'active',
      filename: typeof entry.filename === 'string' ? entry.filename : undefined,
      relativePath: typeof entry.relativePath === 'string' ? normalisePath(entry.relativePath) : undefined,
      sessionIds: asArray(entry.sessionIds),
      sourcePaths: asArray(entry.sourcePaths).map(normalisePath),
      memoryBodyIds: asArray(entry.memoryBodyIds),
      createdAt: isoOrUndefined(entry.createdAt),
      updatedAt: isoOrUndefined(entry.updatedAt),
      lastAccessedAt: isoOrUndefined(entry.lastAccessedAt),
      sizeBytes: Number(entry.sizeBytes ?? 0) || 0,
    }))
  }

  // Fallback: the index is the control-plane truth, but a fresh checkout may
  // only carry the Markdown files.
  const dir = join(mnemonHome, 'documents', 'active')
  const files = (await listDir(dir)).filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  if (files.length === 0) {
    warnings.push(`未找到项目档案：${join(mnemonHome, 'documents')}`)
    return []
  }
  const out = []
  for (const file of files) {
    const text = await readText(join(dir, file.name))
    if (text === undefined) continue
    const meta = parseFrontmatter(text)
    out.push({
      id: String(meta.id ?? file.name.replace(/\.md$/u, '')),
      title: clip(meta.title ?? file.name.replace(/\.md$/u, ''), 160),
      description: clip(meta.description ?? '', MAX_DESCRIPTION),
      status: typeof meta.status === 'string' ? meta.status : 'active',
      filename: file.name,
      relativePath: posix.join('documents', 'active', file.name),
      sessionIds: asArray(meta.session_ids ?? meta.sessionIds),
      sourcePaths: asArray(meta.source_paths ?? meta.sourcePaths).map(normalisePath),
      memoryBodyIds: asArray(meta.memory_body_ids ?? meta.memoryBodyIds),
      createdAt: isoOrUndefined(meta.created_at ?? meta.createdAt),
      updatedAt: isoOrUndefined(meta.updated_at ?? meta.updatedAt),
      lastAccessedAt: isoOrUndefined(meta.last_accessed_at ?? meta.lastAccessedAt),
      sizeBytes: Buffer.byteLength(text, 'utf8'),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// runtime memory (MEMORY.md / USER.md)
// ---------------------------------------------------------------------------

async function loadRuntime(mnemonHome, warnings) {
  const dir = join(mnemonHome, 'runtime')
  const targets = [
    { file: 'USER.md', kind: 'user' },
    { file: 'MEMORY.md', kind: 'memory' },
  ]
  const out = []
  let sawAny = false
  for (const target of targets) {
    const text = await readText(join(dir, target.file))
    if (text === undefined) continue
    sawAny = true
    const chunks = text
      .split(/\n§\n|\n§/u)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk !== '')
    chunks.forEach((chunk, index) => {
      const heading = /^\[importance=([a-z]+)[^\]]*\]\s*([^\n]*)/u.exec(chunk)
      out.push({
        id: `${target.kind}:${index}`,
        kind: target.kind,
        title: clip(heading?.[2] ?? chunk.split('\n')[0] ?? chunk, 120),
        description: clip(chunk, MAX_DESCRIPTION),
        importance: heading?.[1] ?? 'normal',
      })
    })
  }
  if (!sawAny) warnings.push(`未找到运行时记忆：${dir}`)
  return out
}

// ---------------------------------------------------------------------------
// skills
// ---------------------------------------------------------------------------

function skillRoots(config, sessions) {
  const roots = []
  const push = (value) => {
    if (typeof value === 'string' && value !== '' && !roots.includes(value)) roots.push(value)
  }
  for (const root of Array.isArray(config.skillRoots) ? config.skillRoots : []) push(root)
  push(join(homedir(), '.dsh', 'skills'))
  push(join(homedir(), '.agents', 'skills'))
  for (const cwd of sessions) {
    if (typeof cwd !== 'string' || cwd === '') continue
    push(join(cwd, '.dsh', 'skills'))
    push(join(cwd, '.agents', 'skills'))
  }
  for (const root of builtinSkillRoots()) push(root)
  return roots
}

/** The preset package ships the built-in skill catalog; scan it read-only. */
function builtinSkillRoots() {
  const candidates = []
  const preset = join('node_modules', '@deepseek-ai', 'dsh-agent-preset', 'skills')
  try {
    const require = createRequire(import.meta.url)
    candidates.push(join(dirname(require.resolve('@deepseek-ai/dsh-agent-preset/package.json')), 'skills'))
  } catch {
    /* not resolvable from this checkout */
  }
  const profileDir = process.env.DSH_PROFILE_DIR
  if (typeof profileDir === 'string' && profileDir !== '') candidates.push(join(profileDir, preset))
  // Electron desktop layout: <app>/resources/app/dsh/node_modules/...
  const exe = process.execPath
  if (typeof exe === 'string' && exe !== '') {
    candidates.push(join(dirname(exe), 'resources', 'app', 'dsh', preset))
    candidates.push(join(dirname(exe), '..', 'resources', 'app', 'dsh', preset))
    candidates.push(join(dirname(exe), '..', '..', 'resources', 'app', 'dsh', preset))
  }
  candidates.push(join(homedir(), 'AppData', 'Local', 'Programs', 'deepseek-harness', 'resources', 'app', 'dsh', preset))
  const seen = new Set()
  const out = []
  for (const candidate of candidates) {
    const normalised = normalisePath(candidate)
    if (seen.has(normalised)) continue
    seen.add(normalised)
    if (existsSync(candidate)) out.push(candidate)
  }
  return out
}

async function loadSkills(roots) {
  const seen = new Map()
  for (const root of roots) {
    const entries = await listDir(root)
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const dir = join(root, entry.name)
      const file = join(dir, 'SKILL.md')
      if (!existsSync(file)) continue
      const text = await readText(file)
      if (text === undefined) continue
      const meta = parseFrontmatter(text)
      const name = typeof meta.name === 'string' && meta.name !== '' ? meta.name : entry.name
      if (seen.has(name)) continue
      seen.set(name, {
        id: name,
        title: name,
        description: clip(meta.description ?? '', MAX_DESCRIPTION),
        enabled: meta['disable-model-invocation'] === 'true' ? false : true,
        root: normalisePath(root),
        directory: entry.name,
      })
    }
  }
  return [...seen.values()].sort((left, right) => left.title.localeCompare(right.title))
}

// ---------------------------------------------------------------------------
// semantic neighbours (zero-dependency TF-IDF cosine)
// ---------------------------------------------------------------------------

const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'when', 'then', 'than', 'them', 'they',
  'have', 'has', 'not', 'but', 'are', 'was', 'were', 'its', 'it', '一个', '并且', '以及', '所以', '通过',
  'dsh', 'harness',
])

function tokenize(text) {
  const out = []
  const lowered = String(text).toLowerCase()
  for (const word of lowered.match(/[a-z][a-z0-9-]{3,}/gu) ?? []) {
    if (STOP.has(word)) continue
    out.push(word)
    if (word.includes('-')) for (const part of word.split('-')) if (part.length > 3 && !STOP.has(part)) out.push(part)
  }
  // CJK bigrams keep Chinese titles comparable without a dictionary.
  for (const run of lowered.match(/[\u4e00-\u9fff]{2,}/gu) ?? []) {
    for (let index = 0; index + 1 < run.length; index += 1) out.push(run.slice(index, index + 2))
  }
  return out
}

function tfidfVectors(documents) {
  const docs = documents.map((document) => {
    const tokens = tokenize(`${document.title} ${document.description}`)
    const counts = new Map()
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
    return counts
  })
  const df = new Map()
  for (const counts of docs) for (const token of counts.keys()) df.set(token, (df.get(token) ?? 0) + 1)
  const total = documents.length
  return docs.map((counts) => {
    const vector = new Map()
    let norm = 0
    for (const [token, count] of counts) {
      const idf = Math.log(1 + total / (1 + (df.get(token) ?? 1)))
      const value = (1 + Math.log(count)) * idf
      vector.set(token, value)
      norm += value * value
    }
    return { vector, norm: Math.sqrt(norm) }
  })
}

function cosine(left, right) {
  if (left.norm === 0 || right.norm === 0) return 0
  const [small, large] = left.vector.size <= right.vector.size ? [left.vector, right.vector] : [right.vector, left.vector]
  let dot = 0
  for (const [token, value] of small) {
    const other = large.get(token)
    if (other !== undefined) dot += value * other
  }
  return dot / (left.norm * right.norm)
}

// ---------------------------------------------------------------------------
// graph
// ---------------------------------------------------------------------------

/** Skill names become matcher tokens so a skill can claim the memories about it. */
function skillTokens(skills) {
  return skills.map((skill) => {
    const tokens = new Set(tokenize(skill.id.replace(/[-_]/gu, ' ')))
    for (const part of skill.id.split('-')) if (part.length > 3) tokens.add(part)
    return { skill, tokens: [...tokens] }
  })
}

function buildGraph({ documents, runtime, skills, spaces, sessionsCwds, roots, warnings }) {
  const nodes = []
  const edges = []
  const nodeIndex = new Map()

  const addNode = (node) => {
    if (nodeIndex.has(node.id)) {
      const existing = nodeIndex.get(node.id)
      existing.weight += node.weight ?? 0
      return existing
    }
    const created = { ...node, weight: node.weight ?? 0 }
    nodeIndex.set(created.id, created)
    nodes.push(created)
    return created
  }
  const addEdge = (source, target, kind, w = 1) => {
    if (source === target) return
    edges.push({ s: source, t: target, kind, w })
  }

  // --- documents -----------------------------------------------------------
  for (const document of documents) {
    const age = document.lastAccessedAt ?? document.updatedAt ?? document.createdAt
    addNode({
      id: `doc:${document.id}`,
      kind: 'document',
      label: document.title,
      sub: document.description,
      ts: age,
      created: document.createdAt,
      group: document.status === 'archived' ? 'archived' : 'active',
      weight: 3 + Math.min(6, Math.round(document.sizeBytes / 4000)),
      meta: {
        status: document.status,
        sizeBytes: document.sizeBytes,
        relativePath: document.relativePath,
        updatedAt: document.updatedAt,
        lastAccessedAt: document.lastAccessedAt,
      },
    })
  }

  // --- provenance stars ----------------------------------------------------
  const sessionCount = new Map()
  const fileCount = new Map()
  for (const document of documents) {
    for (const sessionId of document.sessionIds) {
      sessionCount.set(sessionId, (sessionCount.get(sessionId) ?? 0) + 1)
      addEdge(`doc:${document.id}`, `session:${sessionId}`, 'session', 1)
    }
    for (const path of document.sourcePaths) {
      fileCount.set(path, (fileCount.get(path) ?? 0) + 1)
      addEdge(`doc:${document.id}`, `file:${path}`, 'file', 1)
    }
    for (const body of document.memoryBodyIds) addEdge(`doc:${document.id}`, `body:${body}`, 'body', 1)
  }
  for (const [sessionId, count] of sessionCount) {
    addNode({
      id: `session:${sessionId}`,
      kind: 'session',
      label: sessionId.slice(0, 8),
      sub: `会话 ${sessionId}`,
      weight: 1 + Math.min(4, count),
      meta: { sessionId },
    })
  }
  for (const [path, count] of fileCount) {
    addNode({
      id: `file:${path}`,
      kind: 'file',
      label: path.split(posix.sep).pop() ?? path,
      sub: path,
      weight: 0.6 + Math.min(3, count * 0.6),
      meta: { path, documents: count },
    })
  }

  // --- runtime memory ------------------------------------------------------
  for (const item of runtime) {
    addNode({
      id: `runtime:${item.id}`,
      kind: 'runtime',
      label: item.title,
      sub: item.description,
      weight: item.kind === 'user' ? 4 : 3,
      group: item.kind,
      meta: { file: item.kind === 'user' ? 'USER.md' : 'MEMORY.md', importance: item.importance },
    })
  }

  // --- skills --------------------------------------------------------------
  for (const skill of skills) {
    addNode({
      id: `skill:${skill.id}`,
      kind: 'skill',
      label: skill.title,
      sub: skill.description,
      weight: 3,
      group: skill.enabled ? 'enabled' : 'disabled',
      meta: { root: skill.root, directory: skill.directory, enabled: skill.enabled },
    })
  }

  // --- memory spaces (real insights / edges when a provider is installed) ---
  for (const space of spaces) {
    addNode({
      id: `space:${space.id}`,
      kind: 'space',
      label: space.name,
      sub: space.description ?? '',
      weight: 6,
      meta: { spaceId: space.id },
    })
    for (const insight of space.insights ?? []) {
      addNode({
        id: `space:${space.id}/insight:${insight.id}`,
        kind: 'insight',
        label: insight.title ?? clip(insight.content ?? '', 80),
        sub: clip(insight.content ?? '', MAX_DESCRIPTION),
        weight: 1.5,
        meta: { spaceId: space.id },
      })
      addEdge(`space:${space.id}`, `space:${space.id}/insight:${insight.id}`, 'body', 1)
    }
    for (const edge of space.edges ?? []) {
      addEdge(`space:${space.id}/insight:${edge.source}`, `space:${space.id}/insight:${edge.target}`, edge.kind ?? 'semantic', edge.weight ?? 1)
    }
  }

  // --- semantic neighbours ------------------------------------------------
  if (documents.length > 1) {
    const vectors = tfidfVectors(documents)
    const best = documents.map(() => [])
    for (let left = 0; left < documents.length; left += 1) {
      for (let right = left + 1; right < documents.length; right += 1) {
        const score = cosine(vectors[left], vectors[right])
        if (score < SEMANTIC_MIN_COSINE) continue
        best[left].push([right, score])
        best[right].push([left, score])
      }
    }
    const seenPair = new Set()
    best.forEach((list, index) => {
      list.sort((a, b) => b[1] - a[1])
      for (const [other, score] of list.slice(0, SEMANTIC_PER_DOC)) {
        const key = index < other ? `${index}:${other}` : `${other}:${index}`
        if (seenPair.has(key)) continue
        seenPair.add(key)
        addEdge(`doc:${documents[index].id}`, `doc:${documents[other].id}`, 'semantic', Number(score.toFixed(3)))
      }
    })
  }

  // --- reference edges: runtime/skill ↔ document ---------------------------
  const matchers = skillTokens(skills)
  const documentText = new Map(documents.map((document) => [document.id, `${document.title} ${document.description}`.toLowerCase()]))
  for (const matcher of matchers) {
    if (matcher.tokens.length === 0) continue
    for (const document of documents) {
      const text = documentText.get(document.id) ?? ''
      let hits = 0
      for (const token of matcher.tokens) if (text.includes(token)) hits += 1
      if (hits === 0) continue
      addEdge(`skill:${matcher.skill.id}`, `doc:${document.id}`, 'skill', Math.min(2, 0.4 + hits * 0.3))
    }
  }
  for (const item of runtime) {
    const text = `${item.title} ${item.description}`.toLowerCase()
    for (const document of documents) {
      const target = documentText.get(document.id) ?? ''
      let hits = 0
      let strong = false
      for (const token of tokenize(text)) {
        if (token.length <= 3 || !target.includes(token)) continue
        hits += 1
        if (token.length >= 6) strong = true
      }
      if (hits >= 2 || strong) addEdge(`runtime:${item.id}`, `doc:${document.id}`, 'runtime', Math.min(1.5, 0.3 + hits * 0.15))
    }
  }

  // --- trim and return -----------------------------------------------------
  const present = new Set(nodes.map((node) => node.id))
  const kept = edges.filter((edge) => present.has(edge.s) && present.has(edge.t))
  const degree = new Map()
  for (const edge of kept) {
    degree.set(edge.s, (degree.get(edge.s) ?? 0) + 1)
    degree.set(edge.t, (degree.get(edge.t) ?? 0) + 1)
  }
  for (const node of nodes) node.weight = Number(((node.weight ?? 0) + (degree.get(node.id) ?? 0) * 0.35).toFixed(2))

  const stats = {
    nodes: nodes.length,
    edges: kept.length,
    documents: documents.length,
    sessions: sessionCount.size,
    files: fileCount.size,
    skills: skills.length,
    runtime: runtime.length,
    spaces: spaces.length,
  }
  return { nodes, edges: kept, stats, roots, warnings, sessionsCwds }
}

/** mnemon-native keeps insights in its own provider store; report, never guess. */
async function loadSpaces(mnemonHome, warnings) {
  const candidates = [join(mnemonHome, 'spaces'), join(mnemonHome, 'memory-spaces')]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    const entries = await listDir(candidate)
    if (entries.length > 0) {
      warnings.push(`检测到 Memory Space 存储（${normalisePath(candidate)}），当前版本只读取索引，洞见星点在 Provider 接入后出现。`)
      return []
    }
  }
  warnings.push('未检测到 Memory Space Provider：记忆洞见层暂为待点亮的空星座（文档／会话／源码／运行时记忆／技能五层已全部上星）。')
  return []
}

// ---------------------------------------------------------------------------
// route
// ---------------------------------------------------------------------------

function sessionCwds(ctx) {
  try {
    const sessions = typeof ctx.get === 'function' ? ctx.get('sessions', false) : undefined
    if (sessions === undefined || sessions === null || typeof sessions.list !== 'function') return []
    return sessions
      .list()
      .map((session) => session?.header?.cwd)
      .filter((cwd) => typeof cwd === 'string' && cwd !== '')
  } catch {
    return []
  }
}

export function apply(ctx, config = {}) {
  const mnemonHome = typeof config.mnemonHome === 'string' && config.mnemonHome !== ''
    ? config.mnemonHome
    : process.env.DSH_MNEMON_HOME ?? join(homedir(), '.mnemon')

  let cache
  const build = async () => {
    const now = Date.now()
    const stamp = await mtimeOf(join(mnemonHome, 'documents', 'index.json'))
    if (cache !== undefined && now - cache.at < CACHE_TTL_MS && cache.stamp === stamp) return cache.value

    const warnings = []
    const cwds = sessionCwds(ctx)
    const documents = await loadDocuments(mnemonHome, warnings)
    const runtime = await loadRuntime(mnemonHome, warnings)
    const skills = await loadSkills(skillRoots(config, cwds))
    const spaces = await loadSpaces(mnemonHome, warnings)
    const roots = { mnemonHome: normalisePath(mnemonHome), skillRoots: skillRoots(config, cwds).map(normalisePath) }
    const graph = buildGraph({ documents, runtime, skills, spaces, sessionsCwds: cwds.map(normalisePath), roots, warnings })
    const value = { generatedAt: new Date().toISOString(), ...graph }
    cache = { at: now, stamp, value }
    return value
  }

  const route = {
    kind: 'exact',
    path: ROUTE,
    handler: async (req, res) => {
      if (!isLoopbackOnly(ctx, req)) {
        writeJson(res, 403, { error: 'forbidden: loopback only' })
        return
      }
      if (req.method !== 'GET') {
        writeJson(res, 405, { error: `method not allowed: ${req.method}` })
        return
      }
      try {
        const graph = await build()
        writeJson(res, 200, graph)
      } catch (error) {
        writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }

  ctx.effect(() => ctx.webServer.register(route), 'memory-starmap: graph route')
}