import * as http from 'http'
import * as crypto from 'crypto'
export interface WebMCPTool {
  name: string
  description?: string
  inputSchema?: any
}

export interface SkillDefinition {
  id: string
  name: string
  description?: string
  targetOrigin: string
  parameters: any[]
  steps: any[]
  createdAt: number
}

export interface McpServerCallbacks {
  onNavigate: (url: string) => Promise<void>
  onExecuteTool: (toolName: string, args: Record<string, any>) => Promise<any>
  onTakeScreenshot: () => Promise<string> // Returns base64 image without data: prefix
  onListSkills: () => Promise<SkillDefinition[]>
  onRunSkill: (skillId: string, params: Record<string, any>) => Promise<any>
}

export interface McpBrowserState {
  currentUrl: string
  pageTitle: string
  tools: WebMCPTool[]
}

interface SseClient {
  id: string
  res: http.ServerResponse
}

export class McpServer {
  private port: number
  private server: http.Server | null = null
  private sseClients: Map<string, SseClient> = new Map()
  private state: McpBrowserState = {
    currentUrl: 'https://www.google.com',
    pageTitle: '',
    tools: []
  }
  private callbacks: McpServerCallbacks

  constructor(port: number, callbacks: McpServerCallbacks) {
    this.port = port
    this.callbacks = callbacks
  }

  public setPort(port: number) {
    this.port = port
  }

  public getPort(): number {
    return this.port
  }

  public isRunning(): boolean {
    return this.server !== null && this.server.listening
  }

  public getClientsCount(): number {
    return this.sseClients.size
  }

  public updateBrowserState(newState: Partial<McpBrowserState>) {
    const prevToolsJson = JSON.stringify(this.state.tools.map((t) => t.name).sort())
    this.state = {
      ...this.state,
      ...newState
    }
    const newToolsJson = JSON.stringify(this.state.tools.map((t) => t.name).sort())

    // If tools changed, notify all connected MCP clients via list_changed notification
    if (prevToolsJson !== newToolsJson) {
      this.broadcastNotification('notifications/tools/list_changed')
    }
  }

