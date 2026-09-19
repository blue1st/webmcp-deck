import React, { useState, useEffect, useRef } from 'react'
import { Header } from './components/Header'
import { BrowserPane, BrowserPaneHandle } from './components/BrowserPane'
import { InspectorTab } from './components/InspectorTab'
import { ChatTab } from './components/ChatTab'
import { SkillsTab } from './components/SkillsTab'
import { SettingsModal } from './components/SettingsModal'
import { LLMConfig, SkillDefinition, WebMCPTool } from './types'
import { MessageSquare, Layers, Workflow } from 'lucide-react'

export const App: React.FC = () => {
  const browserRef = useRef<BrowserPaneHandle>(null)

  // Navigation State
  const [currentUrl, setCurrentUrl] = useState<string>('https://www.google.com')
  const [pageTitle, setPageTitle] = useState<string>('')
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [preloadPath, setPreloadPath] = useState<string>('')
  const [isReady, setIsReady] = useState(false)

  // WebMCP State
  const [detectedTools, setDetectedTools] = useState<WebMCPTool[]>([])

  // App & Storage State
  const [activeTab, setActiveTab] = useState<'chat' | 'inspector' | 'skills'>('chat')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [skills, setSkills] = useState<SkillDefinition[]>([])
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    model: 'llama3:latest',
    temperature: 0.2,
    autoApproveReadOnly: true
  })

  // Pane Width Splitting (default: 60% browser, 40% cockpit)
  const [splitRatio, setSplitRatio] = useState(60)
  const isDragging = useRef(false)

  // Initialize data from Electron Main Process
  useEffect(() => {
    const init = async () => {
      if ((window as any).electronAPI) {
        try {
          const [settings, savedSkills, pPath] = await Promise.all([
            (window as any).electronAPI.getSettings(),
            (window as any).electronAPI.getSkills(),
            (window as any).electronAPI.getWebviewPreloadPath()
          ])

          if (settings) {
            setLlmConfig(settings)
            if (settings.homeUrl) {
              setCurrentUrl(settings.homeUrl)
            }
          }
          if (savedSkills) setSkills(savedSkills)
          if (pPath) setPreloadPath(pPath)
        } catch (err) {
          console.error('[App init error]:', err)
        } finally {
          setIsReady(true)
        }
      }
    }
    init()
  }, [])

  // Drag Resizer Handlers
  const handleMouseDown = () => {
    isDragging.current = true
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const totalWidth = window.innerWidth
      const newRatio = (e.clientX / totalWidth) * 100
      if (newRatio >= 30 && newRatio <= 80) {
        setSplitRatio(newRatio)
      }
    }
    const handleMouseUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Navigation callbacks
  const handleNavigate = (url: string) => {
    setCurrentUrl(url)
    browserRef.current?.navigate(url)
    // Clear tools temporarily until webview registers new tools
    setDetectedTools([])
  }

  const handleSaveSettings = async (newConfig: LLMConfig) => {
    setLlmConfig(newConfig)
    if ((window as any).electronAPI) {
      await (window as any).electronAPI.saveSettings(newConfig)
    }
  }

  const handleDeleteSkill = async (id: string) => {
    if ((window as any).electronAPI) {
      const updated = await (window as any).electronAPI.deleteSkill(id)
      setSkills(updated)
    }
  }

  const handleSaveSkill = (skill: SkillDefinition) => {
    setSkills((prev) => [skill, ...prev.filter((s) => s.id !== skill.id)])
  }

  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimeout = useRef<any>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    if (toastTimeout.current) clearTimeout(toastTimeout.current)
    toastTimeout.current = setTimeout(() => setToastMessage(null), 4000)
  }

  // Synchronize state with Electron Main process (for MCP server tools/list)
  useEffect(() => {
    if ((window as any).electronAPI?.notifyStateUpdated) {
      ;(window as any).electronAPI.notifyStateUpdated({
        currentUrl,
        pageTitle,
        tools: detectedTools
      })
    }
  }, [currentUrl, pageTitle, detectedTools])

  // Listen to remote MCP commands (from Claude Desktop, Cursor, etc.)
  useEffect(() => {
    if (!(window as any).electronAPI) return

    const unsubNavigate = (window as any).electronAPI.onMcpNavigate((url: string) => {
      showToast(`外部MCP: 「${url.length > 30 ? url.substring(0, 30) + '...' : url}」へ移動中`)
      handleNavigate(url)
    })

    const unsubExec = (window as any).electronAPI.onMcpExecuteTool(
      async ({ callId, toolName, args }: any) => {
        try {
          showToast(`外部MCP: ツール「${toolName}」を実行中...`)
          const result = await handleExecuteTool(toolName, args)
          ;(window as any).electronAPI.sendMcpExecuteToolResult({ callId, result })
          showToast(`外部MCP: ツール「${toolName}」が完了しました`)
        } catch (err: any) {
          ;(window as any).electronAPI.sendMcpExecuteToolResult({
            callId,
            error: err.message || 'Execution error'
          })
          showToast(`外部MCPエラー: 「${toolName}」${err.message}`)
        }
      }
    )

    return () => {
      if (unsubNavigate) unsubNavigate()
      if (unsubExec) unsubExec()
    }
  }, [detectedTools])

  // Tool execution dispatcher via webview
  const handleExecuteTool = async (toolName: string, args: Record<string, any>) => {
    if (!browserRef.current) throw new Error('ブラウザビューが利用できません')
    return await browserRef.current.executeTool(toolName, args)
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans">
      {/* Header Bar */}
      <Header
        currentUrl={currentUrl}
        onNavigate={handleNavigate}
        onReload={() => browserRef.current?.reload()}
        onGoBack={() => browserRef.current?.goBack()}
        onGoForward={() => browserRef.current?.goForward()}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        isLoading={isLoading}
        tools={detectedTools}
        llmConfig={llmConfig}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSwitchTab={(t) => setActiveTab(t)}
      />

      {/* Main 2-Pane Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Pane: Browser Webview */}
        <div
          style={{ width: `${splitRatio}%` }}
          className="h-full flex flex-col relative bg-slate-900 border-r border-slate-800"
        >
          {preloadPath ? (
            <BrowserPane
              ref={browserRef}
              initialUrl={currentUrl}
              preloadPath={preloadPath}
              onUrlChanged={(url) => setCurrentUrl(url)}
              onTitleChanged={(t) => setPageTitle(t)}
              onNavStateChanged={(b, f) => {
                setCanGoBack(b)
                setCanGoForward(f)
              }}
              onLoadingChanged={(loading) => setIsLoading(loading)}
              onToolsUpdated={(tools) => setDetectedTools(tools)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs gap-3">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span>WebMCP ブラウザ環境を準備中...</span>
            </div>
          )}
        </div>

        {/* Resizer Divider */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1.5 hover:w-2 bg-slate-800/80 hover:bg-indigo-500 cursor-col-resize transition-all shrink-0 select-none z-10 flex items-center justify-center group"
        >
          <div className="h-8 w-0.5 bg-slate-600 group-hover:bg-white rounded" />
        </div>

        {/* Right Pane: Cockpit UI */}
        <div
          style={{ width: `${100 - splitRatio}%` }}
          className="h-full flex flex-col bg-slate-950 overflow-hidden"
        >
          {/* Cockpit Tabs Navigation */}
          <div className="h-11 bg-slate-900/90 border-b border-slate-800 px-3 flex items-center gap-1 select-none shrink-0">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'chat'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <MessageSquare size={14} />
              <span>Chat & Agent</span>
            </button>

            <button
              onClick={() => setActiveTab('inspector')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'inspector'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Layers size={14} />
              <span>Inspector</span>
              {detectedTools.length > 0 && (
                <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.2 rounded-full font-bold">
                  {detectedTools.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('skills')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'skills'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Workflow size={14} />
              <span>Skills</span>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded-full font-bold">
                {skills.length}
              </span>
            </button>
          </div>

          {/* Active Tab View - permanently mounted so conversation and input drafts are NEVER destroyed */}
          <div className="flex-1 overflow-hidden relative">
            <div className={`h-full flex flex-col ${activeTab === 'chat' ? '' : 'hidden'}`}>
              <ChatTab
                tools={detectedTools}
                llmConfig={llmConfig}
                currentUrl={currentUrl}
                onExecuteTool={handleExecuteTool}
                onSaveSkill={handleSaveSkill}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            </div>
            <div className={`h-full flex flex-col ${activeTab === 'inspector' ? '' : 'hidden'}`}>
              <InspectorTab tools={detectedTools} onExecuteTool={handleExecuteTool} />
            </div>
            <div className={`h-full flex flex-col ${activeTab === 'skills' ? '' : 'hidden'}`}>
              <SkillsTab
                skills={skills}
                currentUrl={currentUrl}
                onDeleteSkill={handleDeleteSkill}
                onExecuteTool={handleExecuteTool}
                onNavigate={handleNavigate}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Remote MCP Floating Toast Notification */}
      {toastMessage && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-indigo-500/60 shadow-2xl backdrop-blur-md px-4 py-2.5 rounded-full flex items-center gap-2.5 text-xs text-indigo-200 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-none">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping inline-block" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={llmConfig}
        onSave={handleSaveSettings}
      />
    </div>
  )
}
