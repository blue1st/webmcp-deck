import React, { useState, useEffect } from 'react'
import { LLMConfig, McpServerStatus } from '../types'
import {
  X,
  Check,
  Bot,
  Zap,
  Shield,
  Key,
  Globe,
  RefreshCw,
  ChevronDown,
  Home,
  Copy,
  Radio,
  Terminal,
  Server,
  Sliders
} from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  config: LLMConfig
  onSave: (config: LLMConfig) => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave
}) => {
  const [formData, setFormData] = useState<LLMConfig>(config)
  const [activeTab, setActiveTab] = useState<'llm' | 'browser' | 'mcp'>('llm')
  const [testing, setTesting] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(
    null
  )
  const [mcpStatus, setMcpStatus] = useState<McpServerStatus | null>(null)
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null)

  const fetchMcpStatus = async () => {
    try {
      if ((window as any).electronAPI?.getMcpServerStatus) {
        const status = await (window as any).electronAPI.getMcpServerStatus()
        setMcpStatus(status)
      }
    } catch (e) {
      console.warn('Failed to get MCP server status:', e)
    }
  }

  // Sync formData when modal opens or config updates
  useEffect(() => {
    if (isOpen) {
      setFormData(config)
      setTestResult(null)
      fetchMcpStatus()
      // Auto fetch models if baseUrl is provided
      if (config.baseUrl) {
        fetchModels(config.baseUrl, config.apiKey)
      }
    }
  }, [isOpen, config])

  const getClaudeConfig = () => {
    const bridgePath =
      mcpStatus?.bridgePath || `${process.cwd?.() || ''}/bin/deck-mcp-bridge.mjs`
    return JSON.stringify(
      {
        mcpServers: {
          'webmcp-deck': {
            command: 'node',
            args: [bridgePath]
          }
        }
      },
      null,
      2
    )
  }

  const getCursorConfig = () => {
    const port = formData.mcpServerPort ?? 3939
    return JSON.stringify(
      {
        mcpServers: {
          'webmcp-deck': {
            url: `http://127.0.0.1:${port}/sse`
          }
        }
      },
      null,
      2
    )
  }

  const handleCopySnippet = (text: string, type: string) => {
    navigator.clipboard.writeText(text)
    setCopiedSnippet(type)
    setTimeout(() => setCopiedSnippet(null), 2500)
  }

  const fetchModels = async (baseUrl: string, apiKey?: string) => {
    if (!baseUrl) return
    setFetchingModels(true)
    try {
      const models = await (window as any).electronAPI.getModels({
        baseUrl,
        apiKey
      })
      if (Array.isArray(models) && models.length > 0) {
        setAvailableModels(models)
        // If current model is not set or default llama3, and we found server models, suggest the first one
        if (!formData.model || formData.model === 'llama3:latest') {
          setFormData((prev) => ({ ...prev, model: models[0] }))
        }
      }
    } catch (err) {
      console.warn('Could not auto-fetch models:', err)
    } finally {
      setFetchingModels(false)
    }
  }

  if (!isOpen) return null

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await (window as any).electronAPI.chatCompletion({
        baseUrl: formData.baseUrl,
        apiKey: formData.apiKey,
        model: formData.model,
        temperature: 0.1,
        messages: [{ role: 'user', content: 'Say OK' }]
      })
      if (res.message) {
        const text = res.message.content?.trim() || res.message.reasoning_content?.trim() || 'OK'
        setTestResult({
          success: true,
          message: `接続成功 (応答: ${text.slice(0, 100)})`
        })
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `接続失敗: ${err?.message || err}`
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-indigo-400" />
            <h3 className="font-bold text-sm text-slate-100">アプリケーション設定</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 pt-2.5 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('llm')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'llm'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot size={14} />
            <span>LLM 設定</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('browser')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'browser'
                ? 'border-cyan-500 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe size={14} />
            <span>ブラウザ設定</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mcp')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'mcp'
                ? 'border-violet-500 text-violet-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server size={14} />
            <span>MCP 連携</span>
            {mcpStatus?.running && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
            )}
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
            {/* Page 1: LLM Settings */}
            {activeTab === 'llm' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Base URL */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Globe size={13} className="text-slate-400" />
                    Base URL (OpenAI互換)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.baseUrl}
                      onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                      placeholder="http://localhost:11434/v1"
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 font-mono"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => fetchModels(formData.baseUrl, formData.apiKey)}
                      disabled={fetchingModels || !formData.baseUrl}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 flex items-center gap-1 shrink-0 font-medium transition-colors"
                      title="サーバーからモデル一覧を取得"
                    >
                      <RefreshCw size={12} className={fetchingModels ? 'animate-spin' : ''} />
                      <span>取得</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Ollama / llama.cpp / LM Studio / vLLM などのURL (例: <code>http://localhost:11434/v1</code>)
                  </p>
                </div>

                {/* Model Name */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Zap size={13} className="text-slate-400" />
                      モデル名 (Model Name)
                    </label>
                    {availableModels.length > 0 && (
                      <span className="text-[10px] text-indigo-400">
                        検出済み: {availableModels.length} 件
                      </span>
                    )}
                  </div>

                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="llama3:latest"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 font-mono"
                    required
                  />

                  {/* Quick model selector chips */}
                  {availableModels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 max-h-24 overflow-y-auto">
                      {availableModels.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setFormData({ ...formData, model: m })}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all ${
                            formData.model === m
                              ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-200'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* API Key */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Key size={13} className="text-slate-400" />
                    API Key (ローカルLLMの場合は空欄でOK)
                  </label>
                  <input
                    type="password"
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder="空欄可"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                {/* Temperature */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Sliders size={13} className="text-slate-400" />
                      Temperature (ランダム性: {formData.temperature ?? 0.2})
                    </label>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value={formData.temperature ?? 0.2}
                    onChange={(e) =>
                      setFormData({ ...formData, temperature: parseFloat(e.target.value) })
                    }
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>0.0 (確実・決定論的)</span>
                    <span>1.0 (創造的)</span>
                  </div>
                </div>

                {/* Connection Test Result */}
                {testResult && (
                  <div
                    className={`p-2.5 rounded-lg text-xs font-mono border break-all ${
                      testResult.success
                        ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-800 text-rose-300'
                    }`}
                  >
                    <div>{testResult.message}</div>
                    {!testResult.success && testResult.message?.includes('EHOSTUNREACH') && (
                      <div className="mt-2 pt-2 border-t border-rose-800/60 font-sans text-[11px] text-rose-200 leading-relaxed">
                        💡 <strong>macOSのローカルネットワーク制限:</strong><br />
                        macOSの「システム設定」→「プライバシーとセキュリティ」→「ローカルネットワーク」で <strong>Electron</strong> が許可されているかご確認ください。
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Page 2: Browser Settings */}
            {activeTab === 'browser' && (
              <div className="space-y-5 animate-in fade-in duration-150">
                {/* Home Page URL */}
                <div className="space-y-2">
                  <label className="font-semibold text-slate-300 flex items-center gap-1.5 text-xs">
                    <Home size={14} className="text-cyan-400" />
                    ホームページ URL (Home Page URL)
                  </label>
                  <input
                    type="text"
                    value={formData.homeUrl ?? 'https://www.google.com'}
                    onChange={(e) => setFormData({ ...formData, homeUrl: e.target.value })}
                    placeholder="https://www.google.com"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-cyan-500 font-mono text-xs"
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-slate-500">プリセット:</span>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, homeUrl: 'https://www.google.com' })}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors"
                    >
                      Google
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, homeUrl: 'https://github.com' })}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors"
                    >
                      GitHub
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, homeUrl: 'about:blank' })}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors"
                    >
                      空白ページ
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    ヘッダーのホームボタンを押した際やアプリ起動時に開く初期URLです。
                  </p>
                </div>

                {/* Safety & Human in the loop */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="font-semibold text-slate-300 flex items-center gap-1.5 text-xs">
                    <Shield size={14} className="text-emerald-400" />
                    安全設定 (Human-in-the-Loop)
                  </div>
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.autoApproveReadOnly}
                      onChange={(e) =>
                        setFormData({ ...formData, autoApproveReadOnly: e.target.checked })
                      }
                      className="mt-0.5 rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="text-[11px] leading-relaxed text-slate-300">
                      <span className="font-semibold text-slate-200">
                        参照系ツール (search, get 等) を自動承認する
                      </span>
                      <p className="text-slate-500 mt-1">
                        読み取り専用の安全なツール呼び出しを自動で通過させます。予約・注文・フォーム送信・決済等の副作用がある更新系ツールは、常に画面上で人間の確認・承認ダイアログが表示されます。
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Page 3: MCP Server Settings */}
            {activeTab === 'mcp' && (
              <div className="space-y-5 animate-in fade-in duration-150">
                {/* Status Card */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                      <Server size={16} />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200 text-xs">MCP サーバー状態</div>
                      <div className="text-[11px] text-slate-400">
                        {mcpStatus?.running
                          ? `ポート ${mcpStatus.port} で待機中 (${mcpStatus.clientsCount} クライアント接続)`
                          : 'サーバーは停止しています'}
                      </div>
                    </div>
                  </div>
                  <div>
                    {mcpStatus?.running ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400 font-mono text-[11px] bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800/50">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        稼働中
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-slate-500 font-mono text-[11px] bg-slate-900 px-2.5 py-1 rounded-full border border-slate-800">
                        <span className="w-2 h-2 rounded-full bg-slate-600" />
                        停止中
                      </span>
                    )}
                  </div>
                </div>

                {/* Configuration Options */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.enableMcpServer ?? true}
                      onChange={(e) =>
                        setFormData({ ...formData, enableMcpServer: e.target.checked })
                      }
                      className="rounded bg-slate-800 border-slate-700 text-violet-600 focus:ring-violet-500"
                    />
                    <div className="text-[11px]">
                      <span className="font-semibold text-slate-200">MCP サーバー有効</span>
                      <p className="text-slate-500 mt-0.5">外部からの呼出を許可</p>
                    </div>
                  </label>

                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-center">
                    <span className="text-[11px] text-slate-400">ポート番号:</span>
                    <input
                      type="number"
                      value={formData.mcpServerPort ?? 3939}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          mcpServerPort: parseInt(e.target.value, 10) || 3939
                        })
                      }
                      className="bg-transparent border-0 text-slate-100 font-mono font-bold text-sm outline-none focus:ring-0 p-0 mt-0.5"
                    />
                  </div>
                </div>

                {/* Setup Snippets */}
                <div className="space-y-2 pt-1 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      外部ツール接続用 設定JSON
                    </span>
                    <span className="text-[11px] text-slate-500">ワンクリックでコピー</span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Claude Desktop や Cursor に設定を追加することで、WebMCP Deck で開いているWebページのツールを外部AIが操作できるようになります。
                  </p>

                  <div className="space-y-2 pt-1">
                    {/* Claude Desktop Snippet Button */}
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                          <Terminal size={13} className="text-violet-400" />
                          Claude Desktop 設定
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                          claude_desktop_config.json
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopySnippet(getClaudeConfig(), 'claude')}
                        className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shrink-0 shadow-sm shadow-violet-600/30"
                      >
                        {copiedSnippet === 'claude' ? (
                          <>
                            <Check size={13} />
                            <span>コピー完了!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>JSONをコピー</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Cursor Snippet Button */}
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                          <Radio size={13} className="text-cyan-400" />
                          Cursor (SSE) 設定
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                          .cursor/mcp.json (http://127.0.0.1:{formData.mcpServerPort ?? 3939}/sse)
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopySnippet(getCursorConfig(), 'cursor')}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center gap-1.5 transition-colors shrink-0 border border-slate-700"
                      >
                        {copiedSnippet === 'cursor' ? (
                          <>
                            <Check size={13} className="text-emerald-400" />
                            <span className="text-emerald-400">コピー完了!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>JSONをコピー</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between shrink-0">
            {activeTab === 'llm' ? (
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                {testing ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    <span>接続テスト中...</span>
                  </>
                ) : (
                  <span>接続テスト</span>
                )}
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-xs transition-colors"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-sm shadow-indigo-600/30 transition-colors"
              >
                設定を保存
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