  public async start(): Promise<void> {
    if (this.server) {
      await this.stop()
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res)
      })

      server.on('error', (err: any) => {
        console.error(`[McpServer] Error on port ${this.port}:`, err)
        reject(err)
      })

      server.listen(this.port, '127.0.0.1', () => {
        console.log(`[McpServer] WebMCP Deck MCP Server listening on http://127.0.0.1:${this.port}`)
        this.server = server
        resolve()
      })
    })
  }

  public async stop(): Promise<void> {
    if (!this.server) return

    for (const [id, client] of this.sseClients.entries()) {
      try {
        client.res.end()
      } catch {}
    }
    this.sseClients.clear()

    return new Promise((resolve) => {
      this.server?.close(() => {
        this.server = null
        resolve()
      })
    })
  }

  private setCorsHeaders(res: http.ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    this.setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const urlObj = new URL(req.url || '/', `http://127.0.0.1:${this.port}`)
    const pathname = urlObj.pathname

    // 1. Health & status endpoint
    if (req.method === 'GET' && (pathname === '/status' || pathname === '/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify(
          {
            name: 'webmcp-deck-mcp-server',
            version: '1.0.0',
            status: 'running',
            port: this.port,
            connectedClients: this.sseClients.size,
            currentUrl: this.state.currentUrl,
            pageTitle: this.state.pageTitle,
            toolsCount: this.state.tools.length
          },
          null,
          2
        )
      )
      return
    }

    // 2. SSE endpoint for MCP Clients (Claude Desktop, Cursor, etc.)
    if (req.method === 'GET' && pathname === '/sse') {
      const sessionId = crypto.randomUUID()
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      })

      const client: SseClient = { id: sessionId, res }
      this.sseClients.set(sessionId, client)

      req.on('close', () => {
        this.sseClients.delete(sessionId)
      })

      // Send initial endpoint event as required by MCP SSE Transport spec
      res.write(`event: endpoint\r\ndata: /message?sessionId=${sessionId}\r\n\r\n`)
      return
    }

    // 3. POST /message?sessionId=xxx (SSE Transport message endpoint)
    if (req.method === 'POST' && pathname === '/message') {
      const sessionId = urlObj.searchParams.get('sessionId') || ''
      const client = this.sseClients.get(sessionId)

      this.readRequestBody(req, async (bodyStr) => {
        try {
          const jsonRpcReq = JSON.parse(bodyStr)
          const response = await this.handleJsonRpc(jsonRpcReq)

          if (response) {
            // Standard MCP SSE sends response over the SSE connection
            if (client) {
              client.res.write(`event: message\r\ndata: ${JSON.stringify(response)}\r\n\r\n`)
            }
            // Also return 200 or 202
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(response))
          } else {
            // Notification: 202 Accepted
            res.writeHead(202)
            res.end()
          }
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message || 'Invalid JSON' }))
        }
      })
      return
    }

    // 4. POST /rpc (Direct JSON-RPC endpoint for CLI bridge and simple HTTP clients)
    if (req.method === 'POST' && pathname === '/rpc') {
      this.readRequestBody(req, async (bodyStr) => {
        try {
          const jsonRpcReq = JSON.parse(bodyStr)
          const response = await this.handleJsonRpc(jsonRpcReq)
          if (response) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(response))
          } else {
            res.writeHead(204)
            res.end()
          }
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32700, message: `Parse error: ${err.message}` }
            })
          )
        }
      })
      return
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }

  private readRequestBody(req: http.IncomingMessage, callback: (body: string) => void) {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      callback(data)
    })
  }

  private broadcastNotification(method: string, params?: any) {
    const notification = {
      jsonrpc: '2.0',
      method,
      params
    }
    const message = `event: message\r\ndata: ${JSON.stringify(notification)}\r\n\r\n`
    for (const client of this.sseClients.values()) {
      try {
        client.res.write(message)
      } catch (e) {
        console.warn('[McpServer] Failed to write notification to SSE client:', e)
      }
    }
  }

  public async handleJsonRpc(req: any): Promise<any | null> {
    if (!req || typeof req !== 'object') return null

    const { id, method, params } = req

    // Notifications (no id)
    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        console.log('[McpServer] Client sent notifications/initialized')
      }
      return null
    }

    try {
      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: { listChanged: true },
                resources: {},
                prompts: {}
              },
              serverInfo: {
                name: 'webmcp-deck',
                version: '1.0.0'
              }
            }
          }

        case 'ping':
          return {
            jsonrpc: '2.0',
            id,
            result: {}
          }

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: this.buildMcpToolsList()
            }
          }

        case 'tools/call':
          const toolName = params?.name
          const toolArgs = params?.arguments || {}
          const callResult = await this.executeMcpTool(toolName, toolArgs)
          return {
            jsonrpc: '2.0',
            id,
            result: callResult
          }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method '${method}' not found`
            }
          }
      }
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err.message || 'Internal error',
          data: err.stack
        }
      }
    }
  }

  private buildMcpToolsList(): any[] {
    const baseTools = [
      {
        name: 'deck_navigate',
        description:
          'Navigate the active WebMCP Deck browser to a specified URL or perform a web search. When you open a page with WebMCP tools, they become available.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL or search term to navigate to (e.g. "https://example.com" or "Tokyo Weather")'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'deck_get_page_status',
        description:
          'Get the current URL, page title, and list of WebMCP tools exposed by the currently open web page in WebMCP Deck.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'deck_call_web_tool',
        description:
          'Universal caller: execute any WebMCP tool available on the currently active web page by tool name and arguments.',
        inputSchema: {
          type: 'object',
          properties: {
            tool_name: {
              type: 'string',
              description: 'Name of the WebMCP tool on the page to execute'
            },
            arguments: {
              type: 'object',
              description: 'Key-value dictionary of arguments for the tool'
            }
          },
          required: ['tool_name']
        }
      },
      {
        name: 'deck_take_screenshot',
        description:
          'Take a screenshot of the currently rendered web page in WebMCP Deck and return it as an image for visual inspection.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'deck_list_skills',
        description: 'List all saved automation skills/recipes stored in WebMCP Deck.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'deck_run_skill',
        description: 'Execute a pre-configured automation skill recipe in WebMCP Deck by its ID.',
        inputSchema: {
          type: 'object',
          properties: {
            skill_id: {
              type: 'string',
              description: 'The ID of the saved skill'
            },
            parameters: {
              type: 'object',
              description: 'Parameter values to pass into the skill template'
            }
          },
          required: ['skill_id']
        }
      }
    ]

    // Dynamic WebMCP tools exposed by the currently open webpage
    const dynamicTools = this.state.tools.map((t) => {
      return {
        name: `web_${t.name}`,
        description: `[Live Page WebMCP Tool: ${this.state.currentUrl}] ${t.description || t.name}`,
        inputSchema: t.inputSchema || {
          type: 'object',
          properties: {}
        }
      }
    })

    return [...baseTools, ...dynamicTools]
  }

  private async executeMcpTool(name: string, args: Record<string, any>): Promise<any> {
    switch (name) {
      case 'deck_navigate': {
        const url = args.url
        if (!url) throw new Error("Missing parameter 'url'")
        await this.callbacks.onNavigate(url)
        return {
          content: [
            {
              type: 'text',
              text: `Navigated WebMCP Deck browser to: ${url}`
            }
          ]
        }
      }

      case 'deck_get_page_status': {
        const status = {
          url: this.state.currentUrl,
          title: this.state.pageTitle,
          detectedToolsCount: this.state.tools.length,
          tools: this.state.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
          }))
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2)
            }
          ]
        }
      }

      case 'deck_take_screenshot': {
        const base64Png = await this.callbacks.onTakeScreenshot()
        return {
          content: [
            {
              type: 'image',
              data: base64Png,
              mimeType: 'image/png'
            }
          ]
        }
      }

      case 'deck_list_skills': {
        const skills = await this.callbacks.onListSkills()
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(skills, null, 2)
            }
          ]
        }
      }

      case 'deck_run_skill': {
        const skillId = args.skill_id
        if (!skillId) throw new Error("Missing parameter 'skill_id'")
        const result = await this.callbacks.onRunSkill(skillId, args.parameters || {})
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      }

      case 'deck_call_web_tool': {
        const targetTool = args.tool_name
        const targetArgs = args.arguments || {}
        if (!targetTool) throw new Error("Missing parameter 'tool_name'")
        const result = await this.callbacks.onExecuteTool(targetTool, targetArgs)
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        }
      }

      default: {
        // Check if it's a dynamic WebMCP tool prefixed with "web_"
        if (name.startsWith('web_')) {
          const originalToolName = name.substring(4)
          const result = await this.callbacks.onExecuteTool(originalToolName, args)
          return {
            content: [
              {
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }
            ]
          }
        }

        // Direct tool name check
        const directTool = this.state.tools.find((t) => t.name === name)
        if (directTool) {
          const result = await this.callbacks.onExecuteTool(name, args)
          return {
            content: [
              {
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }
            ]
          }
        }

        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Tool '${name}' is not found. Use 'deck_get_page_status' to see available tools on the current page.`
            }
          ]
        }
      }
    }
  }
}
