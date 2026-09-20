import { app, BrowserWindow, ipcMain, Menu, MenuItem, clipboard, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import * as https from 'https'
import { URL } from 'url'
import { spawn } from 'child_process'
import { JsonStore } from './store'
import { LocalDemoServer } from './localDemoServer'
import { McpServer } from './mcp-server'
import { SkillDefinition, SkillParameter, SkillStep, AppUpdateInfo } from '../renderer/src/types'

// 1. Enable Chromium WebMCP Experimental Flags
app.commandLine.appendSwitch('enable-features', 'WebMCPTesting')
app.commandLine.appendSwitch('enable-blink-features', 'WebMCPTesting')

let mainWindow: BrowserWindow | null = null
let store: JsonStore
let demoServer: LocalDemoServer
let mcpServer: McpServer | null = null

const pendingMcpToolCalls = new Map<
  string,
  { resolve: (val: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }
>()

let cachedUpdateInfo: {
  timestamp: number
  data: AppUpdateInfo
} | null = null

function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const c = parse(current)
  const l = parse(latest)
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const cVal = c[i] || 0
    const lVal = l[i] || 0
    if (lVal > cVal) return true
    if (lVal < cVal) return false
  }
  return false
}

async function fetchLatestReleaseFromGitHub(): Promise<{
  latestVersion: string
  releaseUrl: string
  publishedAt: string
  releaseNotes: string
}> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/blue1st/webmcp-deck/releases/latest',
      headers: {
        'User-Agent': 'WebMCP-Deck-Client',
        Accept: 'application/vnd.github.v3+json'
      }
    }

    const req = https.get(options, (res) => {
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(body)
            const tagName = data.tag_name || 'v1.0.0'
            resolve({
              latestVersion: tagName.replace(/^v/, ''),
              releaseUrl: data.html_url || 'https://github.com/blue1st/webmcp-deck/releases',
              publishedAt: data.published_at || '',
              releaseNotes: data.body || ''
            })
          } catch (e: any) {
            reject(new Error(`Failed to parse GitHub release JSON: ${e.message}`))
          }
        } else if (res.statusCode === 404) {
          resolve({
            latestVersion: app.getVersion(),
            releaseUrl: 'https://github.com/blue1st/webmcp-deck/releases',
            publishedAt: new Date().toISOString(),
            releaseNotes: 'No releases published yet.'
          })
        } else {
          reject(new Error(`GitHub API returned HTTP ${res.statusCode}`))
        }
      })
    })

    req.on('error', (err) => {
      reject(err)
    })
    req.setTimeout(8000, () => {
      req.destroy()
      reject(new Error('GitHub API request timed out'))
    })
  })
}

async function getUpdateStatus(force = false): Promise<AppUpdateInfo> {
  const currentVersion = app.getVersion()
  const ONE_DAY = 24 * 60 * 60 * 1000
  const now = Date.now()

  if (!force && cachedUpdateInfo && now - cachedUpdateInfo.timestamp < ONE_DAY) {
    return cachedUpdateInfo.data
  }

  try {
    const release = await fetchLatestReleaseFromGitHub()
    const hasUpdate = isNewerVersion(currentVersion, release.latestVersion)
    const result: AppUpdateInfo = {
      currentVersion,
      latestVersion: release.latestVersion,
      hasUpdate,
      releaseUrl: release.releaseUrl,
      publishedAt: release.publishedAt,
      releaseNotes: release.releaseNotes,
      lastCheckedAt: now
    }
    cachedUpdateInfo = { timestamp: now, data: result }
    return result
  } catch (err: any) {
    const fallback: AppUpdateInfo = {
      currentVersion,
      latestVersion: cachedUpdateInfo?.data?.latestVersion || currentVersion,
      hasUpdate: cachedUpdateInfo?.data?.hasUpdate || false,
      releaseUrl: 'https://github.com/blue1st/webmcp-deck/releases',
      lastCheckedAt: cachedUpdateInfo?.data?.lastCheckedAt || now,
      error: err.message || '更新の確認に失敗しました'
    }
    return fallback
  }
}

