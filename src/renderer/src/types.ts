// WebMCP Tool Definition
export interface WebMCPTool {
  name: string
  description?: string
  inputSchema?: {
    type: string
    properties?: Record<string, {
      type?: string
      description?: string
      enum?: string[]
      default?: any
      items?: any
    }>
    required?: string[]
    [key: string]: any
  }
}

// Skill Definition (as specified in doc section 5)
export interface SkillParameter {
  name: string
  type: 'string' | 'number' | 'boolean'
  description: string
  defaultValue?: any
}

export interface SkillStep {
  tool: string
  arguments: Record<string, any>
  description?: string
}

export interface SkillDefinition {
  id: string
  name: string
  description?: string
  targetOrigin: string
  parameters: SkillParameter[]
  steps: SkillStep[]
  createdAt: number
}

// LLM Configuration & App Settings
export interface LLMConfig {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  autoApproveReadOnly: boolean
  homeUrl?: string
  enableMcpServer?: boolean
  mcpServerPort?: number
}

export interface McpServerStatus {
  running: boolean
  port: number
  clientsCount: number
  bridgePath: string
}

export interface AppUpdateInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseUrl?: string
  publishedAt?: string
  releaseNotes?: string
  lastCheckedAt?: number
  error?: string
}

// Chat Messages
export interface ToolCallItem {
  id: string
  name: string
  arguments: Record<string, any>
  status: 'pending_approval' | 'running' | 'completed' | 'failed' | 'rejected'
  result?: any
  error?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content?: string
  reasoning?: string
  toolCalls?: ToolCallItem[]
  timestamp: number
}

// Execution Log for Skill Creation
export interface ToolExecutionLog {
  id: string
  tool: string
  arguments: Record<string, any>
  result: any
  timestamp: number
}

// Chrome Bookmark Interface
export interface ChromeBookmark {
  id: string
  title: string
  url: string
  folder?: string
}
