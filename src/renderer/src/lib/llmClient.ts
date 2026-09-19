import { WebMCPTool } from '../types'

export function convertWebMCPToOpenAITools(tools: WebMCPTool[]): any[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.inputSchema || {
        type: 'object',
        properties: {}
      }
    }
  }))
}

export function isReadOnlyTool(toolName: string): boolean {
  const readOnlyKeywords = ['get', 'search', 'find', 'list', 'check', 'view', 'read', 'query']
  const lower = toolName.toLowerCase()
  return readOnlyKeywords.some((kw) => lower.startsWith(kw) || lower.includes(kw))
}