function resolvePreloadPath(filename: string): string {
  const candidates = [
    path.join(__dirname, `../preload/${filename}.cjs`),
    path.join(__dirname, `../preload/${filename}.js`),
    path.join(__dirname, `../preload/${filename}.mjs`)
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

function getAppIconPath(): string {
  const candidates = [
    path.join(__dirname, '../../resources/icon.png'),
    path.join(__dirname, '../resources/icon.png'),
    path.join(process.cwd(), 'resources/icon.png')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]
}

async function createWindow() {
  const iconPath = getAppIconPath()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'WebMCP Deck',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolvePreloadPath('index'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.platform !== 'darwin') {
    mainWindow.removeMenu()
  }

  // In electron-vite dev mode: ELECTRON_RENDERER_URL is set
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function initMcpServer(port: number) {
  if (mcpServer) {
    try {
      await mcpServer.stop()
    } catch {}
    mcpServer = null
  }

  mcpServer = new McpServer(port, {
    onNavigate: async (url: string) => {
      if (!mainWindow) throw new Error('WebMCP Deck browser window is not available')
      mainWindow.webContents.send('deck:mcp-navigate', url)
    },
    onExecuteTool: async (toolName: string, args: Record<string, any>) => {
      if (!mainWindow) throw new Error('WebMCP Deck browser window is not available')
      return new Promise((resolve, reject) => {
        const callId = `mcp_exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        const timer = setTimeout(() => {
          pendingMcpToolCalls.delete(callId)
          reject(new Error(`Tool execution for '${toolName}' timed out after 30s`))
        }, 30000)

        pendingMcpToolCalls.set(callId, { resolve, reject, timer })
        mainWindow!.webContents.send('deck:mcp-execute-tool', { callId, toolName, args })
      })
    },
    onTakeScreenshot: async () => {
      if (!mainWindow) throw new Error('WebMCP Deck browser window is not available')
      const image = await mainWindow.capturePage()
      return image.toPNG().toString('base64')
    },
    onListSkills: async () => {
      return store.getSkills()
    },
    onRunSkill: async (skillId: string, params: Record<string, any>) => {
      const skills = store.getSkills()
      const skill = skills.find((s) => s.id === skillId)
      if (!skill) throw new Error(`Skill with ID '${skillId}' not found`)

      const results: any[] = []
      for (const step of skill.steps) {
        const stepArgs: Record<string, any> = {}
        for (const [key, val] of Object.entries(step.arguments || {})) {
          if (typeof val === 'string' && val.startsWith('{{') && val.endsWith('}}')) {
            const pName = val.slice(2, -2).trim()
            stepArgs[key] = params[pName] !== undefined ? params[pName] : val
          } else {
            stepArgs[key] = val
          }
        }

        const callId = `mcp_skill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        const stepResult = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingMcpToolCalls.delete(callId)
            reject(new Error(`Skill step '${step.tool}' timed out`))
          }, 30000)
          pendingMcpToolCalls.set(callId, { resolve, reject, timer })
          mainWindow!.webContents.send('deck:mcp-execute-tool', {
            callId,
            toolName: step.tool,
            args: stepArgs
          })
        })
        results.push({ tool: step.tool, result: stepResult })
      }
      return { skill: skill.name, steps: results }
    }
  })

  try {
    await mcpServer.start()
  } catch (err) {
    console.error('[McpServer] Start failed:', err)
  }
}

