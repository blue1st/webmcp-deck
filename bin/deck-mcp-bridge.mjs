#!/usr/bin/env node

/**
 * WebMCP Deck - Standard I/O (stdio) to HTTP MCP Bridge
 *
 * Used by Claude Desktop, Cursor, Antigravity, and other MCP clients
 * that spawn subprocesses using stdio communication.
 *
 * Config in claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "webmcp-deck": {
 *       "command": "node",
 *       "args": ["/absolute/path/to/webmcp-deck/bin/deck-mcp-bridge.mjs"]
 *     }
 *   }
 * }
 */

import * as readline from 'readline'
import * as http from 'http'

// Determine port from CLI arg '--port=3939' or environment variable
let port = 3939
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--port=')) {
    port = parseInt(arg.split('=')[1], 10) || 3939
  }
}
if (process.env.WEBMCP_DECK_PORT) {
  port = parseInt(process.env.WEBMCP_DECK_PORT, 10) || port
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
})

function sendRpcToDeck(jsonString) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: port,
        path: '/rpc',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(jsonString)
        }
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          resolve({ ok: true, status: res.statusCode, body })
        })
      }
    )

    req.on('error', (err) => {
      resolve({ ok: false, error: err })
    })

    req.write(jsonString)
    req.end()
  })
}

rl.on('line', async (line) => {
  const trimmed = line.trim()
  if (!trimmed) return

  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return
  }

  const result = await sendRpcToDeck(trimmed)

  if (result.ok && result.body) {
    process.stdout.write(result.body.trim() + '\n')
  } else if (!result.ok) {
    // Deck is offline or server unreachable
    if (parsed.id !== undefined && parsed.id !== null) {
      const offlineError = {
        jsonrpc: '2.0',
        id: parsed.id,
        error: {
          code: -32000,
          message: `[WebMCP Deck] Could not connect to WebMCP Deck on http://127.0.0.1:${port}. Please ensure the WebMCP Deck desktop app is running.`
        }
      }
      process.stdout.write(JSON.stringify(offlineError) + '\n')
    }
  }
})
