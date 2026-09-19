import { McpServer } from './src/main/mcp-server.ts'

async function runMcpTests() {
  console.log('🧪 Starting WebMCP Deck MCP Protocol & Server Test Suite...\n')

  let navigatedUrl = ''
  let executedToolName = ''
  let executedToolArgs = null

  // 1. Initialize McpServer instance
  const server = new McpServer(3949, {
    onNavigate: async (url) => {
      navigatedUrl = url
    },
    onExecuteTool: async (toolName, args) => {
      executedToolName = toolName
      executedToolArgs = args
      return { success: true, executed: toolName, receivedArgs: args }
    },
    onTakeScreenshot: async () => {
      return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    },
    onListSkills: async () => {
      return [
        {
          id: 'skill_test_1',
          name: 'Test Skill',
          targetOrigin: 'https://example.com',
          parameters: [],
          steps: [],
          createdAt: Date.now()
        }
      ]
    },
    onRunSkill: async (skillId, params) => {
      return { skillId, status: 'completed', params }
    }
  })

  // Test 1: JSON-RPC initialize
  const initRes = await server.handleJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0' }
    }
  })
  if (initRes?.result?.serverInfo?.name !== 'webmcp-deck') {
    throw new Error(`Test 1 Failed: initialize handshake failed: ${JSON.stringify(initRes)}`)
  }
  console.log('✅ Test 1 Passed: MCP initialize handshake succeeded (server: webmcp-deck, v1.0.0)')

  // Test 2: ping
  const pingRes = await server.handleJsonRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'ping'
  })
  if (!pingRes?.result) {
    throw new Error(`Test 2 Failed: ping failed: ${JSON.stringify(pingRes)}`)
  }
  console.log('✅ Test 2 Passed: MCP ping succeeded')

  // Test 3: tools/list (Base Tools)
  const listRes = await server.handleJsonRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/list',
    params: {}
  })
  const baseTools = listRes?.result?.tools?.map((t) => t.name) || []
  if (
    !baseTools.includes('deck_navigate') ||
    !baseTools.includes('deck_get_page_status') ||
    !baseTools.includes('deck_call_web_tool') ||
    !baseTools.includes('deck_take_screenshot') ||
    !baseTools.includes('deck_list_skills') ||
    !baseTools.includes('deck_run_skill')
  ) {
    throw new Error(`Test 3 Failed: Base tools missing: ${JSON.stringify(baseTools)}`)
  }
  console.log(`✅ Test 3 Passed: All 6 base deck tools registered (${baseTools.join(', ')})`)

  // Test 4: Dynamic WebMCP tools mounting on page state change
  server.updateBrowserState({
    currentUrl: 'https://shop.example.com/checkout',
    pageTitle: 'Example Store Checkout',
    tools: [
      {
        name: 'add_coupon_code',
        description: 'Apply coupon code to active shopping cart',
        inputSchema: {
          type: 'object',
          properties: { code: { type: 'string' } },
          required: ['code']
        }
      }
    ]
  })
  const dynamicListRes = await server.handleJsonRpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/list',
    params: {}
  })
  const updatedTools = dynamicListRes?.result?.tools || []
  const couponTool = updatedTools.find((t) => t.name === 'web_add_coupon_code')
  if (!couponTool || !couponTool.description.includes('shop.example.com')) {
    throw new Error(`Test 4 Failed: Dynamic tool not mounted: ${JSON.stringify(updatedTools)}`)
  }
  console.log('✅ Test 4 Passed: Live page WebMCP tool dynamically exported as "web_add_coupon_code"')

  // Test 5: tools/call deck_navigate
  const navRes = await server.handleJsonRpc({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'deck_navigate',
      arguments: { url: 'https://github.com/webmcp' }
    }
  })
  if (navigatedUrl !== 'https://github.com/webmcp' || navRes?.result?.isError) {
    throw new Error(`Test 5 Failed: deck_navigate mismatch: ${JSON.stringify(navRes)}`)
  }
  console.log('✅ Test 5 Passed: deck_navigate executed and updated browser navigation')

  // Test 6: tools/call deck_get_page_status
  const statusRes = await server.handleJsonRpc({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'deck_get_page_status'
    }
  })
  const statusText = statusRes?.result?.content?.[0]?.text
  const statusData = JSON.parse(statusText)
  if (statusData.url !== 'https://shop.example.com/checkout' || statusData.detectedToolsCount !== 1) {
    throw new Error(`Test 6 Failed: deck_get_page_status mismatch: ${statusText}`)
  }
  console.log('✅ Test 6 Passed: deck_get_page_status accurately reported live page & tools')

  // Test 7: tools/call dynamic WebMCP tool (web_add_coupon_code)
  const execRes = await server.handleJsonRpc({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'web_add_coupon_code',
      arguments: { code: 'SPRING2026' }
    }
  })
  if (executedToolName !== 'add_coupon_code' || executedToolArgs?.code !== 'SPRING2026') {
    throw new Error(`Test 7 Failed: Dynamic tool call mismatch: ${JSON.stringify(execRes)}`)
  }
  console.log('✅ Test 7 Passed: Invoked dynamic tool "web_add_coupon_code" -> routed to real page tool')

  // Test 8: tools/call deck_take_screenshot
  const ssRes = await server.handleJsonRpc({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'deck_take_screenshot'
    }
  })
  const imgContent = ssRes?.result?.content?.[0]
  if (imgContent?.type !== 'image' || imgContent?.mimeType !== 'image/png' || !imgContent?.data) {
    throw new Error(`Test 8 Failed: Screenshot mismatch: ${JSON.stringify(ssRes)}`)
  }
  console.log('✅ Test 8 Passed: deck_take_screenshot returned MCP image content payload')

  // Test 9: Unknown tool error handling
  const errRes = await server.handleJsonRpc({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'non_existent_tool',
      arguments: {}
    }
  })
  if (!errRes?.result?.isError) {
    throw new Error(`Test 9 Failed: Unknown tool should return isError: true: ${JSON.stringify(errRes)}`)
  }
  console.log('✅ Test 9 Passed: Unknown tool handled gracefully with error feedback')

  console.log('\n🎉 ALL 9 MCP PROTOCOL & BRIDGE TESTS PASSED 100% CLEANLY!\n')
}

runMcpTests().catch((err) => {
  console.error('❌ Test suite failed:', err)
  process.exit(1)
})
