import { contextBridge, ipcRenderer } from 'electron'
import { LLMConfig, SkillDefinition } from '../renderer/src/types'

export interface ElectronAPI {
  getSettings: () => Promise<LLMConfig>
  saveSettings: (settings: Partial<LLMConfig>) => Promise<LLMConfig>
  getSkills: () => Promise<SkillDefinition[]>
  saveSkill: (skill: SkillDefinition) => Promise<SkillDefinition[]>
  deleteSkill: (id: string) => Promise<SkillDefinition[]>
  getDemoUrls: () => Promise<{ hotel: string; shop: string }>
  getWebviewPreloadPath: () => Promise<string>
  chatCompletion: (params: {
    baseUrl: string
    apiKey: string
    model: string
    temperature: number
    messages: any[]
    tools?: any[]
  }) => Promise<{
    message: {
      role: string
      content: string | null
      reasoning_content?: string
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: {
          name: string
          arguments: string
        }
      }>
    }
  }>
  getModels: (params: { baseUrl: string; apiKey?: string }) => Promise<string[]>
  generateSkillDefinition: (params: {
    name: string
    origin: string
    logs: Array<{ tool: string; arguments: any }>
    baseUrl: string
    apiKey: string
    model: string
  }) => Promise<SkillDefinition>
  getChromeBookmarks: () => Promise<import('../renderer/src/types').ChromeBookmark[]>
  getMcpServerStatus: () => Promise<import('../renderer/src/types').McpServerStatus>
  notifyStateUpdated: (state: {
    currentUrl: string
    pageTitle: string
    tools: import('../renderer/src/types').WebMCPTool[]
  }) => void
  onMcpExecuteTool: (
    callback: (data: { callId: string; toolName: string; args: any }) => void
  ) => () => void
  sendMcpExecuteToolResult: (data: { callId: string; result?: any; error?: string }) => void
  onMcpNavigate: (callback: (url: string) => void) => () => void
  getAppVersion: () => Promise<string>
  checkForUpdates: (force?: boolean) => Promise<import('../renderer/src/types').AppUpdateInfo>
  openExternal: (url: string) => Promise<void>
}

const api: ElectronAPI = {
  getSettings: () => ipcRenderer.invoke('deck:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('deck:save-settings', settings),
  getSkills: () => ipcRenderer.invoke('deck:get-skills'),
  saveSkill: (skill) => ipcRenderer.invoke('deck:save-skill', skill),
  deleteSkill: (id) => ipcRenderer.invoke('deck:delete-skill', id),
  getDemoUrls: () => ipcRenderer.invoke('deck:get-demo-urls'),
  getWebviewPreloadPath: () => ipcRenderer.invoke('deck:get-webview-preload-path'),
  chatCompletion: (params) => ipcRenderer.invoke('deck:chat-completion', params),
  getModels: (params) => ipcRenderer.invoke('deck:get-models', params),
  generateSkillDefinition: (params) => ipcRenderer.invoke('deck:generate-skill-definition', params),
  getChromeBookmarks: () => ipcRenderer.invoke('deck:get-chrome-bookmarks'),
  getMcpServerStatus: () => ipcRenderer.invoke('deck:get-mcp-status'),
  notifyStateUpdated: (state) => ipcRenderer.send('deck:state-updated', state),
  onMcpExecuteTool: (callback) => {
    const listener = (_e: any, data: any) => callback(data)
    ipcRenderer.on('deck:mcp-execute-tool', listener)
    return () => ipcRenderer.removeListener('deck:mcp-execute-tool', listener)
  },
  sendMcpExecuteToolResult: (data) => ipcRenderer.send('deck:mcp-execute-tool-result', data),
  onMcpNavigate: (callback) => {
    const listener = (_e: any, url: string) => callback(url)
    ipcRenderer.on('deck:mcp-navigate', listener)
    return () => ipcRenderer.removeListener('deck:mcp-navigate', listener)
  },
  getAppVersion: () => ipcRenderer.invoke('deck:get-app-version'),
  checkForUpdates: (force) => ipcRenderer.invoke('deck:check-for-updates', force),
  openExternal: (url) => ipcRenderer.invoke('deck:open-external', url)
}

contextBridge.exposeInMainWorld('electronAPI', api)
