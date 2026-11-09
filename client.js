/**
 * Memory constellation view — Client half.
 *
 * One star map over the whole memory system of this profile, assembled from the
 * ideas of the graph-visualisation projects that dominated the last year:
 *
 *   mem0 / graphiti            memory entities + temporal + entity edges
 *   Obsidian / Logseq graph    local-graph focus, degree-sized nodes
 *   vasturiano/3d-force-graph  starfield camera, glow sprites, drag inertia
 *   jacomyal/sigma.js          level-of-detail by zoom, curved edges at scale
 *   cytoscape.js / antvis G6   concentric + cluster layouts, neighbourhood halo
 *   d3-force                   velocity-Verlet force layout constants
 *   Understand-Anything        searchable, clickable, explainable graph nodes
 *
 * Rendering is zero-dependency Canvas 2D: sprite-batched glow, layered
 * starfield, per-kind edge passes and a spatial hash for hit testing, so a
 * few thousand edges stay interactive without a WebGL dependency.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-memory-starmap',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-memory-starmap'
    const PANEL_ID = 'memory-starmap'
    const PANEL_ORDER = 26
    const GRAPH_URL = 'api/dsh-memory-starmap/graph'
    const UAVAR = '--dsw-alias-'

    // ---------------------------------------------------------------------
    // locale
    // ---------------------------------------------------------------------
    const zh = {
      'meta.title': '记忆星图',
      'meta.description': '把项目档案、会话、源码、运行时记忆与技能画成一张可交互的记忆星图。',
      'nav.label': '记忆星图',
      'page.title': '记忆星图',
      'page.subtitle': '大肥鱼 · 记忆系统',
      'page.tagline': '档案为星，会话为轨，源码为尘',
      'action.refresh': '重新测量星图',
      'action.reset': '复位视角',
      'action.latest': '最新记忆',
      'action.handoff': '导出上下文',
      'action.handoffDone': '已复制，粘到新会话开头即可接上',
      'action.handoffFail': '复制失败，已下载为文件',
      'action.current': '聚焦此星',
      'action.search': '搜索记忆、技能、文件…',
      'action.clear': '清除选择',
      'layout.force': '引力场',
      'layout.orbital': '星系',
      'layout.cluster': '星团',
      'layout.layers': '地层',
      'range.all': '全部',
      'range.30': '30 天',
      'range.90': '90 天',
      'kind.document': '项目档案',
      'kind.session': '会话',
      'kind.file': '源码',
      'kind.runtime': '运行时记忆',
      'kind.skill': '技能',
      'kind.space': '记忆空间',
      'kind.insight': '洞见',
      'state.loading': '正在测量记忆轨道…',
      'state.error': '星图读取失败',
      'state.empty': '记忆系统还是空的',
      'state.emptyHint': '先在会话里沉淀几条项目档案，它们会在这里亮起来。',
      'state.retry': '重试',
      'stats.nodes': '星点',
      'stats.edges': '连线',
      'stats.documents': '档案',
      'stats.sessions': '会话',
      'stats.files': '文件',
      'stats.skills': '技能',
      'stats.runtime': '记忆条目',
      'detail.title': '星点详情',
      'detail.relation': '关联',
      'detail.open': '定位',
      'detail.meta': '档案信息',
      'detail.status': '状态',
      'detail.size': '大小',
      'detail.updated': '更新',
      'detail.path': '路径',
      'legend.hint': '拖拽旋转 · 滚轮推拉 · 点击聚焦 · 双击锁定',
      'legend.hidden': '拉远时自动隐藏文件与会话星尘',
      'space.pending': '洞见星座 · 待点亮',
      'session.live': '未归档的对话（还没有沉淀成记忆）',
      'legend.live': '未归档对话',
      'detail.openSession': '打开对话',
      'detail.openSourceSession': '打开最近对话',
      'detail.openFailed': '这个对话打不开了',
      'stage.openHint': '点任意一个紫色会话星，卡片里可「打开对话」跳回那段对话',
      'detail.pathLength': '最短关联路径',
      'detail.pathHint': 'Shift + 点击另一颗星，看两者的最短关联链',
      'legend.trace': 'Shift+点击追路径',
      'timeline.play': '回放',
      'timeline.pause': '暂停',
      'timeline.hint': '记忆生长',
      'detail.memory': '记忆档案',
      'detail.memoryYes': '已有（星图里的连线就是它）',
      'detail.memoryNo': '暂无（这段对话还没沉淀成档案）',
    }
    const en = {
      'meta.title': 'Memory Constellation',
      'meta.description': 'Project documents, sessions, source files, runtime memory and skills on one interactive star map.',
      'nav.label': 'Constellation',
      'page.title': 'Memory Constellation',
      'page.subtitle': 'Memory system of this profile',
      'page.tagline': 'Documents are stars, sessions are orbits, source files are dust',
      'action.refresh': 'Re-measure the sky',
      'action.reset': 'Reset view',
      'action.latest': 'Latest memory',
      'action.handoff': 'Export context',
      'action.handoffDone': 'Copied — paste it at the top of a new conversation',
      'action.handoffFail': 'Copy failed; downloaded as a file instead',
      'action.current': 'Focus star',
      'action.search': 'Search memories, skills, files…',
      'action.clear': 'Clear selection',
      'layout.force': 'Field',
      'layout.orbital': 'Galaxy',
      'layout.cluster': 'Clusters',
      'layout.layers': 'Strata',
      'range.all': 'All',
      'range.30': '30 days',
      'range.90': '90 days',
      'kind.document': 'Documents',
      'kind.session': 'Sessions',
      'kind.file': 'Source files',
      'kind.runtime': 'Runtime memory',
      'kind.skill': 'Skills',
      'kind.space': 'Memory spaces',
      'kind.insight': 'Insights',
      'state.loading': 'Measuring memory orbits…',
      'state.error': 'Could not read the star map',
      'state.empty': 'The memory system is still empty',
      'state.emptyHint': 'Persist a few project documents in a session and they will light up here.',
      'state.retry': 'Retry',
      'stats.nodes': 'stars',
      'stats.edges': 'edges',
      'stats.documents': 'documents',
      'stats.sessions': 'sessions',
      'stats.files': 'files',
      'stats.skills': 'skills',
      'stats.runtime': 'memory rows',
      'detail.title': 'Star card',
      'detail.relation': 'Relations',
      'detail.open': 'Focus',
      'detail.meta': 'Archive',
      'detail.status': 'status',
      'detail.size': 'size',
      'detail.updated': 'updated',
      'detail.path': 'path',
      'legend.hint': 'Drag to orbit · wheel to dolly · click to focus · double-click to lock',
      'legend.hidden': 'File and session dust hides when zoomed out',
      'space.pending': 'Insights · not lit yet',
      'session.live': 'Unarchived conversation (no memory written yet)',
      'legend.live': 'unarchived',
      'detail.openSession': 'Open conversation',
      'detail.openSourceSession': 'Open newest conversation',
      'detail.openFailed': 'This conversation cannot be opened',
      'stage.openHint': 'Pick a purple session star — its card can jump back into that conversation',
      'detail.pathLength': 'Shortest path',
      'detail.pathHint': 'Shift-click another star to trace the shortest chain',
      'legend.trace': 'Shift-click to trace',
      'timeline.play': 'Replay',
      'timeline.pause': 'Pause',
      'timeline.hint': 'memory growth',
      'detail.memory': 'memory',
      'detail.memoryYes': 'written',
      'detail.memoryNo': 'none yet',
    }

    let translate = (key) => key
    const t = (key) => {
      try {
        return translate(key)
      } catch {
        return key
      }
    }

    // ---------------------------------------------------------------------
    // palette
    // ---------------------------------------------------------------------
    const KIND_STYLE = {
      document: { core: '#eafaff', halo: '#43c8ff', ring: '#7fe3ff', r: 1.15 },
      session: { core: '#efe9ff', halo: '#7d63ff', ring: '#b49cff', r: 0.9 },
      file: { core: '#fff3d6', halo: '#ffb64d', ring: '#ffd479', r: 0.7 },
      runtime: { core: '#fffdf0', halo: '#ffcf5c', ring: '#ffe9b8', r: 1.0 },
      skill: { core: '#ffe8f5', halo: '#ff5fae', ring: '#ff9ed2', r: 1.0 },
      space: { core: '#eafffa', halo: '#2fd39a', ring: '#7cf0c0', r: 1.3 },
      insight: { core: '#f0fff9', halo: '#3fe0a2', ring: '#a6ffd8', r: 0.8 },
    }
    const EDGE_STYLE = {
      session: '#8f7bff',
      file: '#c8a556',
      body: '#4fd6c0',
      semantic: '#4fa8ff',
      runtime: '#ffd88a',
      skill: '#ff7fc4',
    }
    const KIND_ORDER = ['document', 'skill', 'runtime', 'session', 'file', 'space', 'insight']

    const FONT_STACK = '"Inter", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'

    /** Cluster anchors in normalised units; shared by the spawn layout and the cluster layout. */
    const CLUSTER_CENTRES = {
      document: [-0.35, -0.3],
      skill: [0.42, -0.34],
      runtime: [-0.42, 0.34],
      session: [0.36, 0.36],
      file: [0, 0.52],
      space: [0.05, -0.55],
      insight: [0.1, -0.4],
    }
    const clusterSpread = (count) => Math.max(150, Math.sqrt(Math.max(1, count)) * 34)

    // ---------------------------------------------------------------------
    // graph helpers
    // ---------------------------------------------------------------------
    function hashCode(text) {
      let hash = 2166136261
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
      }
      return hash >>> 0
    }

    function pseudoRandom(seed) {
      let state = seed >>> 0
      return () => {
        state = (Math.imul(state ^ (state >>> 15), 2246822507) + 1013904223) >>> 0
        return state / 4294967296
      }
    }

    function dayOf(ts) {
      if (typeof ts !== 'string') return undefined
      const value = Date.parse(ts)
      return Number.isNaN(value) ? undefined : value
    }

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '—'
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`
    }

    function formatDate(iso) {
      const value = dayOf(iso)
      if (value === undefined) return '—'
      const date = new Date(value)
      const pad = (input) => String(input).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    // ---------------------------------------------------------------------
    // star map engine
    // ---------------------------------------------------------------------
    /**
     * Orbital camera + perspective projection.
     *
     * World space: x right, y up, z toward the viewer (right-handed). The camera
     * orbits the focus point on a sphere, so depth is `dist - z2` after the two
     * view rotations.
     */
    class Camera {
      constructor() {
        this.yaw = 0.7
        this.pitch = -0.34
        this.dist = 1500
        this.focus = { x: 0, y: 0, z: 0 }
        this.target = { yaw: 0.7, pitch: -0.34, dist: 1500, focus: { x: 0, y: 0, z: 0 } }
        this.fov = 900
        this.spin = 0
        this.spinTarget = 0
      }

      /** Unit vectors for screen-plane dragging in world space. */
      basis() {
        const cy = Math.cos(this.yaw)
        const sy = Math.sin(this.yaw)
        const cp = Math.cos(this.pitch)
        const sp = Math.sin(this.pitch)
        return {
          right: { x: cy, y: 0, z: -sy },
          up: { x: sp * sy, y: cp, z: sp * cy },
        }
      }

      project(x, y, z, width, height) {
        const cy = Math.cos(this.yaw)
        const sy = Math.sin(this.yaw)
        const cp = Math.cos(this.pitch)
        const sp = Math.sin(this.pitch)
        const dx = x - this.focus.x
        const dy = y - this.focus.y
        const dz = z - this.focus.z
        const x1 = dx * cy - dz * sy
        const z1 = dx * sy + dz * cy
        const y2 = dy * cp - z1 * sp
        const z2 = dy * sp + z1 * cp
        const depth = this.dist - z2
        if (depth < 60) return null
        const scale = this.fov / depth
        return { x: width / 2 + x1 * scale, y: height / 2 - y2 * scale, depth, scale }
      }
    }

    /** Per-kind 3D anchors used by the cluster layout. */
    const CLUSTER_DIRS3D = {
      document: [-0.32, -0.42, -0.62],
      skill: [0.78, -0.18, 0.32],
      runtime: [-0.72, -0.28, 0.48],
      session: [0.52, 0.6, -0.46],
      file: [0.02, 0.18, 0.94],
      space: [-0.24, 0.86, -0.12],
      insight: [0.16, 0.9, 0.18],
    }

    class StarMap {
      constructor(canvas, options) {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d')
        this.onSelect = options.onSelect
        this.onHover = options.onHover
        this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

        this.nodes = []
        this.edges = []
        this.byId = new Map()
        this.adjacency = new Map()
        this.degree = new Map()

        this.view = new Camera()
        this.camera = { zoom: 1 }
        this.pointer = { x: 0, y: 0, inside: false }
        this.drag = undefined
        this.spinVelocity = { yaw: 0, pitch: 0 }
        this.lastPointer = { x: 0, y: 0, time: 0 }
        this.hovered = undefined
        this.selected = undefined
        this.highlight = new Set()
        this.path = undefined
        this.pinch = undefined
        this.layout = 'force'
        this.rangeDays = 0
        this.playhead = 1
        this.playing = false
        this.timeRange = undefined
        this.hiddenKinds = new Set()
        this.time = 0
        this.alpha = 1
        this.needsFit = false
        this.pendingSpace = false

        this.sprites = new Map()
        this.starfield = undefined
        this.dust = []
        this.nebulae = []
        this.lastFrame = 0
        this.centroid = { x: 0, y: 0, z: 0 }
        this.frame = undefined
        this.dpr = Math.min(window.devicePixelRatio || 1, 2)
        this.size = { width: 0, height: 0 }

        this.loop = this.loop.bind(this)
        this.bindEvents()
        this.observe()
        this.frame = requestAnimationFrame(this.loop)
      }

      dispose() {
        cancelAnimationFrame(this.frame)
        this.resizeObserver?.disconnect()
        this.canvas.removeEventListener('pointerdown', this.onPointerDown)
        window.removeEventListener('pointermove', this.onPointerMove)
        window.removeEventListener('pointerup', this.onPointerUp)
        this.canvas.removeEventListener('wheel', this.onWheel, { passive: false })
        this.canvas.removeEventListener('dblclick', this.onDoubleClick)
        this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
        this.canvas.removeEventListener('keydown', this.onKeyDown)
        this.canvas.removeEventListener('touchstart', this.onTouchStart)
        this.canvas.removeEventListener('touchmove', this.onTouchMove)
        this.canvas.removeEventListener('touchend', this.onTouchEnd)
      }

      observe() {
        const resize = () => {
          const rect = this.canvas.getBoundingClientRect()
          const width = Math.max(1, Math.round(rect.width))
          const height = Math.max(1, Math.round(rect.height))
          if (width === this.size.width && height === this.size.height) return
          this.size = { width, height }
          this.dpr = Math.min(window.devicePixelRatio || 1, 2)
          this.canvas.width = Math.round(width * this.dpr)
          this.canvas.height = Math.round(height * this.dpr)
          this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
          this.buildBackdrop()
          this.buildDust()
        }
        this.resizeObserver = new ResizeObserver(resize)
        this.resizeObserver.observe(this.canvas)
        resize()
      }

      // -- input ----------------------------------------------------------
      bindEvents() {
        this.onPointerDown = (event) => {
          this.canvas.focus()
          const hit = this.pick(event.offsetX, event.offsetY)
          this.spinVelocity = { yaw: 0, pitch: 0 }
          this.lastPointer = { x: event.offsetX, y: event.offsetY, time: this.time }
          this.traceNext = event.shiftKey === true
          this.drag = {
            mode: hit === undefined ? 'orbit' : 'node',
            node: hit,
            startX: event.offsetX,
            startY: event.offsetY,
            yaw: this.view.target.yaw,
            pitch: this.view.target.pitch,
            moved: 0,
            trace: event.shiftKey === true,
          }
          if (hit !== undefined) this.alpha = Math.max(this.alpha, 0.3)
          this.canvas.setPointerCapture?.(event.pointerId)
        }
        this.onPointerMove = (event) => {
          if (event.target !== this.canvas && this.drag === undefined) {
            if (this.pointer.inside) {
              this.pointer.inside = false
              this.setHovered(undefined)
            }
            return
          }
          const rect = this.canvas.getBoundingClientRect()
          const x = event.clientX - rect.left
          const y = event.clientY - rect.top
          this.pointer = { x, y, inside: true }
          if (this.drag === undefined) {
            this.setHovered(this.pick(x, y))
            return
          }
          const dx = x - this.drag.startX
          const dy = y - this.drag.startY
          this.drag.moved = Math.max(this.drag.moved, Math.abs(dx) + Math.abs(dy))
          if (this.drag.mode === 'orbit') {
            const stepX = x - this.lastPointer.x
            const stepY = y - this.lastPointer.y
            this.lastPointer = { x, y, time: this.time }
            this.view.target.yaw = this.drag.yaw + dx * 0.0055
            this.view.target.pitch = Math.max(-1.24, Math.min(1.24, this.drag.pitch + dy * 0.0042))
            this.spinVelocity.yaw = this.spinVelocity.yaw * 0.6 + stepX * 0.0055 * 0.4
            this.spinVelocity.pitch = this.spinVelocity.pitch * 0.6 + stepY * 0.0042 * 0.4
            this.alpha = Math.max(this.alpha, 0.06)
            return
          }
          const node = this.drag.node
          if (node === undefined) return
          const projected = this.view.project(node.x, node.y, node.z, this.size.width, this.size.height)
          const scale = projected === null ? 1 : projected.scale
          const basis = this.view.basis()
          const moveX = dx / scale
          const moveY = -dy / scale
          node.x = this.dragNodeStart.x + basis.right.x * moveX + basis.up.x * moveY
          node.y = this.dragNodeStart.y + basis.right.y * moveX + basis.up.y * moveY
          node.z = this.dragNodeStart.z + basis.right.z * moveX + basis.up.z * moveY
          this.alpha = Math.max(this.alpha, 0.18)
        }
        this.onPointerUp = (event) => {
          const drag = this.drag
          this.drag = undefined
          this.canvas.releasePointerCapture?.(event.pointerId)
          if (drag === undefined) return
          if (drag.mode === 'node' && drag.moved < 6 && drag.node !== undefined) {
            this.select(drag.node, { trace: drag.trace === true })
            return
          }
          if (drag.mode === 'orbit' && drag.moved < 6) this.select(undefined)
        }
        this.onWheel = (event) => {
          event.preventDefault()
          const factor = Math.exp(event.deltaY * 0.0011)
          this.view.target.dist = Math.max(320, Math.min(6000, this.view.target.dist * factor))
        }
        this.onDoubleClick = (event) => {
          const hit = this.pick(event.offsetX, event.offsetY)
          if (hit === undefined) {
            this.locked = undefined
            this.fit()
            return
          }
          this.locked = this.locked === hit ? undefined : hit
          this.focusOn(hit)
        }
        this.onPointerLeave = () => {
          this.pointer.inside = false
          this.setHovered(undefined)
        }
        this.onKeyDown = (event) => {
          if (event.key === 'Escape') {
            this.locked = undefined
            this.select(undefined)
          }
          if (event.key === '+' || event.key === '=') this.view.target.dist = Math.max(320, this.view.target.dist * 0.82)
          if (event.key === '-') this.view.target.dist = Math.min(6000, this.view.target.dist / 0.82)
        }
        this.canvas.addEventListener('pointerdown', this.onPointerDown)
        window.addEventListener('pointermove', this.onPointerMove)
        window.addEventListener('pointerup', this.onPointerUp)
        this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
        this.canvas.addEventListener('dblclick', this.onDoubleClick)
        this.canvas.addEventListener('pointerleave', this.onPointerLeave)
        this.canvas.addEventListener('keydown', this.onKeyDown)
        this.onTouchStart = (event) => {
          if (event.touches.length !== 2) return
          const [a, b] = event.touches
          this.pinch = { start: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), camera: this.view.target.dist }
          this.drag = undefined
        }
        this.onTouchMove = (event) => {
          if (this.pinch === undefined || event.touches.length !== 2) return
          event.preventDefault()
          const [a, b] = event.touches
          const distance = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY))
          this.view.target.dist = Math.max(320, Math.min(6000, this.pinch.camera * (this.pinch.start / distance)))
        }
        this.onTouchEnd = () => {
          this.pinch = undefined
        }
        this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: true })
        this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false })
        this.canvas.addEventListener('touchend', this.onTouchEnd)
      }

      // -- data -----------------------------------------------------------
      setGraph(graph) {
        const previous = new Map(this.nodes.map((node) => [node.id, node]))
        const spread = clusterSpread(graph.nodes.length)
        this.nodes = graph.nodes.map((node) => {
          const old = previous.get(node.id)
          const random = pseudoRandom(hashCode(node.id))
          const dir = CLUSTER_DIRS3D[node.kind] ?? [0, 0, 0]
          const length = Math.hypot(dir[0], dir[1], dir[2]) || 1
          const radius = 26 + Math.sqrt(random()) * spread * 0.34
          const theta = random() * Math.PI * 2
          const phi = Math.acos(2 * random() - 1)
          return {
            ...node,
            x: old?.x ?? (dir[0] / length) * spread * 0.55 + Math.sin(phi) * Math.cos(theta) * radius,
            y: old?.y ?? (dir[1] / length) * spread * 0.55 + Math.cos(phi) * radius * 0.7,
            z: old?.z ?? (dir[2] / length) * spread * 0.55 + Math.sin(phi) * Math.sin(theta) * radius,
            vx: 0,
            vy: 0,
            vz: 0,
            seen: node.ts !== undefined ? dayOf(node.ts) : undefined,
          }
        })
        this.byId = new Map(this.nodes.map((node) => [node.id, node]))
        this.edges = graph.edges
          .map((edge) => ({ ...edge, source: this.byId.get(edge.s), target: this.byId.get(edge.t) }))
          .filter((edge) => edge.source !== undefined && edge.target !== undefined)
        this.adjacency = new Map(this.nodes.map((node) => [node.id, []]))
        for (const edge of this.edges) {
          this.adjacency.get(edge.source.id).push(edge)
          this.adjacency.get(edge.target.id).push(edge)
        }
        this.degree = new Map(this.nodes.map((node) => [node.id, this.adjacency.get(node.id).length]))
        const stamps = []
        for (const node of this.nodes) {
          const value = dayOf(node.created) ?? dayOf(node.ts)
          node.bornAt = value
          if (value !== undefined) stamps.push(value)
        }
        this.timeRange = stamps.length > 0
          ? { min: Math.min(...stamps), max: Math.max(...stamps) }
          : undefined
        const span = this.timeRange === undefined ? 0 : this.timeRange.max - this.timeRange.min
        for (const node of this.nodes) {
          node.born = node.bornAt === undefined || span <= 0
            ? 0
            : Math.min(1, Math.max(0, (node.bornAt - this.timeRange.min) / span))
        }
        this.playhead = 1
        this.playing = false
        this.sprites = new Map()
        this.centroid = { x: 0, y: 0, z: 0 }
        this.pendingSpace = graph.nodes.some((node) => node.kind === 'space') === false
        this.locked = undefined
        this.selected = undefined
        this.highlight = new Set()
        this.alpha = 1
        this.needsFit = true
        this.applyLayout()
        this.fit()
      }

      setLayout(layout) {
        if (this.layout === layout) return
        this.layout = layout
        this.applyLayout()
        this.alpha = 1
        this.needsFit = true
      }

      setRange(days) {
        this.rangeDays = days
        this.alpha = Math.max(this.alpha, 0.2)
      }

      setHiddenKinds(kinds) {
        this.hiddenKinds = kinds
      }

      applyLayout() {
        const count = Math.max(1, this.nodes.length)
        const spread = clusterSpread(count)
        for (const node of this.nodes) node.ly = undefined

        if (this.layout === 'layers') {
          // memory strata: skills float on top, source files sink to the floor
          const heights = { space: 720, insight: 640, skill: 470, document: 160, runtime: -70, session: -320, file: -490 }
          for (const node of this.nodes) {
            node.tx = undefined
            node.ty = undefined
            node.tz = undefined
            node.ly = heights[node.kind] ?? 0
          }
          return
        }

        if (this.layout === 'orbital') {
          // spiral galaxy: memories wind outward on two arms, thickness on y
          const dated = this.nodes.filter((node) => node.seen !== undefined).sort((a, b) => a.seen - b.seen)
          const total = Math.max(1, dated.length)
          dated.forEach((node, index) => {
            const t = index / total
            const arm = index % 2 === 0 ? 0 : Math.PI
            const angle = t * Math.PI * 4.4 + arm
            const radius = 90 + t * spread * 1.5
            const hash = hashCode(node.id)
            node.tx = Math.cos(angle) * radius
            node.ty = ((hash % 200) / 200 - 0.5) * 70 * (1 - t * 0.5)
            node.tz = Math.sin(angle) * radius
          })
          for (const node of this.nodes) {
            if (node.seen !== undefined) continue
            const anchor = (this.adjacency.get(node.id) ?? [])
              .map((edge) => (edge.source.id === node.id ? edge.target : edge.source))
              .filter((other) => other.tx !== undefined)
            const hash = hashCode(node.id)
            const angle = ((hash % 1000) / 1000) * Math.PI * 2
            const jitter = 26 + (hash % 30)
            if (anchor.length > 0) {
              const sumX = anchor.reduce((total, other) => total + other.tx, 0) / anchor.length
              const sumY = anchor.reduce((total, other) => total + other.ty, 0) / anchor.length
              const sumZ = anchor.reduce((total, other) => total + other.tz, 0) / anchor.length
              node.tx = sumX + Math.cos(angle) * jitter * 0.7
              node.ty = sumY + ((hash % 100) / 100 - 0.5) * 60
              node.tz = sumZ + Math.sin(angle) * jitter * 0.7
            } else {
              const radius = spread * 1.5 + 120 + (hash % 160)
              node.tx = Math.cos(angle) * radius
              node.ty = ((hash % 100) / 100 - 0.5) * 120
              node.tz = Math.sin(angle) * radius
            }
          }
          return
        }

        if (this.layout === 'cluster') {
          for (const node of this.nodes) {
            const dir = CLUSTER_DIRS3D[node.kind] ?? [0, 0, 0]
            const length = Math.hypot(dir[0], dir[1], dir[2]) || 1
            const random = pseudoRandom(hashCode(node.id))
            const theta = random() * Math.PI * 2
            const phi = Math.acos(2 * random() - 1)
            const radius = Math.sqrt(random()) * spread * 0.42
            const base = spread * 0.62
            node.tx = (dir[0] / length) * base + Math.sin(phi) * Math.cos(theta) * radius
            node.ty = (dir[1] / length) * base + Math.cos(phi) * radius * 0.8
            node.tz = (dir[2] / length) * base + Math.sin(phi) * Math.sin(theta) * radius
          }
          return
        }

        for (const node of this.nodes) {
          node.tx = undefined
          node.ty = undefined
          node.tz = undefined
        }
      }

      fit() {
        if (this.nodes.length === 0) return
        let cx = 0
        let cy = 0
        let cz = 0
        for (const node of this.nodes) {
          cx += node.x
          cy += node.y
          cz += node.z
        }
        const count = this.nodes.length
        cx /= count
        cy /= count
        cz /= count
        let radius = 120
        for (const node of this.nodes) {
          radius = Math.max(radius, Math.hypot(node.x - cx, node.y - cy, node.z - cz))
        }
        this.view.target.focus = { x: cx, y: cy, z: cz }
        this.view.target.dist = Math.max(420, Math.min(6000, radius * 1.26))
        this.view.focus = { ...this.view.target.focus }
        this.view.dist = this.view.target.dist * 1.18
        this.buildNebulae()
      }

      /** Three nebulae around the real document clusters, two decorative ones outside. */
      buildNebulae() {
        const random = pseudoRandom(0x77aa31)
        const palette = ['74,136,255', '166,96,255', '40,198,190', '255,142,120', '255,196,120']
        const docs = this.nodes
          .filter((node) => node.kind === 'document')
          .sort((a, b) => a.x - b.x || a.y - b.y)
        const clouds = []
        if (docs.length > 0) {
          const groups = 3
          for (let index = 0; index < groups; index += 1) {
            const slice = docs.slice(Math.floor((index * docs.length) / groups), Math.floor(((index + 1) * docs.length) / groups))
            if (slice.length === 0) continue
            const cx = slice.reduce((total, node) => total + node.x, 0) / slice.length
            const cy = slice.reduce((total, node) => total + node.y, 0) / slice.length
            const cz = slice.reduce((total, node) => total + node.z, 0) / slice.length
            let spread = 90
            for (const node of slice) spread = Math.max(spread, Math.hypot(node.x - cx, node.y - cy, node.z - cz))
            clouds.push({
              x: cx,
              y: cy,
              z: cz,
              r: spread * 1.7 + 90,
              alpha: 0.05 + random() * 0.035,
              color: palette[index % palette.length],
            })
          }
        }
        for (let index = 0; index < 2; index += 1) {
          const theta = random() * Math.PI * 2
          const phi = Math.acos(2 * random() - 1)
          const radius = 620 + random() * 460
          clouds.push({
            x: Math.sin(phi) * Math.cos(theta) * radius,
            y: Math.cos(phi) * radius * 0.45,
            z: Math.sin(phi) * Math.sin(theta) * radius,
            r: 260 + random() * 220,
            alpha: 0.04 + random() * 0.03,
            color: palette[(index + 3) % palette.length],
          })
        }
        this.nebulae = clouds
      }

      focusOn(node) {
        this.view.target.focus = { x: node.x, y: node.y, z: node.z }
        this.view.target.dist = Math.min(this.view.target.dist, 720)
      }

      updateHighlight(node) {
        this.highlight = new Set()
        if (node === undefined) return
        this.highlight.add(node.id)
        for (const edge of this.adjacency.get(node.id) ?? []) {
          this.highlight.add(edge.source.id)
          this.highlight.add(edge.target.id)
        }
      }

      /** Breadth-first shortest chain between two stars, over every relation kind. */
      /** Paste-ready handoff note; see buildHandoff for the layout. */
      handoff(detail, limit) {
        return buildHandoff(this, detail, limit)
      }

      findPath(from, to) {
        const previous = new Map([[from.id, undefined]])
        const queue = [from]
        while (queue.length > 0) {
          const current = queue.shift()
          if (current.id === to.id) break
          for (const edge of this.adjacency.get(current.id) ?? []) {
            const next = edge.source.id === current.id ? edge.target : edge.source
            if (previous.has(next.id)) continue
            previous.set(next.id, { node: current, edge })
            queue.push(next)
          }
        }
        if (!previous.has(to.id)) return undefined
        const nodes = new Set([to.id])
        const edges = new Set()
        let cursor = to
        for (let guard = 0; guard < 4096; guard += 1) {
          const step = previous.get(cursor.id)
          if (step === undefined) break
          nodes.add(step.node.id)
          edges.add(step.edge)
          cursor = step.node
        }
        return { nodes, edges, length: Math.max(0, nodes.size - 1) }
      }

      select(node, options = {}) {
        this.path = undefined
        if (options.trace === true && this.selected !== undefined && node !== undefined && node.id !== this.selected.id) {
          const from = this.selected
          this.path = this.findPath(from, node)
          this.selected = node
          this.highlight = new Set([from.id, node.id])
          for (const id of this.path?.nodes ?? []) this.highlight.add(id)
        } else {
          this.selected = node
          this.updateHighlight(node)
        }
        if (this.onSelect !== undefined) this.onSelect(node === undefined ? undefined : exposeNode(node, this))
      }

      setHovered(node) {
        if (this.hovered === node) return
        this.hovered = node
        if (this.selected === undefined) this.updateHighlight(node)
        this.canvas.style.cursor = node === undefined ? (this.drag?.mode === 'orbit' ? 'grabbing' : 'grab') : 'pointer'
        if (this.onHover !== undefined) this.onHover(node === undefined ? undefined : exposeNode(node, this))
      }

      exposeNode(node) {
        return exposeNode(node, this)
      }

      // -- geometry -------------------------------------------------------
      radiusOf(node) {
        const style = KIND_STYLE[node.kind] ?? KIND_STYLE.document
        const weight = Math.max(1, node.weight ?? 1)
        return (2.1 + Math.sqrt(weight) * 1.5) * style.r
      }

      /** Filters that only affect drawing: layer toggles, recency window, timeline replay. */
      visible(node) {
        if (this.hiddenKinds.has(node.kind)) return false
        if (this.rangeDays > 0) {
          if (node.seen === undefined) return node.kind !== 'document'
          const cutoff = Date.now() - this.rangeDays * 86400000
          if (node.seen < cutoff) return false
        }
        if (this.playhead < 0.999 && node.born > this.playhead + 0.004) return false
        return true
      }

      /** Filters that affect the simulation: a star that has not been born still holds its place. */
      simVisible(node) {
        if (this.hiddenKinds.has(node.kind)) return false
        if (this.rangeDays > 0) {
          if (node.seen === undefined) return node.kind !== 'document'
          const cutoff = Date.now() - this.rangeDays * 86400000
          if (node.seen < cutoff) return false
        }
        return true
      }

      setPlayhead(value) {
        this.playhead = Math.min(1, Math.max(0, value))
        if (this.playhead < 1) this.playing = false
      }

      currentDate() {
        if (this.timeRange === undefined) return undefined
        return new Date(this.timeRange.min + (this.timeRange.max - this.timeRange.min) * this.playhead)
      }

      /** Level of detail: file/session dust only resolves when the camera is close. */
      lodVisible(node) {
        if (!this.visible(node)) return false
        if (this.view.dist > 1600 && (node.kind === 'file' || node.kind === 'session')) return false
        return true
      }

      /** Screen-space hit test biased toward the nearest star. */
      pick(screenX, screenY) {
        let best
        let bestScore = Infinity
        for (const node of this.nodes) {
          if (!this.lodVisible(node)) continue
          const point = this.view.project(node.x, node.y, node.z, this.size.width, this.size.height)
          if (point === null) continue
          const radius = Math.max(9, this.radiusOf(node) * point.scale * 1.1)
          const dx = point.x - screenX
          const dy = point.y - screenY
          const distance = Math.hypot(dx, dy)
          if (distance > radius) continue
          const score = distance / radius + (point.depth / this.view.dist) * 0.7
          if (score < bestScore) {
            bestScore = score
            best = node
          }
        }
        return best
      }

      /** Kept for callers that only need a screen position; z defaults to 0. */
      toScreen(x, y, z = 0) {
        return this.view.project(x, y, z, this.size.width, this.size.height) ?? { x: -1e6, y: -1e6, depth: 1e6, scale: 0 }
      }

      // -- simulation -----------------------------------------------------
      step() {
        if (this.alpha < 0.004) return
        const nodes = this.nodes
        if (nodes.length === 0) return
        const alpha = this.alpha
        const cell = 210
        const buckets = new Map()
        for (const node of nodes) {
          if (!this.simVisible(node)) continue
          const key = `${Math.floor(node.x / cell)}:${Math.floor(node.y / cell)}:${Math.floor(node.z / cell)}`
          let bucket = buckets.get(key)
          if (bucket === undefined) {
            bucket = []
            buckets.set(key, bucket)
          }
          bucket.push(node)
        }
        const repulsion = 13000 * alpha
        for (const node of nodes) {
          if (!this.simVisible(node)) continue
          const gx = Math.floor(node.x / cell)
          const gy = Math.floor(node.y / cell)
          const gz = Math.floor(node.z / cell)
          for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
              for (let dz = -1; dz <= 1; dz += 1) {
                const bucket = buckets.get(`${gx + dx}:${gy + dy}:${gz + dz}`)
                if (bucket === undefined) continue
                for (const other of bucket) {
                  if (other === node) continue
                  const ax = node.x - other.x
                  const ay = node.y - other.y
                  const az = node.z - other.z
                  const distanceSq = ax * ax + ay * ay + az * az + 0.01
                  if (distanceSq > 62500) continue
                  const distance = Math.sqrt(distanceSq)
                  const force = repulsion / (distanceSq * distance)
                  node.vx += ax * force
                  node.vy += ay * force
                  node.vz += az * force
                }
              }
            }
          }
        }

        for (const edge of this.edges) {
          const { source, target } = edge
          if (source === undefined || target === undefined) continue
          if (!this.simVisible(source) || !this.simVisible(target)) continue
          const ax = target.x - source.x
          const ay = target.y - source.y
          const az = target.z - source.z
          const distance = Math.sqrt(ax * ax + ay * ay + az * az) + 0.01
          const ideal = 60 + 130 / Math.max(1, edge.w ?? 1)
          const strength = 0.02 * alpha * Math.min(1.6, edge.w ?? 1)
          const force = ((distance - ideal) * strength) / distance
          source.vx += ax * force
          source.vy += ay * force
          source.vz += az * force
          target.vx -= ax * force
          target.vy -= ay * force
          target.vz -= az * force
        }

        for (const node of nodes) {
          if (!this.simVisible(node)) continue
          const orphan = node.meta?.live === true && node.meta?.hasMemory === false
          if (node.tx !== undefined) {
            node.vx += (node.tx - node.x) * 0.03 * alpha
            node.vy += (node.ty - node.y) * 0.03 * alpha
            node.vz += (node.tz - node.z) * 0.03 * alpha
          } else if (this.layout === 'force' && orphan) {
            const hash = hashCode(node.id)
            const angle = ((hash % 1000) / 1000) * Math.PI * 2
            const radius = 420 + (hash % 130)
            node.vx += (Math.cos(angle) * radius - node.x) * 0.014 * alpha
            node.vy += (((hash % 80) / 80 - 0.5) * 160 - node.y) * 0.014 * alpha
            node.vz += (Math.sin(angle) * radius - node.z) * 0.014 * alpha
          } else {
            const centring = orphan ? 0.012 : 0.0046
            node.vx += -node.x * centring * alpha
            node.vz += -node.z * centring * alpha
            if (node.ly === undefined) node.vy += -node.y * centring * alpha
          }
          if (node.ly !== undefined) node.vy += (node.ly - node.y) * 0.105 * alpha
          if (node === this.hovered || node === this.selected) {
            node.vx *= 0.7
            node.vy *= 0.7
            node.vz *= 0.7
          }
          const speed = Math.hypot(node.vx, node.vy, node.vz)
          if (speed > 11) {
            const factor = 11 / speed
            node.vx *= factor
            node.vy *= factor
            node.vz *= factor
          }
          const divisor = node === this.drag?.node ? 5 : 1.4
          node.x += node.vx / divisor
          node.z += node.vz / divisor
          if (node.ly === undefined) node.y += node.vy / divisor
          else node.y += (node.ly - node.y) * 0.3
          node.vx *= 0.85
          node.vy *= 0.85
          node.vz *= 0.85
        }

        let sx = 0
        let sy = 0
        let sz = 0
        for (const node of nodes) {
          sx += node.x
          sy += node.y
          sz += node.z
        }
        this.centroid = { x: sx / nodes.length, y: sy / nodes.length, z: sz / nodes.length }
        this.alpha *= 0.993
      }

      // -- painting -------------------------------------------------------
      buildBackdrop() {
        const { width, height } = this.size
        if (width === 0 || height === 0) return
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width * this.dpr)
        canvas.height = Math.round(height * this.dpr)
        const ctx = canvas.getContext('2d')
        ctx.scale(this.dpr, this.dpr)

        const base = ctx.createLinearGradient(0, 0, width * 0.4, height)
        base.addColorStop(0, '#04060d')
        base.addColorStop(0.5, '#060a15')
        base.addColorStop(1, '#020308')
        ctx.fillStyle = base
        ctx.fillRect(0, 0, width, height)

        const random = pseudoRandom(0x51f7c3)
        const clouds = [
          { x: 0.3, y: 0.34, r: 0.62, color: '58,104,255', alpha: 0.14 },
          { x: 0.74, y: 0.28, r: 0.5, color: '150,86,255', alpha: 0.11 },
          { x: 0.52, y: 0.78, r: 0.62, color: '32,178,190', alpha: 0.08 },
          { x: 0.9, y: 0.82, r: 0.4, color: '255,120,190', alpha: 0.05 },
        ]
        for (const cloud of clouds) {
          const radius = Math.max(width, height) * cloud.r
          const gradient = ctx.createRadialGradient(width * cloud.x, height * cloud.y, 0, width * cloud.x, height * cloud.y, radius)
          gradient.addColorStop(0, `rgba(${cloud.color},${cloud.alpha})`)
          gradient.addColorStop(0.5, `rgba(${cloud.color},${cloud.alpha * 0.32})`)
          gradient.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = gradient
          ctx.fillRect(0, 0, width, height)
        }

        const layers = [
          { count: Math.round((width * height) / 5200), size: 0.65, alpha: 0.3 },
          { count: Math.round((width * height) / 12000), size: 1.0, alpha: 0.46 },
          { count: Math.round((width * height) / 34000), size: 1.6, alpha: 0.66 },
        ]
        for (const layer of layers) {
          for (let index = 0; index < layer.count; index += 1) {
            const x = random() * width
            const y = random() * height
            const alpha = layer.alpha * (0.3 + random() * 0.7)
            ctx.fillStyle = `rgba(222,236,255,${alpha.toFixed(3)})`
            ctx.beginPath()
            ctx.arc(x, y, layer.size * (0.55 + random() * 0.9), 0, Math.PI * 2)
            ctx.fill()
          }
        }

        const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.32, width / 2, height / 2, Math.max(width, height) * 0.78)
        vignette.addColorStop(0, 'rgba(0,0,0,0)')
        vignette.addColorStop(1, 'rgba(0,0,0,0.62)')
        ctx.fillStyle = vignette
        ctx.fillRect(0, 0, width, height)

        this.starfield = canvas
      }

      /** 3D dust shell: rotating the camera makes it parallax for free. */
      buildDust() {
        const random = pseudoRandom(0x2ad91b)
        const count = Math.min(760, Math.round((this.size.width * this.size.height) / 2100))
        this.dust = []
        for (let index = 0; index < count; index += 1) {
          const theta = random() * Math.PI * 2
          const phi = Math.acos(2 * random() - 1)
          const radius = 1100 + random() * 2300
          this.dust.push({
            x: Math.sin(phi) * Math.cos(theta) * radius,
            y: Math.cos(phi) * radius * 0.8,
            z: Math.sin(phi) * Math.sin(theta) * radius,
            size: 0.5 + random() * 1.3,
            alpha: 0.18 + random() * 0.55,
            hue: random(),
          })
        }
      }

      spriteFor(kind, warm = true) {
        const key = `${kind}:${warm ? 'w' : 'c'}`
        const cached = this.sprites.get(key)
        if (cached !== undefined) return cached
        const base = KIND_STYLE[kind] ?? KIND_STYLE.document
        const style = warm
          ? { core: base.core, ring: mixHex(base.ring, '#ffd08a', 0.18), halo: mixHex(base.halo, '#ffb066', 0.2) }
          : { core: mixHex(base.core, '#bcd4ff', 0.35), ring: mixHex(base.ring, '#6f9dff', 0.42), halo: mixHex(base.halo, '#4d7dff', 0.46) }
        const size = 128
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
        gradient.addColorStop(0, hexToRgba(style.core, 1))
        gradient.addColorStop(0.1, hexToRgba(style.core, 0.92))
        gradient.addColorStop(0.22, hexToRgba(style.ring, 0.75))
        gradient.addColorStop(0.45, hexToRgba(style.halo, 0.3))
        gradient.addColorStop(0.72, hexToRgba(style.halo, 0.07))
        gradient.addColorStop(1, hexToRgba(style.halo, 0))
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, size, size)
        this.sprites.set(key, canvas)
        return canvas
      }

      loop(timestamp) {
        this.frame = requestAnimationFrame(this.loop)
        if (this.size.width === 0) return
        const delta = this.lastFrame === 0 ? 16 : Math.min(64, timestamp - this.lastFrame)
        this.lastFrame = timestamp
        this.time = timestamp

        // camera easing
        this.view.yaw += (this.view.target.yaw - this.view.yaw) * 0.12
        this.view.pitch += (this.view.target.pitch - this.view.pitch) * 0.12
        this.view.dist += (this.view.target.dist - this.view.dist) * 0.1
        this.view.focus.x += (this.view.target.focus.x - this.view.focus.x) * 0.1
        this.view.focus.y += (this.view.target.focus.y - this.view.focus.y) * 0.1
        this.view.focus.z += (this.view.target.focus.z - this.view.focus.z) * 0.1
        if (this.drag === undefined) {
          if (Math.abs(this.spinVelocity.yaw) > 0.00006 || Math.abs(this.spinVelocity.pitch) > 0.00006) {
            this.view.target.yaw += this.spinVelocity.yaw
            this.view.target.pitch = Math.max(-1.24, Math.min(1.24, this.view.target.pitch + this.spinVelocity.pitch))
            this.spinVelocity.yaw *= 0.93
            this.spinVelocity.pitch *= 0.9
          }
        }
        if (!this.reducedMotion && this.drag === undefined && this.selected === undefined && Math.abs(this.spinVelocity.yaw) < 0.00008) {
          this.view.target.yaw += delta * 0.000012
          this.view.yaw += delta * 0.000012
        }
        this.camera.zoom = 1500 / this.view.dist

        if (this.playing) {
          this.playhead = Math.min(1, this.playhead + delta / 15000)
          if (this.playhead >= 1) this.playing = false
        }

        this.step()
        if (this.needsFit && this.alpha < 0.13) {
          this.needsFit = false
          this.fit()
        }
        this.paint()
      }

      paint() {
        const ctx = this.ctx
        const { width, height } = this.size
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
        ctx.clearRect(0, 0, width, height)
        if (this.starfield !== undefined) ctx.drawImage(this.starfield, 0, 0, width, height)

        const project = (x, y, z) => this.view.project(x, y, z, width, height)
        const focus = this.selected ?? this.hovered
        const dimmed = focus !== undefined
        const dist = this.view.dist

        // everything luminous is composited additively, the way a real star field reads
        ctx.globalCompositeOperation = 'lighter'

        // galactic disc glow: an ellipse whose flattening follows the camera pitch
        const centre = this.centroid ?? { x: 0, y: 0, z: 0 }
        const core = project(centre.x, centre.y, centre.z)
        if (core !== null) {
          const discRadius = Math.max(120, Math.min(Math.max(width, height) * 0.6, (1200 / Math.max(320, dist)) * 520))
          const flatten = Math.min(1, Math.max(0.06, Math.abs(Math.sin(this.view.pitch)) + 0.12))
          ctx.save()
          ctx.translate(core.x, core.y)
          ctx.scale(1, flatten)
          const disc = ctx.createRadialGradient(0, 0, 0, 0, 0, discRadius)
          disc.addColorStop(0, 'rgba(120,190,255,0.12)')
          disc.addColorStop(0.35, 'rgba(96,150,255,0.07)')
          disc.addColorStop(0.7, 'rgba(120,96,255,0.035)')
          disc.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = disc
          ctx.beginPath()
          ctx.arc(0, 0, discRadius, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }

        // 3D dust
        for (const mote of this.dust) {
          const point = project(mote.x, mote.y, mote.z)
          if (point === null) continue
          if (point.x < -40 || point.y < -40 || point.x > width + 40 || point.y > height + 40) continue
          const fog = Math.min(1, Math.max(0, (point.depth - dist * 0.5) / (dist * 1.6)))
          const alpha = mote.alpha * (1 - fog) * 0.62
          if (alpha < 0.02) continue
          ctx.globalAlpha = alpha
          ctx.fillStyle = mote.hue > 0.82 ? '#ffd7a8' : mote.hue > 0.62 ? '#c9d8ff' : '#e9f3ff'
          const size = Math.max(1, mote.size * point.scale * 1.7)
          ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size)
        }
        ctx.globalAlpha = 1

        // galactic nucleus: a hot core with rotating accretion arms
        if (core !== null) {
          const nucleusRadius = Math.max(18, 34 * core.scale)
          const layers = [
            { scale: 4.2, colour: '86,150,255', alpha: 0.055 },
            { scale: 2.1, colour: '168,206,255', alpha: 0.08 },
            { scale: 1.0, colour: '255,248,232', alpha: 0.2 },
            { scale: 0.42, colour: '255,255,255', alpha: 0.5 },
          ]
          for (const layer of layers) {
            const radius = Math.max(6, nucleusRadius * layer.scale)
            const gradient = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, radius)
            gradient.addColorStop(0, `rgba(${layer.colour},${layer.alpha})`)
            gradient.addColorStop(0.55, `rgba(${layer.colour},${(layer.alpha * 0.35).toFixed(3)})`)
            gradient.addColorStop(1, `rgba(${layer.colour},0)`)
            ctx.fillStyle = gradient
            ctx.beginPath()
            ctx.arc(core.x, core.y, radius, 0, Math.PI * 2)
            ctx.fill()
          }
          const spin = this.time * 0.00016
          const flatten = Math.min(1, Math.max(0.08, Math.abs(Math.sin(this.view.pitch)) + 0.1))
          ctx.lineWidth = 0.8
          for (let arm = 0; arm < 10; arm += 1) {
            const offset = (arm / 10) * Math.PI * 2
            ctx.beginPath()
            let started = false
            for (let segment = 0; segment <= 14; segment += 1) {
              const t = segment / 14
              const angle = offset + spin + t * 2.4
              const radius = nucleusRadius * (1.1 + t * 5.4)
              const point = project(
                centre.x + Math.cos(angle) * radius,
                centre.y + Math.sin(angle) * radius * flatten * 0.55,
                centre.z + Math.sin(angle) * radius,
              )
              if (point === null) {
                started = false
                continue
              }
              if (!started) {
                ctx.moveTo(point.x, point.y)
                started = true
              } else {
                ctx.lineTo(point.x, point.y)
              }
            }
            ctx.strokeStyle = `rgba(150,196,255,${(0.075 - 0.004 * arm).toFixed(3)})`
            ctx.stroke()
          }
        }

        // soft nebulae sitting behind the constellation
        for (const cloud of this.nebulae) {
          const point = project(cloud.x, cloud.y, cloud.z)
          if (point === null) continue
          const radius = Math.max(50, cloud.r * point.scale)
          if (point.x + radius < 0 || point.y + radius < 0 || point.x - radius > width || point.y - radius > height) continue
          const fog = Math.min(0.85, Math.max(0, (point.depth - dist * 0.4) / (dist * 1.8)))
          const alpha = cloud.alpha * (1 - fog)
          if (alpha < 0.008) continue
          const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius)
          gradient.addColorStop(0, `rgba(${cloud.color},${alpha.toFixed(3)})`)
          gradient.addColorStop(0.45, `rgba(${cloud.color},${(alpha * 0.45).toFixed(3)})`)
          gradient.addColorStop(1, `rgba(${cloud.color},0)`)
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
          ctx.fill()
        }

        // orbital decoration around the galactic core
        if (core !== null) {
          ctx.save()
          ctx.setLineDash([])
          for (let ring = 0; ring < 3; ring += 1) {
            const radius = 115 + ring * 96
            const tilt = 0.22 + ring * 0.13
            ctx.beginPath()
            let started = false
            for (let segment = 0; segment <= 72; segment += 1) {
              const angle = (segment / 72) * Math.PI * 2
              const point = project(
                centre.x + Math.cos(angle) * radius,
                centre.y + Math.sin(angle) * radius * tilt,
                centre.z + Math.sin(angle) * radius,
              )
              if (point === null) {
                started = false
                continue
              }
              if (!started) {
                ctx.moveTo(point.x, point.y)
                started = true
              } else {
                ctx.lineTo(point.x, point.y)
              }
            }
            ctx.strokeStyle = `rgba(126,196,255,${0.1 - ring * 0.022})`
            ctx.lineWidth = 1
            ctx.stroke()
          }
          ctx.restore()
        }

        // edges, far to near
        const projected = new Map()
        for (const node of this.nodes) {
          if (!this.lodVisible(node)) continue
          const point = project(node.x, node.y, node.z)
          if (point !== null) projected.set(node.id, point)
        }

        const visibleEdges = []
        for (const edge of this.edges) {
          const from = projected.get(edge.source.id)
          const to = projected.get(edge.target.id)
          if (from === undefined || to === undefined) continue
          if (focus !== undefined && edge.source.id !== focus.id && edge.target.id !== focus.id) continue
          visibleEdges.push({ edge, from, to, depth: (from.depth + to.depth) / 2 })
        }
        visibleEdges.sort((a, b) => b.depth - a.depth)

        ctx.lineCap = 'round'
        const traceEdge = (item) => {
          const midX = (item.from.x + item.to.x) / 2
          const midY = (item.from.y + item.to.y) / 2
          const dx = item.to.x - item.from.x
          const dy = item.to.y - item.from.y
          const length = Math.hypot(dx, dy) + 0.001
          const bendFactor = item.edge.kind === 'semantic' ? 0.24 : item.edge.kind === 'skill' ? 0.17 : 0.075
          const bend = Math.min(64, length * bendFactor) * ((hashCode(`${item.edge.s}${item.edge.t}`) % 2 === 0) ? 1 : -1)
          ctx.moveTo(item.from.x, item.from.y)
          ctx.quadraticCurveTo(midX - (dy / length) * bend, midY + (dx / length) * bend, item.to.x, item.to.y)
        }

        if (this.path !== undefined) {
          ctx.strokeStyle = '#ffe29a'
          ctx.globalAlpha = 0.92
          ctx.lineWidth = 1.9
          ctx.beginPath()
          let any = false
          for (const item of visibleEdges) {
            if (!this.path.edges.has(item.edge)) continue
            traceEdge(item)
            any = true
          }
          if (any) ctx.stroke()
        }

        // identical relations share one path per depth band: ~24 strokes instead of ~500
        const buckets = new Map()
        for (const item of visibleEdges) {
          if (this.path !== undefined && this.path.edges.has(item.edge)) continue
          const fog = Math.min(0.92, Math.max(0, (item.depth - dist * 0.55) / (dist * 1.5)))
          const band = Math.min(3, Math.floor(fog * 4))
          const key = `${item.edge.kind}:${band}`
          let bucket = buckets.get(key)
          if (bucket === undefined) {
            bucket = { kind: item.edge.kind, band, items: [] }
            buckets.set(key, bucket)
          }
          bucket.items.push(item)
        }
        for (const bucket of buckets.values()) {
          const fog = (bucket.band + 0.35) / 4
          ctx.globalAlpha = Math.max(0.02, (dimmed ? 0.4 : 0.3) * (1 - fog))
          ctx.strokeStyle = EDGE_STYLE[bucket.kind] ?? '#7f8fb3'
          ctx.lineWidth = Math.max(0.5, 1.8 - bucket.band * 0.34)
          ctx.beginPath()
          for (const item of bucket.items) traceEdge(item)
          ctx.stroke()
        }
        ctx.globalAlpha = 1

        // travelling pulses along the focused neighbourhood
        if (focus !== undefined && !this.reducedMotion) {
          const phaseBase = this.time * 0.0004
          ctx.globalAlpha = 0.9
          for (const item of visibleEdges) {
            const phase = (phaseBase + (hashCode(item.edge.s + item.edge.t) % 1000) / 1000) % 1
            const x = item.from.x + (item.to.x - item.from.x) * phase
            const y = item.from.y + (item.to.y - item.from.y) * phase
            ctx.fillStyle = EDGE_STYLE[item.edge.kind] ?? '#9fb6ff'
            ctx.beginPath()
            ctx.arc(x, y, 1.6, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.globalAlpha = 1
        }

        // stars, far to near
        const order = [...this.nodes]
          .filter((node) => projected.has(node.id))
          .sort((a, b) => projected.get(b.id).depth - projected.get(a.id).depth)

        for (const node of order) {
          const point = projected.get(node.id)
          const style = KIND_STYLE[node.kind] ?? KIND_STYLE.document
          const base = this.radiusOf(node)
          const scale = point.scale
          const radius = Math.max(1.1, Math.min(46, base * scale * 0.85))
          const fog = Math.min(0.94, Math.max(0, (point.depth - dist * 0.55) / (dist * 1.6)))
          const focused = focus === undefined || this.highlight.has(node.id) || node.kind === 'document'
          const depthWeight = Math.min(1.25, Math.max(0.42, 1400 / point.depth))
          const alpha = (focus === undefined ? 0.95 : focused ? 1 : 0.14) * (1 - fog) * depthWeight
          if (alpha < 0.02) continue
          const age = this.playhead - node.born
          const flash = age >= 0 && age < 0.03 ? 1 - age / 0.03 : 0
          const halo = radius * (node.kind === 'document' ? 5.0 : 4.2) * (1 + flash * 1.1)
          ctx.globalAlpha = Math.min(0.95, alpha * 0.74 * (1 + flash * 0.5))
          const warm = point.depth < dist * 0.98
          ctx.drawImage(this.spriteFor(node.kind, warm), point.x - halo / 2, point.y - halo / 2, halo, halo)

          if (radius > 2.2) {
            ctx.fillStyle = style.core
            ctx.beginPath()
            ctx.arc(point.x, point.y, Math.max(1, radius * 0.42), 0, Math.PI * 2)
            ctx.fill()
          }

          // corona ring on the heaviest stars
          if ((node.weight ?? 1) > 8 && radius > 4.2) {
            ctx.globalAlpha = Math.min(0.6, alpha * 0.5)
            ctx.strokeStyle = style.ring
            ctx.lineWidth = 0.8
            const ringRadius = radius * (2.5 + Math.sin(this.time * 0.0006 + point.x * 0.01) * 0.12)
            ctx.beginPath()
            ctx.arc(point.x, point.y, ringRadius, 0, Math.PI * 2)
            ctx.stroke()
          }

          // diffraction spikes on the brightest stars
          if ((node.weight ?? 1) > 6.5 && radius > 3.4) {
            const flare = radius * (4.2 + Math.min(3.4, (node.weight ?? 1) * 0.28))
            const gradient = ctx.createLinearGradient(point.x - flare, point.y, point.x + flare, point.y)
            gradient.addColorStop(0, hexToRgba(style.ring, 0))
            gradient.addColorStop(0.5, hexToRgba(style.core, 0.5 * alpha))
            gradient.addColorStop(1, hexToRgba(style.ring, 0))
            ctx.strokeStyle = gradient
            ctx.lineWidth = 0.9
            ctx.beginPath()
            ctx.moveTo(point.x - flare, point.y)
            ctx.lineTo(point.x + flare, point.y)
            const vertical = ctx.createLinearGradient(point.x, point.y - flare * 0.75, point.x, point.y + flare * 0.75)
            vertical.addColorStop(0, hexToRgba(style.ring, 0))
            vertical.addColorStop(0.5, hexToRgba(style.core, 0.34 * alpha))
            vertical.addColorStop(1, hexToRgba(style.ring, 0))
            ctx.stroke()
            ctx.strokeStyle = vertical
            ctx.beginPath()
            ctx.moveTo(point.x, point.y - flare * 0.75)
            ctx.lineTo(point.x, point.y + flare * 0.75)
            ctx.stroke()
          }

          if (node.meta?.live === true && node.meta.hasMemory === false) {
            ctx.globalAlpha = Math.min(1, alpha * 0.8)
            ctx.strokeStyle = style.ring
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(point.x, point.y, radius * 2.1 + 3, 0, Math.PI * 2)
            ctx.stroke()
          }

          if (this.path !== undefined && this.path.nodes.has(node.id)) {
            ctx.globalAlpha = 0.9
            ctx.strokeStyle = '#ffe29a'
            ctx.lineWidth = 1.1
            ctx.beginPath()
            ctx.arc(point.x, point.y, radius * 1.9 + 5, 0, Math.PI * 2)
            ctx.stroke()
          }
          if (node === this.selected || node === this.locked) {
            ctx.globalAlpha = 0.95
            ctx.strokeStyle = style.ring
            ctx.lineWidth = 1.2
            ctx.beginPath()
            ctx.arc(point.x, point.y, radius * 2.6 + 6, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
        ctx.globalAlpha = 1

        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1

        // unlit constellation
        if (this.pendingSpace) {
          const spread = clusterSpread(this.nodes.length)
          const point = project(centre.x, centre.y + spread * 0.9, centre.z)
          if (point !== null) {
            ctx.save()
            ctx.setLineDash([5, 7])
            ctx.strokeStyle = 'rgba(124,240,192,0.3)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(point.x, point.y, Math.max(40, 74 * point.scale), 0, Math.PI * 2)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.globalAlpha = 0.55
            ctx.font = `400 11px ${FONT_STACK}`
            ctx.fillStyle = '#7cf0c0'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(t('space.pending'), point.x, point.y)
            ctx.globalAlpha = 1
            ctx.restore()
          }
        }

        // labels, nearest first, with collision avoidance
        const labelled = new Set()
        const candidates = [...this.nodes]
          .filter((node) => projected.has(node.id) && node.kind !== 'file' && node.kind !== 'session')
          .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || projected.get(a.id).depth - projected.get(b.id).depth)
        const budget = Math.max(10, Math.min(30, Math.round((1100 / Math.max(0.6, 1500 / dist)) * 0.55)))
        for (const node of candidates) {
          if (labelled.size >= budget) break
          labelled.add(node.id)
        }
        if (focus !== undefined) {
          labelled.add(focus.id)
          for (const edge of this.adjacency.get(focus.id) ?? []) {
            labelled.add(edge.source.id)
            labelled.add(edge.target.id)
          }
        }

        const placed = []
        const collides = (rect) => placed.some((other) => !(rect.x2 < other.x1 || rect.x1 > other.x2 || rect.y2 < other.y1 || rect.y1 > other.y2))
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (const node of order) {
          if (!labelled.has(node.id)) continue
          const point = projected.get(node.id)
          if (point.x < 40 || point.y < 20 || point.x > width - 40 || point.y > height - 20) continue
          const style = KIND_STYLE[node.kind] ?? KIND_STYLE.document
          const fog = Math.min(0.9, Math.max(0, (point.depth - dist * 0.6) / (dist * 1.5)))
          if (focus !== undefined && !this.highlight.has(node.id) && node.id !== focus.id) continue
          const size = Math.max(9, Math.min(14, 9.5 + (node.weight ?? 1) * 0.5) * Math.min(1.15, Math.max(0.85, 1400 / point.depth)))
          ctx.font = `${node.kind === 'document' ? 500 : 400} ${size}px ${FONT_STACK}`
          const text = node.label.length > 26 ? node.label.slice(0, 25) + '…' : node.label
          const textWidth = ctx.measureText(text).width
          const baseY = point.y + Math.max(9, Math.min(40, this.radiusOf(node) * point.scale)) + 8
          const pinned = focus !== undefined && (node.id === focus.id || this.highlight.has(node.id))
          let placedY
          for (const offset of [0, 15, -15, 30]) {
            const candidate = baseY + offset
            const rect = { x1: point.x - textWidth / 2 - 3, x2: point.x + textWidth / 2 + 3, y1: candidate - 7, y2: candidate + 7 }
            if (pinned || !collides(rect)) {
              placed.push(rect)
              placedY = candidate
              break
            }
          }
          if (placedY === undefined) continue
          const anchorY = point.y + Math.max(7, Math.min(40, this.radiusOf(node) * point.scale))
          if (placedY - anchorY > 11) {
            ctx.globalAlpha = (focus === undefined ? 0.3 : 0.45) * (1 - fog)
            ctx.strokeStyle = hexToRgba(style.ring, 0.55)
            ctx.lineWidth = 0.7
            ctx.beginPath()
            ctx.moveTo(point.x, anchorY)
            ctx.lineTo(point.x, placedY - 7)
            ctx.stroke()
          }
          ctx.globalAlpha = (focus === undefined ? 0.84 : 0.98) * (1 - fog * 0.75)
          ctx.fillStyle = node.kind === 'document' ? '#eaf6ff' : style.ring
          ctx.fillText(text, point.x, placedY)
        }
        ctx.globalAlpha = 1

        // stratum labels for the layered layout
        if (this.layout === 'layers') {
          const heights = [['space', 720], ['skill', 470], ['document', 160], ['runtime', -70], ['session', -320], ['file', -490]]
          const present = new Set(this.nodes.filter((node) => this.lodVisible(node)).map((node) => node.kind))
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          for (const [kind, y] of heights) {
            if (!present.has(kind)) continue
            const point = project(centre.x, y, centre.z)
            if (point === null || point.y < 16 || point.y > height - 16) continue
            ctx.globalAlpha = 0.55
            ctx.strokeStyle = 'rgba(150,200,255,0.28)'
            ctx.lineWidth = 0.8
            ctx.beginPath()
            ctx.moveTo(16, point.y)
            ctx.lineTo(70, point.y)
            ctx.stroke()
            ctx.globalAlpha = 0.7
            ctx.fillStyle = KIND_STYLE[kind]?.ring ?? '#9fb6ff'
            ctx.font = `500 10.5px ${FONT_STACK}`
            ctx.fillText(t(`kind.${kind}`), 76, point.y)
          }
          ctx.globalAlpha = 1
        }

        // orientation compass
        const compassX = width - 34
        const compassY = height - 34
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 0.5
        ctx.strokeStyle = 'rgba(150,190,255,0.4)'
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.arc(compassX, compassY, 18, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        if (typeof ctx.ellipse === 'function') {
          ctx.ellipse(compassX, compassY, 18, Math.max(2.5, Math.abs(Math.sin(this.view.pitch)) * 18), 0, 0, Math.PI * 2)
        } else {
          ctx.arc(compassX, compassY, 18, 0, Math.PI * 2)
        }
        ctx.stroke()
        const headingX = Math.sin(this.view.yaw) * Math.cos(this.view.pitch) * 18
        const headingY = -Math.sin(this.view.pitch) * 18
        ctx.globalAlpha = 0.85
        ctx.fillStyle = '#9fd0ff'
        ctx.beginPath()
        ctx.arc(compassX + headingX, compassY + headingY, 2.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1

        // hover tooltip
        const tip = this.selected === undefined ? this.hovered : undefined
        if (tip !== undefined && this.pointer.inside) {
          const point = projected.get(tip.id)
          if (point !== undefined) {
            const style = KIND_STYLE[tip.kind] ?? KIND_STYLE.document
            const text = tip.label.length > 32 ? tip.label.slice(0, 31) + '…' : tip.label
            ctx.font = `500 12px ${FONT_STACK}`
            const boxWidth = Math.min(320, ctx.measureText(text).width + 38)
            const x = Math.min(width - boxWidth - 10, Math.max(10, point.x + 16))
            const y = Math.min(height - 36, Math.max(10, point.y - 32))
            ctx.globalAlpha = 0.97
            ctx.beginPath()
            if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, boxWidth, 27, 8)
            else ctx.rect(x, y, boxWidth, 27)
            ctx.fillStyle = 'rgba(7,11,20,0.9)'
            ctx.fill()
            ctx.strokeStyle = hexToRgba(style.ring, 0.55)
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.fillStyle = style.ring
            ctx.beginPath()
            ctx.arc(x + 14, y + 13.5, 2.8, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = '#e8f2ff'
            ctx.textAlign = 'left'
            ctx.textBaseline = 'middle'
            ctx.fillText(text, x + 23, y + 13.8)
            ctx.globalAlpha = 1
          }
        }
      }
    }

    function exposeNode(node, map) {
      return {
        node: {
          id: node.id,
          kind: node.kind,
          label: node.label,
          sub: node.sub,
          ts: node.ts,
          weight: node.weight,
          meta: node.meta ?? {},
        },
        relations: (map?.adjacency?.get(node.id) ?? []).map((edge) => {
          const other = edge.source.id === node.id ? edge.target : edge.source
          return {
            id: other.id,
            kind: edge.kind,
            label: other.label,
            nodeKind: other.kind,
            sessionId: typeof other.meta?.sessionId === 'string' ? other.meta.sessionId : undefined,
            live: other.meta?.live === true,
          }
        }),
        degree: map?.degree?.get(node.id) ?? 0,
        pathLength: map?.path?.length,
        relatedSessionId: (map?.adjacency?.get(node.id) ?? [])
          .map((edge) => (edge.source.id === node.id ? edge.target : edge.source))
          .filter((other) => other.kind === 'session' && typeof other.meta?.sessionId === 'string')
          .sort((a, b) => String(b.ts ?? '').localeCompare(String(a.ts ?? '')))
          .map((other) => other.meta.sessionId)[0],
      }
    }

    /** Blend one hex colour toward another, for aerial perspective. */
    function mixHex(hex, towards, amount) {
      const parse = (value) => {
        const raw = value.replace('#', '')
        const full = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw
        const int = parseInt(full, 16)
        return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
      }
      const [r1, g1, b1] = parse(hex)
      const [r2, g2, b2] = parse(towards)
      const mix = (a, b) => Math.round(a + (b - a) * amount)
      return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)].map((value) => value.toString(16).padStart(2, '0')).join('')}`
    }

    function hexToRgba(hex, alpha) {
      const value = hex.replace('#', '')
      const int = parseInt(value.length === 3 ? value.split('').map((char) => char + char).join('') : value, 16)
      const r = (int >> 16) & 255
      const g = (int >> 8) & 255
      const b = int & 255
      return `rgba(${r},${g},${b},${alpha})`
    }

    /**
     * Read every conversation this profile still knows about, including those
     * that never produced a memory document. `sessionList` is the Session list
     * snapshot ({ ids, byId }), `workspaces` carries the archive set.
     */
    function readLiveSessions(sessionList, workspaces) {
      try {
        const store = workspaces?.list
        const snapshot = typeof store?.getSnapshot === 'function' ? store.getSnapshot() : undefined
        const archived = new Set(Array.isArray(snapshot?.archivedSessionIds) ? snapshot.archivedSessionIds : [])
        const out = new Map()
        const byId = sessionList?.byId
        if (byId !== null && byId !== undefined && typeof byId === 'object') {
          for (const [id, summary] of Object.entries(byId)) {
            if (summary === null || summary === undefined || typeof summary !== 'object') continue
            if (summary.blank === true) continue
            out.set(id, {
              id,
              title: typeof summary.title === 'string' && summary.title.trim() !== '' ? summary.title.trim() : undefined,
              updatedAt: typeof summary.updatedAt === 'number' ? new Date(summary.updatedAt).toISOString() : undefined,
              hasMemory: false,
              uiArchived: archived.has(id),
            })
          }
        }
        if (out.size === 0 && Array.isArray(snapshot?.items)) {
          for (const group of snapshot.items) {
            const ids = Array.isArray(group?.sessionIds) ? group.sessionIds : []
            for (const id of ids) {
              if (typeof id !== 'string' || id === '' || out.has(id)) continue
              out.set(id, { id, title: undefined, updatedAt: undefined, hasMemory: false, uiArchived: archived.has(id) })
            }
          }
        }
        return [...out.values()]
          .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
          .slice(0, 200)
      } catch {
        return []
      }
    }

    // ---------------------------------------------------------------------
    // styles
    // ---------------------------------------------------------------------
    const CSS = `
.dsh-msm-view { display:flex; flex-direction:column; height:100%; min-height:0; position:relative;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family, ${FONT_STACK}); }
.dsh-msm-head { display:flex; align-items:center; gap:14px; padding:14px 20px 10px; flex-wrap:wrap; }
.dsh-msm-title { display:flex; flex-direction:column; gap:2px; min-width:0; }
.dsh-msm-title strong { font-size:15px; font-weight:600; letter-spacing:.01em; }
.dsh-msm-title span { font-size:11.5px; color: var(--dsw-alias-label-tertiary); }
.dsh-msm-spacer { flex:1 1 auto; }
.dsh-msm-search { position:relative; display:flex; align-items:center; }
.dsh-msm-search input { width:230px; height:30px; padding:0 10px 0 30px; font-size:12.5px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1);
  border:1px solid var(--dsw-alias-border-l1); border-radius:8px; outline:none; }
.dsh-msm-search input:focus { border-color: var(--dsw-alias-brand-primary); }
.dsh-msm-search svg { position:absolute; left:9px; opacity:.55; }
.dsh-msm-btn { height:30px; padding:0 11px; font-size:12.5px; display:inline-flex; align-items:center; gap:6px;
  color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1);
  border:1px solid var(--dsw-alias-border-l1); border-radius:8px; cursor:pointer; }
.dsh-msm-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-msm-btn[data-active="true"] { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-interactive-bg-active); }
.dsh-msm-bar { display:flex; align-items:center; gap:8px; padding:0 20px 10px; flex-wrap:wrap; }
.dsh-msm-chip { height:24px; padding:0 10px; border-radius:999px; font-size:11.5px; display:inline-flex;
  align-items:center; gap:6px; cursor:pointer; color: var(--dsw-alias-label-secondary);
  background: transparent; border:1px solid var(--dsw-alias-border-l1); }
.dsh-msm-chip:hover { color: var(--dsw-alias-label-primary); }
.dsh-msm-chip[data-on="false"] { opacity:.42; }
.dsh-msm-dot { width:7px; height:7px; border-radius:50%; box-shadow:0 0 8px currentColor; }
.dsh-msm-stage { position:relative; flex:1 1 auto; min-height:0; margin:0 12px 12px; border-radius:14px;
  overflow:hidden; border:1px solid var(--dsw-alias-border-l1); background:#04060d; }
.dsh-msm-canvas { position:absolute; inset:0; width:100%; height:100%; outline:none; cursor:grab; }
.dsh-msm-card { position:absolute; top:14px; right:14px; width:302px; max-height:calc(100% - 28px); overflow:auto;
  padding:14px 14px 12px; border-radius:12px; background: var(--dsw-alias-bg-overlay);
  border:1px solid var(--dsw-alias-border-l1); box-shadow: var(--dsw-shadow-lv2); backdrop-filter: blur(10px); }
.dsh-msm-card header { display:flex; align-items:flex-start; gap:8px; margin-bottom:8px; }
.dsh-msm-card h3 { font-size:13px; font-weight:600; line-height:1.45; margin:0; flex:1; word-break:break-word; }
.dsh-msm-card .dsh-msm-kind { font-size:10.5px; padding:2px 7px; border-radius:999px;
  border:1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-tertiary); white-space:nowrap; }
.dsh-msm-card p { margin:0 0 10px; font-size:12px; line-height:1.62; color: var(--dsw-alias-label-secondary); word-break:break-word; }
.dsh-msm-card dl { display:grid; grid-template-columns:auto 1fr; gap:3px 10px; margin:0 0 10px; font-size:11.5px; }
.dsh-msm-card dt { color: var(--dsw-alias-label-tertiary); }
.dsh-msm-card dd { margin:0; color: var(--dsw-alias-label-secondary); word-break:break-all; }
.dsh-msm-rel { display:flex; flex-direction:column; gap:3px; margin:0; padding:0; list-style:none; }
.dsh-msm-rel button { display:flex; align-items:center; gap:7px; width:100%; text-align:left; padding:4px 6px;
  border-radius:6px; border:0; background:transparent; color: var(--dsw-alias-label-secondary);
  font-size:11.5px; cursor:pointer; font-family:inherit; }
.dsh-msm-rel button:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-msm-rel span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dsh-msm-rel em { font-style:normal; color: var(--dsw-alias-label-tertiary); font-size:10px; margin-left:auto; }
.dsh-msm-toast { position:absolute; left:50%; top:14px; transform:translateX(-50%); z-index:3;
  padding:7px 14px; border-radius:999px; font-size:12px; color:#dff4ff;
  background: rgba(20,40,70,.92); border:1px solid rgba(126,227,255,.4);
  box-shadow:0 6px 24px rgba(0,0,0,.45); backdrop-filter: blur(8px); pointer-events:none; }
.dsh-msm-timeline { position:absolute; left:14px; right:330px; bottom:12px; display:flex; align-items:center; gap:10px;
  padding:6px 10px; border-radius:10px; background: rgba(8,12,22,.6);
  border:1px solid var(--dsw-alias-border-l1); backdrop-filter: blur(8px); }
.dsh-msm-play { height:26px; padding:0 10px; font-size:11.5px; }
.dsh-msm-btn.dsh-msm-primary { border-color: rgba(126,227,255,.55); color:#dff4ff;
  background: rgba(80,170,255,.14); }
.dsh-msm-btn.dsh-msm-primary:hover { background: rgba(80,170,255,.24); }
.dsh-msm-range { flex:1 1 auto; min-width:80px; height:3px; appearance:none; border-radius:2px; outline:none;
  background: linear-gradient(90deg, rgba(126,227,255,.55), rgba(255,158,210,.4)); }
.dsh-msm-range::-webkit-slider-thumb { appearance:none; width:11px; height:11px; border-radius:50%;
  background:#eaf6ff; box-shadow:0 0 10px rgba(126,227,255,.85); cursor:pointer; }
.dsh-msm-date { font-size:11px; color: var(--dsw-alias-label-tertiary); min-width:74px; text-align:right;
  font-variant-numeric: tabular-nums; }
.dsh-msm-foot { position:absolute; left:14px; bottom:54px; right:320px; display:flex; align-items:center; gap:12px;
  font-size:11px; color: var(--dsw-alias-label-tertiary); pointer-events:none; flex-wrap:wrap; }
.dsh-msm-stats { position:absolute; top:14px; left:14px; display:flex; gap:14px; font-size:11px;
  color: var(--dsw-alias-label-tertiary); pointer-events:none; flex-wrap:wrap; max-width:calc(100% - 340px); }
.dsh-msm-stats b { color: var(--dsw-alias-label-secondary); font-weight:600; margin-left:3px; }
.dsh-msm-state { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:10px; text-align:center; padding:24px; color: var(--dsw-alias-label-tertiary); font-size:12.5px; }
.dsh-msm-state strong { color: var(--dsw-alias-label-primary); font-size:14px; font-weight:600; }
.dsh-msm-spinner { width:22px; height:22px; border-radius:50%; border:2px solid var(--dsw-alias-border-l2);
  border-top-color: var(--dsw-alias-brand-primary); animation: dsh-msm-spin 1s linear infinite; }
@keyframes dsh-msm-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .dsh-msm-spinner { animation:none; } }
`

    // ---------------------------------------------------------------------
    // hooks
    // ---------------------------------------------------------------------
    function useGraph() {
      const [state, setState] = React.useState({ status: 'loading', graph: undefined, error: undefined })
      const [nonce, setNonce] = React.useState(0)
      React.useEffect(() => {
        const controller = new AbortController()
        let alive = true
        setState((current) => ({ ...current, status: 'loading' }))
        fetch(GRAPH_URL, { cache: 'no-store', signal: controller.signal })
          .then(async (response) => {
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
            return response.json()
          })
          .then((graph) => {
            if (!alive) return
            setState({ status: 'ready', graph, error: undefined })
          })
          .catch((error) => {
            if (!alive || error?.name === 'AbortError') return
            setState({ status: 'error', graph: undefined, error: error instanceof Error ? error.message : String(error) })
          })
        return () => {
          alive = false
          controller.abort()
        }
      }, [nonce])
      return { ...state, refresh: () => setNonce((value) => value + 1) }
    }

    function usePreferredReducedMotion() {
      const [reduced, setReduced] = React.useState(false)
      React.useEffect(() => {
        const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
        if (query === undefined || query === null) return undefined
        const update = () => setReduced(query.matches)
        update()
        query.addEventListener?.('change', update)
        return () => query.removeEventListener?.('change', update)
      }, [])
      return reduced
    }

    // ---------------------------------------------------------------------
    // panel
    // ---------------------------------------------------------------------
    function StarMapPage({ services, useSessions }) {
      const { status, graph, error, refresh } = useGraph()
      const canvasRef = React.useRef(null)
      const mapRef = React.useRef(undefined)
      const [selection, setSelection] = React.useState(undefined)
      const [layout, setLayout] = React.useState('force')
      const [range, setRange] = React.useState(0)
      const [query, setQuery] = React.useState('')
      const [hidden, setHidden] = React.useState(() => new Set())
      const [searchHit, setSearchHit] = React.useState(undefined)
      const [sessionTick, setSessionTick] = React.useState(0)
      const [clock, setClock] = React.useState({ playhead: 1, playing: false, date: undefined })
      const [navigateError, setNavigateError] = React.useState(undefined)
      const [note, setNote] = React.useState(undefined)
      const servicesRef = React.useRef(services)
      servicesRef.current = services

      React.useEffect(() => {
        const timer = setInterval(() => {
          const map = mapRef.current
          if (map === undefined) return
          setClock((current) => {
            const playing = map.playing
            const playhead = map.playhead
            if (Math.abs(current.playhead - playhead) < 0.0008 && current.playing === playing) return current
            return { playhead, playing, date: map.currentDate() }
          })
        }, 180)
        return () => clearInterval(timer)
      }, [])

      React.useEffect(() => {
        const tick = () => setSessionTick((value) => value + 1)
        const store = servicesRef.current?.workspaces?.list
        const timer = setTimeout(tick, 900)
        if (typeof store?.subscribe !== 'function') return () => clearTimeout(timer)
        const unsubscribe = store.subscribe(tick)
        return () => {
          clearTimeout(timer)
          unsubscribe()
        }
      }, [])

      // standardProps from the slot owner: the Session list snapshot ({ ids, byId })
      const sessionList = typeof useSessions === 'function' ? useSessions((state) => state) : undefined
      const liveSessions = React.useMemo(
        () => readLiveSessions(sessionList, servicesRef.current?.workspaces),
        [sessionList, sessionTick, graph],
      )

      /** Host graph plus every conversation the workspace store still knows. */
      const merged = React.useMemo(() => {
        if (graph === undefined) return undefined
        const known = new Set()
        for (const node of graph.nodes) {
          if (node.kind === 'session' && typeof node.meta?.sessionId === 'string') known.add(node.meta.sessionId)
        }
        const extra = liveSessions.filter((item) => !known.has(item.id))
        if (extra.length === 0) return graph
        const nodes = graph.nodes.slice()
        for (const item of extra) {
          nodes.push({
            id: `session:${item.id}`,
            kind: 'session',
            label: item.title ?? item.id.slice(0, 8),
            sub: t('session.live'),
            ts: item.updatedAt,
            group: 'live',
            weight: 1.6,
            meta: { sessionId: item.id, hasMemory: false, uiArchived: item.uiArchived === true, live: true },
          })
        }
        const sessions = nodes.filter((node) => node.kind === 'session').length
        return { ...graph, nodes, stats: { ...graph.stats, nodes: nodes.length, sessions } }
      }, [graph, liveSessions])

      React.useEffect(() => {
        const canvas = canvasRef.current
        if (canvas === null || merged === undefined) return undefined
        const map = new StarMap(canvas, {
          onSelect: (value) => setSelection(value),
        })
        mapRef.current = map
        map.setGraph(merged)
        return () => {
          map.dispose()
          mapRef.current = undefined
        }
      }, [merged])

      React.useEffect(() => {
        mapRef.current?.setLayout(layout)
      }, [layout])
      React.useEffect(() => {
        mapRef.current?.setRange(range)
      }, [range])
      React.useEffect(() => {
        mapRef.current?.setHiddenKinds(hidden)
      }, [hidden])

      const kinds = React.useMemo(() => {
        if (merged === undefined) return []
        const counts = new Map()
        for (const node of merged.nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1)
        return KIND_ORDER.filter((kind) => (counts.get(kind) ?? 0) > 0).map((kind) => ({ kind, count: counts.get(kind) }))
      }, [merged])

      React.useEffect(() => {
        const map = mapRef.current
        if (map === undefined) return
        const text = query.trim().toLowerCase()
        if (text === '') {
          setSearchHit(undefined)
          return
        }
        const hit = map.nodes
          .filter((node) => `${node.label} ${node.sub ?? ''}`.toLowerCase().includes(text))
          .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0]
        setSearchHit(hit === undefined ? null : hit.id)
        if (hit !== undefined) {
          map.select(hit)
          map.focusOn(hit)
          setSelection(map.exposeNode(hit))
        }
      }, [query, graph])

      const toggleKind = (kind) => {
        setHidden((current) => {
          const next = new Set(current)
          if (next.has(kind)) next.delete(kind)
          else next.add(kind)
          return next
        })
      }

      const detail = selection
      const stats = merged?.stats
      const warnings = Array.isArray(graph?.warnings) ? graph.warnings.filter(Boolean) : []
      const liveCount = merged === undefined
        ? 0
        : merged.nodes.filter((node) => node.meta?.live === true && node.meta.hasMemory === false).length

      return h(
        'div',
        { className: 'dsh-msm-view', 'data-dsh-plugin': 'memory-starmap' },
        h('style', { key: 'style' }, CSS),
        h(
          'div',
          { className: 'dsh-msm-head', key: 'head' },
          h('div', { className: 'dsh-msm-title' },
            h('strong', null, t('page.title')),
            h('span', null, `${t('page.subtitle')} · ${t('page.tagline')}`)),
          h('div', { className: 'dsh-msm-spacer' }),
          h('label', { className: 'dsh-msm-search' },
            h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
              h('circle', { cx: 7, cy: 7, r: 4.4, stroke: 'currentColor', strokeWidth: 1.4 }),
              h('path', { d: 'M10.6 10.6 L14 14', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' })),
            h('input', {
              value: query,
              placeholder: t('action.search'),
              onChange: (event) => setQuery(event.target.value),
              'aria-label': t('action.search'),
            })),
          h('button', {
            className: 'dsh-msm-btn',
            type: 'button',
            onClick: () => {
              const map = mapRef.current
              if (map === undefined) return
              const dated = map.nodes.filter((node) => node.kind === 'document' && node.seen !== undefined)
              const latest = dated.sort((a, b) => b.seen - a.seen)[0]
              if (latest === undefined) return
              map.select(latest)
              map.focusOn(latest)
              setSelection(map.exposeNode(latest))
            },
          }, t('action.latest')),
          h('button', {
            className: 'dsh-msm-btn dsh-msm-primary',
            type: 'button',
            onClick: () => {
              const map = mapRef.current
              if (map === undefined) return
              const text = map.handoff(selection)
              const download = () => {
                try {
                  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const anchor = document.createElement('a')
                  anchor.href = url
                  anchor.download = `dsh-handoff-${Date.now()}.md`
                  anchor.click()
                  setTimeout(() => URL.revokeObjectURL(url), 4000)
                  setNote(t('action.handoffFail'))
                } catch {
                  setNote(t('action.handoffFail'))
                }
              }
              if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText !== undefined) {
                navigator.clipboard.writeText(text).then(() => setNote(t('action.handoffDone')), download)
              } else download()
              setTimeout(() => setNote(undefined), 4200)
            },
          }, t('action.handoff')),
          h('button', { className: 'dsh-msm-btn', type: 'button', onClick: () => { mapRef.current?.fit(); setQuery(''); mapRef.current?.select(undefined); setSelection(undefined) } }, t('action.reset')),
          h('button', { className: 'dsh-msm-btn', type: 'button', onClick: refresh }, t('action.refresh'))),
        h(
          'div',
          { className: 'dsh-msm-bar', key: 'bar' },
          ['force', 'orbital', 'cluster', 'layers'].map((id) =>
            h('button', {
              key: id,
              className: 'dsh-msm-btn',
              type: 'button',
              'data-active': layout === id ? 'true' : 'false',
              onClick: () => setLayout(id),
            }, t(`layout.${id}`))),
          h('span', { style: { width: 1, height: 18, background: 'var(--dsw-alias-border-l1)', margin: '0 4px' } }),
          [[0, 'range.all'], [30, 'range.30'], [90, 'range.90']].map(([days, key]) =>
            h('button', {
              key,
              className: 'dsh-msm-btn',
              type: 'button',
              'data-active': range === days ? 'true' : 'false',
              onClick: () => setRange(days),
            }, t(key))),
          h('span', { style: { width: 1, height: 18, background: 'var(--dsw-alias-border-l1)', margin: '0 4px' } }),
          kinds.map(({ kind, count }) =>
            h('button', {
              key: kind,
              className: 'dsh-msm-chip',
              type: 'button',
              'data-on': hidden.has(kind) ? 'false' : 'true',
              onClick: () => toggleKind(kind),
              title: t(`kind.${kind}`),
            },
              h('i', { className: 'dsh-msm-dot', style: { background: KIND_STYLE[kind]?.ring ?? '#8fa8ff', color: KIND_STYLE[kind]?.ring ?? '#8fa8ff' } }),
              `${t(`kind.${kind}`)} ${count}`))),
        h(
          'div',
          { className: 'dsh-msm-stage', key: 'stage' },
          h('canvas', { ref: canvasRef, className: 'dsh-msm-canvas', tabIndex: 0, 'aria-label': t('page.title') }),
          note === undefined ? null : h('div', { className: 'dsh-msm-toast' }, note),
          stats === undefined ? null : h('div', { className: 'dsh-msm-stats' },
            h('span', null, t('stats.nodes'), h('b', null, stats.nodes)),
            h('span', null, t('stats.edges'), h('b', null, stats.edges)),
            h('span', null, t('stats.documents'), h('b', null, stats.documents)),
            h('span', null, t('stats.sessions'), h('b', null, stats.sessions)),
            h('span', null, t('stats.files'), h('b', null, stats.files)),
            h('span', null, t('stats.skills'), h('b', null, stats.skills)),
            h('span', null, t('stats.runtime'), h('b', null, stats.runtime))),
          detail === undefined ? null : h(StarCard, {
            key: 'card',
            detail,
            navigateError,
            onFocus: (id) => {
              const map = mapRef.current
              const target = map?.byId.get(id)
              if (map !== undefined && target !== undefined) {
                map.select(target)
                map.focusOn(target)
                setSelection(map.exposeNode(target))
              }
            },
            onOpenSession: (sessionId) => {
              const problem = servicesRef.current?.openSession?.(sessionId)
              setNavigateError(problem === undefined ? undefined : String(problem))
            },
            onClose: () => {
              mapRef.current?.select(undefined)
              setSelection(undefined)
            },
          }),
          merged === undefined ? null : h('div', { className: 'dsh-msm-timeline' },
            h('button', {
              className: 'dsh-msm-btn dsh-msm-play',
              type: 'button',
              onClick: () => {
                const map = mapRef.current
                if (map === undefined) return
                if (map.playing) map.playing = false
                else {
                  if (map.playhead >= 0.999) map.playhead = 0
                  map.playing = true
                }
                setClock({ playhead: map.playhead, playing: map.playing, date: map.currentDate() })
              },
            }, clock.playing ? t('timeline.pause') : t('timeline.play')),
            h('input', {
              className: 'dsh-msm-range',
              type: 'range',
              min: 0,
              max: 1000,
              step: 1,
              value: Math.round(clock.playhead * 1000),
              'aria-label': t('timeline.hint'),
              onChange: (event) => {
                const value = Number(event.target.value) / 1000
                const map = mapRef.current
                if (map !== undefined) map.setPlayhead(value)
                if (range !== 0) setRange(0)
                setClock({ playhead: value, playing: false, date: map === undefined ? undefined : map.currentDate() })
              },
            }),
            h('span', { className: 'dsh-msm-date' }, clock.date === undefined
              ? '—'
              : `${clock.date.getFullYear()}-${String(clock.date.getMonth() + 1).padStart(2, '0')}-${String(clock.date.getDate()).padStart(2, '0')}`)),
          h('div', { className: 'dsh-msm-foot' },
            liveCount > 0 ? h('span', { style: { color: 'rgba(180,156,255,.85)' } }, `${t('legend.live')} ${liveCount}`) : null,
            h('span', null, t('legend.hint')),
            h('span', { style: { opacity: 0.75 } }, t('legend.trace')),
            h('span', null, t('legend.hidden')),
            warnings.length === 0 ? null : h('span', { style: { opacity: 0.75 } }, warnings[0])),
          status === 'loading' && graph === undefined
            ? h('div', { className: 'dsh-msm-state' }, h('div', { className: 'dsh-msm-spinner' }), h('span', null, t('state.loading')))
            : null,
          status === 'error'
            ? h('div', { className: 'dsh-msm-state' },
                h('strong', null, t('state.error')),
                h('span', null, error ?? ''),
                h('button', { className: 'dsh-msm-btn', type: 'button', onClick: refresh }, t('state.retry')))
            : null,
          status === 'ready' && (merged?.nodes.length ?? 0) === 0
            ? h('div', { className: 'dsh-msm-state' },
                h('strong', null, t('state.empty')),
                h('span', null, t('state.emptyHint')))
            : null),
        searchHit === null && query.trim() !== ''
          ? h('div', { style: { padding: '0 20px 8px', fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)' } }, '没有匹配的星点')
          : null)
    }

    function StarCard({ detail, onFocus, onClose, onOpenSession, navigateError }) {
      const { node, relations, degree } = detail
      const colour = KIND_STYLE[node.kind]?.ring ?? '#9fb6ff'
      const meta = node.meta ?? {}
      const rows = []
      if (node.kind === 'session') {
        const hasMemory = meta.live === true ? false : true
        rows.push([t('detail.memory'), hasMemory ? t('detail.memoryYes') : t('detail.memoryNo')])
      }
      if (meta.status !== undefined) rows.push([t('detail.status'), String(meta.status)])
      if (meta.sizeBytes !== undefined) rows.push([t('detail.size'), formatBytes(meta.sizeBytes)])
      if (meta.updatedAt !== undefined) rows.push([t('detail.updated'), formatDate(meta.updatedAt)])
      if (meta.relativePath !== undefined) rows.push([t('detail.path'), String(meta.relativePath)])
      if (meta.path !== undefined) rows.push([t('detail.path'), String(meta.path)])
      if (meta.root !== undefined) rows.push(['root', String(meta.root).split(/[\\/]/u).slice(-2).join('/')])
      if (node.kind === 'session' && meta.sessionId !== undefined) rows.push(['session', String(meta.sessionId).slice(0, 8)])
      return h('aside', { className: 'dsh-msm-card' },
        h('header', null,
          h('h3', null, node.label),
          h('span', { className: 'dsh-msm-kind', style: { color: colour, borderColor: colour } }, t(`kind.${node.kind}`))),
        node.sub !== undefined && node.sub !== '' ? h('p', null, node.sub) : null,
        rows.length === 0 ? null : h('dl', null, rows.flatMap(([key, value]) => [h('dt', { key: key + '-k' }, key), h('dd', { key: key + '-v' }, value)])),
        detail.pathLength === undefined ? null : h('div', {
          style: { fontSize: 11.5, color: '#ffe29a', margin: '2px 0 8px' },
        }, `${t('detail.pathLength')} · ${detail.pathLength}`),
        relations.length === 0 ? null : h('div', null,
          h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', margin: '2px 0 5px' } }, `${t('detail.relation')} · ${degree}`),
          h('ul', { className: 'dsh-msm-rel' },
            relations.slice(0, 40).map((relation) =>
              h('li', { key: relation.id + relation.kind },
                h('button', {
                  type: 'button',
                  title: typeof relation.sessionId === 'string' ? t('detail.openSession') : undefined,
                  onClick: () => {
                    if (typeof relation.sessionId === 'string' && relation.nodeKind === 'session' && onOpenSession !== undefined) onOpenSession(relation.sessionId)
                    else onFocus(relation.id)
                  },
                },
                  h('i', { className: 'dsh-msm-dot', style: { background: KIND_STYLE[relation.nodeKind]?.ring ?? '#9fb6ff', color: KIND_STYLE[relation.nodeKind]?.ring ?? '#9fb6ff' } }),
                  h('span', null, relation.label),
                  h('em', null, relation.nodeKind === 'session' && typeof relation.sessionId === 'string' ? t('detail.openSession') : relation.kind)))))),
        navigateError === undefined ? null : h('p', {
          style: { fontSize: 11.5, color: '#ff9dbc', margin: '6px 0 0' },
        }, `${t('detail.openFailed')} · ${navigateError}`),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' } },
          h('button', { className: 'dsh-msm-btn', type: 'button', onClick: () => onFocus(node.id) }, t('detail.open')),
          node.kind === 'session' && typeof meta.sessionId === 'string' && onOpenSession !== undefined
            ? h('button', { className: 'dsh-msm-btn dsh-msm-primary', type: 'button', onClick: () => onOpenSession(meta.sessionId) }, t('detail.openSession'))
            : null,
          node.kind === 'document' && typeof detail.relatedSessionId === 'string' && onOpenSession !== undefined
            ? h('button', { className: 'dsh-msm-btn dsh-msm-primary', type: 'button', onClick: () => onOpenSession(detail.relatedSessionId) }, t('detail.openSourceSession'))
            : null,
          h('button', { className: 'dsh-msm-btn', type: 'button', onClick: onClose }, t('action.clear'))))
    }

    /** A paste-ready handoff note: what this map knows, so a fresh conversation can reload it. */
    function buildHandoff(map, detail, limit = 30) {
      const pad = (value) => String(value).padStart(2, '0')
      const now = new Date()
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
      const docs = map.nodes
        .filter((node) => node.kind === 'document')
        .sort((a, b) => String(b.seen ?? b.ts ?? '').localeCompare(String(a.seen ?? a.ts ?? '')))
        .slice(0, limit)
      const lives = map.nodes.filter((node) => node.meta?.live === true && node.meta.hasMemory === false)
      const sessions = map.nodes.filter((node) => node.kind === 'session').length
      const files = map.nodes.filter((node) => node.kind === 'file').length
      const skills = map.nodes.filter((node) => node.kind === 'skill').length
      const lines = []
      lines.push(`# 上下文交接 · ${stamp}`)
      lines.push('')
      lines.push('> 由记忆星图导出。新会话里先读下面这些档案，就能接上之前的状态。')
      lines.push('')
      if (detail !== undefined) {
        const meta = detail.node.meta ?? {}
        lines.push('## 当前焦点')
        lines.push(`- ${detail.node.label}`)
        if (meta.relativePath !== undefined) lines.push(`- 档案：\`${meta.relativePath}\``)
        if (detail.degree > 0) lines.push(`- 关联 ${detail.degree} 条`)
        lines.push('')
      }
      lines.push(`## 最近记忆（${docs.length} 篇）`)
      docs.forEach((node, index) => {
        const meta = node.meta ?? {}
        const when = String(meta.updatedAt ?? node.ts ?? node.seen ?? '').slice(0, 10)
        const where = meta.relativePath ?? meta.path ?? meta.root ?? ''
        lines.push(`${index + 1}. **${node.label}**${when === '' ? '' : ` — ${when}`}${where === '' ? '' : ` · \`${where}\``}`)
        const summary = String(node.sub ?? '').replace(/\s+/gu, ' ').trim()
        if (summary !== '') lines.push(`   > ${summary.slice(0, 160)}`)
      })
      lines.push('')
      if (lives.length > 0) {
        lines.push(`## 未归档对话（${lives.length} 段，记忆里没有，需要时再翻）`)
        lives
          .sort((a, b) => String(b.ts ?? '').localeCompare(String(a.ts ?? '')))
          .slice(0, 15)
          .forEach((node) => lines.push(`- ${node.label}（${String(node.meta?.sessionId ?? '').slice(0, 8)}）`))
        lines.push('')
      }
      lines.push('## 图统计')
      lines.push(`星点 ${map.nodes.length} · 连线 ${map.edges.length} · 档案 ${docs.length} · 会话 ${sessions} · 源码 ${files} · 技能 ${skills}`)
      return lines.join(String.fromCharCode(10))
    }

    // ---------------------------------------------------------------------
    // sidebar glyph
    // ---------------------------------------------------------------------
    function StarGlyph({ size = 18, active = false }) {
      const main = active ? '#ffffff' : 'currentColor'
      const accent = active ? '#9fe8ff' : '#6fb4ff'
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M4.2 16.8 L9.4 8.3 L13.2 13.4 L16.1 9.6 L19.8 16.8', stroke: main, strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.9 }),
        h('circle', { cx: 9.4, cy: 8.3, r: 1.7, fill: accent }),
        h('circle', { cx: 16.1, cy: 9.6, r: 1.25, fill: accent, opacity: 0.85 }),
        h('circle', { cx: 4.2, cy: 16.8, r: 0.95, fill: main, opacity: 0.8 }),
        h('circle', { cx: 19.8, cy: 16.8, r: 1.05, fill: main, opacity: 0.8 }),
        h('circle', { cx: 13.2, cy: 13.4, r: 0.8, fill: accent, opacity: 0.7 }))
    }

    // ---------------------------------------------------------------------
    // plugin
    // ---------------------------------------------------------------------
    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'memory-starmap: dictionaries')
        try {
          translate = ctx.locale.bind(NS)
        } catch {
          translate = (key) => key
        }
        // Live conversations come from the workspace store; navigation through uiWorkspace.
        const services = {
          get workspaces() {
            try {
              return ctx.get('workspaces', false)
            } catch {
              return undefined
            }
          },
          openSession(sessionId) {
            if (typeof sessionId !== 'string' || sessionId === '') return 'no-session'
            // uiWorkspace.openSession keeps the session retained, selects it in the
            // session controller and returns the main view to the default panel,
            // which is the conversation. Switching the panel ourselves would fight it.
            try {
              const workspace = ctx.get('uiWorkspace')
              if (workspace === undefined || typeof workspace.openSession !== 'function') return 'no-service'
              workspace.openSession(sessionId)
              return undefined
            } catch (reason) {
              // A retired session cannot be revealed; leave the panel where it is.
              ctx.logger?.warn?.('memory-starmap: openSession failed', reason)
              try {
                ctx.layout?.selectPanel?.(null)
              } catch {
                /* layout is optional */
              }
              return reason instanceof Error ? reason.message : 'failed'
            }
          },
        }
        const Page = (props) => h(StarMapPage, { ...props, services })

        const disposers = []
        disposers.push(ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: PANEL_ORDER,
          label: () => t('nav.label'),
        }, StarGlyph)))
        disposers.push(ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
        }, Page)))
        ctx.effect(() => () => {
          for (const dispose of disposers.splice(0)) dispose()
        }, 'memory-starmap: ui mounts')
      },
    }
  },
})