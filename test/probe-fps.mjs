// Staged real-GPU measurement: attributes frame cost to sky / edges / star halos /
// small dots / labels / additive blending on this machine.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]
const exe = BROWSERS.find((path) => existsSync(path))
if (exe === undefined) {
  console.log('no chromium browser found')
  process.exit(0)
}

const port = 9422 + Math.floor(Math.random() * 200)
const profile = mkdtempSync(join(tmpdir(), 'starmap-probe-'))
const pageUrl = new URL('./frame-probe.html', import.meta.url).href
const headless = process.env.PROBE_HEADLESS !== '0'
const child = spawn(exe, [
  ...(headless ? ['--headless=new'] : ['--window-position=80,80']),
  ...(process.env.PROBE_GPU === '1'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit']
    : ['--disable-gpu']),
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars',
  '--window-size=1440,860', '--allow-file-access-from-files',
  pageUrl,
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function targetUrl() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl !== undefined)
      if (page !== undefined) return page.webSocketDebuggerUrl
    } catch { /* starting */ }
    await sleep(250)
  }
  throw new Error('devtools endpoint never appeared')
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    let id = 0
    const pending = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      const entry = pending.get(message.id)
      if (entry === undefined) return
      pending.delete(message.id)
      if (message.error !== undefined) entry.reject(new Error(message.error.message))
      else entry.resolve(message.result)
    })
    socket.addEventListener('open', () => resolve({
      send(method, params) {
        id += 1
        const current = id
        return new Promise((res, rej) => {
          pending.set(current, { resolve: res, reject: rej })
          socket.send(JSON.stringify({ id: current, method, params: params ?? {} }))
        })
      },
      close() { socket.close() },
    }))
    socket.addEventListener('error', () => reject(new Error('cdp socket failed')))
  })
}

let client
try {
  client = await connect(await targetUrl())
  await client.send('Runtime.enable')
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await client.send('Runtime.evaluate', { expression: 'window.__ready === true', returnByValue: true })
    if (ready.result?.value === true) break
    await sleep(150)
  }
  const useBitmap = process.env.PROBE_BITMAP === '1'
  if (useBitmap) {
    const kind = await client.send('Runtime.evaluate', { expression: 'window.probe.useBitmap()', awaitPromise: true, returnByValue: true })
    console.log('sprite source is now:', kind.result.value)
  }
  await client.send('Runtime.evaluate', { expression: 'window.probe.start()', returnByValue: true, awaitPromise: true })
  await sleep(600)

  const gpu = await client.send('Runtime.evaluate', {
    expression: `(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl'); if (gl === null) return 'no webgl'; const i = gl.getExtension('WEBGL_debug_renderer_info'); return i === null ? 'unknown' : gl.getParameter(i.UNMASKED_RENDERER_WEBGL) })()`,
    returnByValue: true,
  })

  const stages = [
    ['empty (clear only)', 1 & 0],
    ['sky blit', 1],
    ['sky + edges', 1 | 2],
    ['sky + edges + halo stars (additive)', 1 | 2 | 4 | 32],
    ['sky + edges + halo stars (normal blend)', 1 | 2 | 4],
    ['sky + edges + small dots only', 1 | 2 | 8],
    ['everything', 1 | 2 | 4 | 8 | 16 | 32],
    ['everything, no additive blend', 1 | 2 | 4 | 8 | 16],
  ]

  console.log('')
  console.log('renderer:', gpu.result.value)
  console.log('gpu mode:', process.env.PROBE_GPU === '1' ? 'on' : 'off', '| headless:', headless ? 'yes' : 'no')
  console.log('')
  console.log('stage'.padEnd(42), 'frames', '  mean', '  p50', '  p95')
  const results = []
  for (const [name, mask] of stages) {
    await client.send('Runtime.evaluate', { expression: `window.probe.setStage(${mask})`, returnByValue: true })
    await client.send('Runtime.evaluate', { expression: 'window.probe.run(500)', awaitPromise: true, returnByValue: true })
    const measured = await client.send('Runtime.evaluate', {
      expression: 'window.probe.run(1600)',
      awaitPromise: true,
      returnByValue: true,
    })
    const stats = measured.result.value
    results.push([name, stats])
    if (stats.frames === 0) {
      console.log(name.padEnd(42), '   no frames')
      continue
    }
    console.log(
      name.padEnd(42),
      String(stats.frames).padStart(6),
      stats.mean.toFixed(2).padStart(7),
      stats.p50.toFixed(2).padStart(6),
      stats.p95.toFixed(2).padStart(6),
    )
  }
  const baseline = results.find(([name]) => name === 'sky blit')?.[1].mean ?? 0
  const full = results.find(([name]) => name === 'everything')?.[1].mean ?? 0
  console.log('')
  console.log(`sky blit ${baseline.toFixed(2)}ms -> everything ${full.toFixed(2)}ms (added ${(full - baseline).toFixed(2)}ms)`)
  await client.send('Runtime.evaluate', { expression: 'window.probe.stop()', returnByValue: true })
} catch (error) {
  console.log('probe failed:', error.message)
} finally {
  client?.close()
  child.kill()
  await sleep(400)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* locked */ }
}