app.whenReady().then(async () => {
  store = new JsonStore()
  demoServer = new LocalDemoServer()
  await demoServer.start()

  if (process.platform === 'darwin' && app.dock) {
    const iconPath = getAppIconPath()
    if (fs.existsSync(iconPath)) {
      app.dock.setIcon(iconPath)
    }
  } else if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }

  setupContextMenu()
  registerIpcHandlers()
  await createWindow()

  const settings = store.getSettings()
  if (settings.enableMcpServer !== false) {
    await initMcpServer(settings.mcpServerPort || 3939)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function setupContextMenu() {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('context-menu', (_e, params) => {
      const menu = new Menu()

      // 1. Text input / Editable areas (Address bar, Chat input, Web forms)
      if (params.isEditable) {
        menu.append(new MenuItem({ role: 'undo', label: '元に戻す (Undo)' }))
        menu.append(new MenuItem({ role: 'redo', label: 'やり直す (Redo)' }))
        menu.append(new MenuItem({ type: 'separator' }))
        menu.append(new MenuItem({ role: 'cut', label: '切り取り (Cut)' }))
        menu.append(new MenuItem({ role: 'copy', label: 'コピー (Copy)' }))
        menu.append(new MenuItem({ role: 'paste', label: '貼り付け (Paste)' }))
        menu.append(new MenuItem({ role: 'pasteAndMatchStyle', label: 'プレーンテキストとして貼り付け' }))
        menu.append(new MenuItem({ role: 'selectAll', label: 'すべて選択 (Select All)' }))
      } else if (params.selectionText && params.selectionText.trim().length > 0) {
        // 2. Selected text
        menu.append(new MenuItem({ role: 'copy', label: 'コピー (Copy)' }))
        menu.append(
          new MenuItem({
            label: `Google で「${params.selectionText.trim().substring(0, 15)}...」を検索`,
            click: () => {
              if (mainWindow) {
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(params.selectionText.trim())}`
                mainWindow.webContents.send('deck:navigate-url', searchUrl)
              }
            }
          })
        )
        menu.append(new MenuItem({ type: 'separator' }))
        menu.append(new MenuItem({ role: 'selectAll', label: 'すべて選択 (Select All)' }))
      } else if (params.linkURL) {
        // 3. Clicked link
        menu.append(
          new MenuItem({
            label: 'リンクのアドレスをコピー',
            click: () => clipboard.writeText(params.linkURL)
          })
        )
      } else {
        // 4. General page actions
        menu.append(new MenuItem({ role: 'reload', label: '再読み込み (Reload)' }))
      }

      // Developer Tools / Inspect Element for WebMCP debugging
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(
        new MenuItem({
          label: '検証 (Inspect Element)',
          click: () => contents.inspectElement(params.x, params.y)
        })
      )

      const win = BrowserWindow.fromWebContents(contents) || mainWindow
      if (win) {
        menu.popup({ window: win })
      }
    })
  })
}

app.on('window-all-closed', () => {
  demoServer.stop()
  if (mcpServer) {
    mcpServer.stop()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function registerIpcHandlers() {
  // Settings
  ipcMain.handle('deck:get-settings', () => store.getSettings())
  ipcMain.handle('deck:save-settings', async (_e, s) => {
    const prev = store.getSettings()
    const saved = store.saveSettings(s)
    if (
      saved.enableMcpServer !== prev.enableMcpServer ||
      saved.mcpServerPort !== prev.mcpServerPort
    ) {
      if (saved.enableMcpServer !== false) {
        await initMcpServer(saved.mcpServerPort || 3939)
      } else if (mcpServer) {
        await mcpServer.stop()
        mcpServer = null
      }
    }
    return saved
  })

  // MCP Server Status & Synchronization
  ipcMain.handle('deck:get-mcp-status', () => {
    const bridgePath = path.join(process.cwd(), 'bin/deck-mcp-bridge.mjs')
    return {
      running: mcpServer ? mcpServer.isRunning() : false,
      port: mcpServer ? mcpServer.getPort() : 3939,
      clientsCount: mcpServer ? mcpServer.getClientsCount() : 0,
      bridgePath
    }
  })

  ipcMain.on('deck:state-updated', (_e, state) => {
    if (mcpServer) {
      mcpServer.updateBrowserState(state)
    }
  })

  ipcMain.on('deck:mcp-execute-tool-result', (_e, { callId, result, error }) => {
    if (pendingMcpToolCalls.has(callId)) {
      const item = pendingMcpToolCalls.get(callId)!
      clearTimeout(item.timer)
      pendingMcpToolCalls.delete(callId)
      if (error) {
        item.reject(new Error(error))
      } else {
        item.resolve(result)
      }
    }
  })

  // Skills
  ipcMain.handle('deck:get-skills', () => store.getSkills())
  ipcMain.handle('deck:save-skill', (_e, skill) => store.saveSkill(skill))
  ipcMain.handle('deck:delete-skill', (_e, id) => store.deleteSkill(id))

  // Demo Server
  ipcMain.handle('deck:get-demo-urls', () => demoServer.getUrls())

  // Webview Preload Path
  ipcMain.handle('deck:get-webview-preload-path', () => {
    return resolvePreloadPath('webview-preload')
  })

  // Chrome Bookmarks
  ipcMain.handle('deck:get-chrome-bookmarks', () => {
    return loadChromeBookmarks()
  })

  // App Version & Update Checker
  ipcMain.handle('deck:get-app-version', () => app.getVersion())
  ipcMain.handle('deck:check-for-updates', (_e, force?: boolean) => getUpdateStatus(force))
  ipcMain.handle('deck:open-external', (_e, url: string) => shell.openExternal(url))

function getChromeBookmarksPaths(): string[] {
  const home = app.getPath('home')
  const paths: string[] = []

  if (process.platform === 'darwin') {
    paths.push(
      path.join(home, 'Library/Application Support/Google/Chrome/Default/Bookmarks'),
      path.join(home, 'Library/Application Support/Google/Chrome/Profile 1/Bookmarks')
    )
  } else if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    paths.push(
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Profile 1', 'Bookmarks')
    )
  } else {
    paths.push(
      path.join(home, '.config', 'google-chrome', 'Default', 'Bookmarks'),
      path.join(home, '.config', 'google-chrome', 'Profile 1', 'Bookmarks')
    )
  }

  return paths
}

function loadChromeBookmarks(): Array<{ id: string; title: string; url: string; folder?: string }> {
  const candidatePaths = getChromeBookmarksPaths()
  const bookmarkFile = candidatePaths.find((p) => fs.existsSync(p))
  if (!bookmarkFile) return []

  try {
    const raw = fs.readFileSync(bookmarkFile, 'utf-8')
    const json = JSON.parse(raw)
    const results: Array<{ id: string; title: string; url: string; folder?: string }> = []

    function traverse(node: any, folderName?: string) {
      if (!node) return
      if (node.type === 'url' && node.url && !node.url.startsWith('javascript:')) {
        results.push({
          id: node.id || `bm_${results.length}_${Math.random().toString(36).substring(2, 6)}`,
          title: node.name || node.url,
          url: node.url,
          folder: folderName
        })
      } else if (node.type === 'folder' && Array.isArray(node.children)) {
        const nextFolder = folderName ? `${folderName} / ${node.name}` : node.name
        for (const child of node.children) {
          traverse(child, nextFolder)
        }
      }
    }

    const roots = json.roots || {}
    if (roots.bookmark_bar) traverse(roots.bookmark_bar, 'ブックマークバー')
    if (roots.other) traverse(roots.other, 'その他のブックマーク')
    if (roots.synced) traverse(roots.synced, 'モバイルのブックマーク')

    return results
  } catch (err) {
    console.error('Failed to load Chrome bookmarks:', err)
    return []
  }
}

function getChatCompletionEndpoints(baseUrl: string): string[] {
  const clean = baseUrl.trim().replace(/\/+$/, '')
  if (clean.endsWith('/chat/completions')) {
    return [clean]
  }
  if (clean.endsWith('/v1')) {
    return [`${clean}/chat/completions`]
  }
  return [
    `${clean}/v1/chat/completions`,
    `${clean}/chat/completions`
  ]
}

function getModelsEndpoints(baseUrl: string): string[] {
  const clean = baseUrl.trim().replace(/\/+$/, '')
  if (clean.endsWith('/models')) {
    return [clean]
  }
  if (clean.endsWith('/v1')) {
    return [`${clean}/models`]
  }
  return [
    `${clean}/v1/models`,
    `${clean}/models`
  ]
}

interface HttpRequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: any
  timeoutMs?: number
}

interface HttpResponse {
  status: number
  statusText: string
  ok: boolean
  json: () => Promise<any>
  text: () => Promise<string>
}

function makeCurlRequest(urlString: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    let postData: string | null = null
    if (options.body !== undefined && options.body !== null) {
      postData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
    }

    const maxTimeSec = Math.max(10, Math.round((options.timeoutMs || 120000) / 1000))
    const args: string[] = [
      '-s',
      '-S',
      '--max-time', String(maxTimeSec),
      '-w', '\n__STATUS__%{http_code}',
      '-X', options.method || (postData ? 'POST' : 'GET'),
      urlString
    ]

    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        args.push('-H', `${k}: ${v}`)
      }
    }

    if (postData) {
      args.push('-H', 'Content-Type: application/json')
      args.push('--data-binary', postData)
    }

    const child = spawn('curl', args)
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on('data', (c) => stdoutChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    child.stderr.on('data', (c) => stderrChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))

    child.on('error', (err) => reject(err))

    child.on('close', (code) => {
      const fullOut = Buffer.concat(stdoutChunks).toString('utf-8')
      const marker = '\n__STATUS__'
      const splitIdx = fullOut.lastIndexOf(marker)

      if (splitIdx === -1) {
        const errText = Buffer.concat(stderrChunks).toString('utf-8')
        return reject(new Error(`curl error (exit code ${code}): ${errText || fullOut}`))
      }

      const rawBody = fullOut.substring(0, splitIdx)
      const statusCodeStr = fullOut.substring(splitIdx + marker.length).trim()
      const statusCode = parseInt(statusCodeStr, 10) || (code === 0 ? 200 : 500)

      resolve({
        status: statusCode,
        statusText: statusCode >= 200 && statusCode < 300 ? 'OK' : 'Error',
        ok: statusCode >= 200 && statusCode < 300,
        text: async () => rawBody,
        json: async () => JSON.parse(rawBody)
      })
    })
  })
}

async function makeHttpRequest(urlString: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
  const parsedUrl = new URL(urlString)
  const isPrivateIp = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(parsedUrl.hostname)

  // On macOS, unsigned Electron processes get blocked with EHOSTUNREACH when connecting to private IPs.
  // Using system curl bypasses this OS restriction reliably.
  if (process.platform === 'darwin' && isPrivateIp) {
    try {
      return await makeCurlRequest(urlString, options)
    } catch (curlErr) {
      console.warn(`[makeCurlRequest direct attempt failed, trying node http]:`, curlErr)
    }
  }

  const isHttps = parsedUrl.protocol === 'https:'
  const client = isHttps ? https : http

  try {
    return await new Promise<HttpResponse>((resolve, reject) => {
      let postData: string | null = null
      if (options.body !== undefined && options.body !== null) {
        postData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
      }

      const reqOptions: http.RequestOptions = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port ? Number(parsedUrl.port) : (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: {
          ...(options.headers || {})
        },
        timeout: options.timeoutMs || 120000
      }

      if (postData) {
        reqOptions.headers = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...reqOptions.headers
        }
      }

      const req = client.request(reqOptions, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf-8')
          resolve({
            status: res.statusCode || 200,
            statusText: res.statusMessage || '',
            ok: (res.statusCode || 200) >= 200 && (res.statusCode || 200) < 300,
            text: async () => rawBody,
            json: async () => JSON.parse(rawBody)
          })
        })
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error(`Request to ${urlString} timed out after ${options.timeoutMs || 120000}ms`))
      })

      req.on('error', (err) => {
        reject(err)
      })

      if (postData) {
        req.write(postData)
      }
      req.end()
    })
  } catch (httpErr: any) {
    // Fallback to curl on any network error (e.g. EHOSTUNREACH)
    console.warn(`[Node http failed with ${httpErr?.code || httpErr?.message}, falling back to system curl]`)
    return await makeCurlRequest(urlString, options)
  }
}

  // Fetch available models from LLM endpoint (OpenAI / llama.cpp / Ollama)
  ipcMain.handle('deck:get-models', async (_e, { baseUrl, apiKey }) => {
    const endpoints = getModelsEndpoints(baseUrl)
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    let lastError = 'No endpoint reached'
    for (const url of endpoints) {
      try {
        const res = await makeHttpRequest(url, { method: 'GET', headers, timeoutMs: 8000 })

        if (res.ok) {
          const json = await res.json()
          const modelList: string[] = []

          if (Array.isArray(json.data)) {
            // OpenAI standard: { data: [{ id: "model-name" }] }
            for (const item of json.data) {
              if (item.id) modelList.push(item.id)
            }
          } else if (Array.isArray(json.models)) {
            // llama.cpp / Ollama standard: { models: [{ name: "model-name", model: "..." }] }
            for (const item of json.models) {
              const name = item.name || item.model
              if (name && !modelList.includes(name)) modelList.push(name)
            }
          }

          if (modelList.length > 0) {
            return modelList
          }
        }
      } catch (err: any) {
        lastError = err?.message || String(err)
      }
    }

    throw new Error(`モデル一覧を取得できませんでした (${lastError})`)
  })

  // LLM OpenAI-compatible Chat Completion API
  ipcMain.handle('deck:chat-completion', async (_e, { baseUrl, apiKey, model, temperature, messages, tools }) => {
    const endpoints = getChatCompletionEndpoints(baseUrl)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const payload: any = {
      model,
      messages,
      temperature: temperature !== undefined ? temperature : 0.2
    }

    if (tools && tools.length > 0) {
      payload.tools = tools
      payload.tool_choice = 'auto'
    }

    let lastError = ''
    for (const url of endpoints) {
      try {
        const response = await makeHttpRequest(url, {
          method: 'POST',
          headers,
          body: payload,
          timeoutMs: 120000
        })

        if (!response.ok) {
          const errText = await response.text()
          lastError = `HTTP ${response.status} from ${url}: ${errText}`
          continue
        }

        const json = await response.json()
        const choice = json.choices?.[0]
        if (!choice || !choice.message) {
          lastError = `LLM returned no choices at ${url}`
          continue
        }

        return {
          message: choice.message
        }
      } catch (err: any) {
        lastError = `Failed connecting to ${url}: ${err?.message || err}`
      }
    }

    console.error('[deck:chat-completion] all endpoints failed:', lastError)
    throw new Error(lastError || 'Failed to communicate with LLM endpoint')
  })

  // Generate Skill Definition from Execution Logs
  ipcMain.handle('deck:generate-skill-definition', async (_e, { name, origin, logs, baseUrl, apiKey, model }) => {
    // If LLM is available, attempt smart extraction. Otherwise, fall back to heuristic extraction.
    try {
      if (baseUrl && model) {
        const prompt = `You are a robotic macro optimizer. Convert the following sequence of executed tools into a reusable Skill definition.
Identify dynamic inputs (like dates, queries, prices, user names) and turn them into parameters with template format {{paramName}}.

Executed tool logs:
${JSON.stringify(logs, null, 2)}

Return ONLY valid JSON matching this schema:
{
  "name": "${name || 'Generated Skill'}",
  "description": "Short explanation of what this skill does",
  "parameters": [
    { "name": "paramName", "type": "string|number|boolean", "description": "What this is", "defaultValue": "original value" }
  ],
  "steps": [
    { "tool": "tool_name", "arguments": { "arg": "{{paramName}}" }, "description": "step summary" }
  ]
}`

        const endpoints = getChatCompletionEndpoints(baseUrl)
        let parsed: any = null
        for (const ep of endpoints) {
          try {
            const res = await makeHttpRequest(ep, {
              method: 'POST',
              headers: {
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
              },
              body: {
                model,
                temperature: 0.1,
                messages: [
                  { role: 'system', content: 'You output pure JSON with no markdown wrapping.' },
                  { role: 'user', content: prompt }
                ]
              },
              timeoutMs: 60000
            })
            if (res.ok) {
              const data = await res.json()
              let text = data.choices?.[0]?.message?.content?.trim() || ''
              if (text.startsWith('```json')) text = text.slice(7)
              if (text.startsWith('```')) text = text.slice(3)
              if (text.endsWith('```')) text = text.slice(0, -3)
              parsed = JSON.parse(text.trim())
              break
            }
          } catch {}
        }

        if (parsed) {
          return {
            id: `skill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: parsed.name || name || 'New Skill',
            description: parsed.description || '',
            targetOrigin: origin,
            parameters: parsed.parameters || [],
            steps: parsed.steps || [],
            createdAt: Date.now()
          }
        }
      }
    } catch (e) {
      console.warn('LLM parameter abstraction failed, using rule-based fallback:', e)
    }

    // Heuristic Fallback
    const parameters: SkillParameter[] = []
    const steps: SkillStep[] = []
    const paramMap = new Map<string, string>()

    logs.forEach((log, index) => {
      const stepArgs: Record<string, any> = {}
      for (const [key, val] of Object.entries(log.arguments || {})) {
        if (typeof val === 'string' || typeof val === 'number') {
          const paramName = `${log.tool}_${key}`
          if (!paramMap.has(paramName)) {
            paramMap.set(paramName, `{{${paramName}}}`)
            parameters.push({
              name: paramName,
              type: typeof val === 'number' ? 'number' : 'string',
              description: `${log.tool} の ${key}`,
              defaultValue: val
            })
          }
          stepArgs[key] = `{{${paramName}}}`
        } else {
          stepArgs[key] = val
        }
      }
      steps.push({
        tool: log.tool,
        arguments: stepArgs,
        description: `Step ${index + 1}: ${log.tool} を実行`
      })
    })

    return {
      id: `skill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name || '新規スキル',
      description: '実行履歴から自動生成されたスキル',
      targetOrigin: origin,
      parameters,
      steps,
      createdAt: Date.now()
    }
  })
}
