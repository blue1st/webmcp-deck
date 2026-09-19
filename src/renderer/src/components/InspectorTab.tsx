import React, { useState } from 'react'
import { WebMCPTool } from '../types'
import {
  Play,
  CheckCircle2,
  AlertCircle,
  Code2,
  ChevronDown,
  ChevronRight,
  Layers,
  Sparkles
} from 'lucide-react'

interface InspectorTabProps {
  tools: WebMCPTool[]
  onExecuteTool: (toolName: string, args: Record<string, any>) => Promise<any>
}

export const InspectorTab: React.FC<InspectorTabProps> = ({ tools, onExecuteTool }) => {
  const [formData, setFormData] = useState<Record<string, Record<string, any>>>({})
  const [runningTool, setRunningTool] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { data?: any; error?: string }>>({})
  const [expandedSchema, setExpandedSchema] = useState<Record<string, boolean>>({})

  const handleInputChange = (toolName: string, paramName: string, val: any) => {
    setFormData((prev) => ({
      ...prev,
      [toolName]: {
        ...(prev[toolName] || {}),
        [paramName]: val
      }
    }))
  }

  const handleRun = async (tool: WebMCPTool) => {
    setRunningTool(tool.name)
    const args = formData[tool.name] || {}
    try {
      const res = await onExecuteTool(tool.name, args)
      setResults((prev) => ({
        ...prev,
        [tool.name]: { data: res }
      }))
    } catch (err: any) {
      setResults((prev) => ({
        ...prev,
        [tool.name]: { error: err?.message || String(err) }
      }))
    } finally {
      setRunningTool(null)
    }
  }

  const toggleSchema = (toolName: string) => {
    setExpandedSchema((prev) => ({ ...prev, [toolName]: !prev[toolName] }))
  }

  if (tools.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
        <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mb-3 text-slate-500">
          <Layers size={24} />
        </div>
        <h3 className="font-semibold text-slate-200 mb-1">WebMCP ツールが未検出です</h3>
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
          WebMCPに対応したページを開くか、上部の「🏨 ホテルデモ」または「⚡ ECデモ」をクリックしてテストしてください。
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
            <Layers size={16} className="text-indigo-400" />
            検出されたWebMCPツール ({tools.length})
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            ページ上の <code className="text-indigo-300">document.modelContext</code> から直接テスト実行できます
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {tools.map((tool) => {
          const schema = tool.inputSchema || {}
          const properties = schema.properties || {}
          const required = schema.required || []
          const resultState = results[tool.name]
          const isRunning = runningTool === tool.name

          return (
            <div
              key={tool.name}
              className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm hover:border-slate-700/80 transition-colors"
            >
              {/* Tool Header */}
              <div className="p-3.5 bg-slate-800/40 border-b border-slate-800/80 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-indigo-300">
                      {tool.name}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
                      TOOL
                    </span>
                  </div>
                  {tool.description && (
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {tool.description}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => toggleSchema(tool.name)}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 shrink-0 p-1"
                  title="スキーマJSONを表示"
                >
                  <Code2 size={13} />
                  {expandedSchema[tool.name] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              </div>

              {/* Schema JSON Viewer (Collapsible) */}
              {expandedSchema[tool.name] && (
                <div className="bg-slate-950 p-3 border-b border-slate-800 font-mono text-[11px] text-slate-400 overflow-x-auto">
                  <pre>{JSON.stringify(schema, null, 2)}</pre>
                </div>
              )}

              {/* Dynamic Parameter Form */}
              <div className="p-3.5 space-y-3">
                {Object.keys(properties).length === 0 ? (
                  <div className="text-xs text-slate-500 italic">引数は不要です (パラメータなし)</div>
                ) : (
                  <div className="space-y-2.5">
                    {Object.entries(properties).map(([paramName, paramDef]: [string, any]) => {
                      const isReq = required.includes(paramName)
                      const currentVal = formData[tool.name]?.[paramName] ?? ''

                      return (
                        <div key={paramName} className="text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="font-mono text-slate-300 font-semibold flex items-center gap-1">
                              {paramName}
                              {isReq && <span className="text-rose-400 font-bold">*</span>}
                            </label>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {paramDef.type || 'any'}
                            </span>
                          </div>
                          {paramDef.description && (
                            <div className="text-[11px] text-slate-400">{paramDef.description}</div>
                          )}

                          {paramDef.type === 'boolean' ? (
                            <label className="flex items-center gap-2 cursor-pointer mt-1">
                              <input
                                type="checkbox"
                                checked={Boolean(currentVal)}
                                onChange={(e) =>
                                  handleInputChange(tool.name, paramName, e.target.checked)
                                }
                                className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-slate-300">有効化 (true)</span>
                            </label>
                          ) : paramDef.enum ? (
                            <select
                              value={currentVal}
                              onChange={(e) =>
                                handleInputChange(tool.name, paramName, e.target.value)
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-indigo-500 text-xs"
                            >
                              <option value="">選択してください</option>
                              {paramDef.enum.map((opt: string) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={paramDef.type === 'number' ? 'number' : 'text'}
                              placeholder={`値 (${paramDef.type || 'string'})`}
                              value={currentVal}
                              onChange={(e) =>
                                handleInputChange(
                                  tool.name,
                                  paramName,
                                  paramDef.type === 'number'
                                    ? e.target.value === ''
                                      ? ''
                                      : Number(e.target.value)
                                    : e.target.value
                                )
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-indigo-500 text-xs"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Execute Button */}
                <div className="pt-2 flex items-center justify-end">
                  <button
                    onClick={() => handleRun(tool)}
                    disabled={isRunning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-semibold shadow-sm transition-all"
                  >
                    {isRunning ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Play size={13} fill="currentColor" />
                    )}
                    <span>{isRunning ? '実行中...' : '手動テスト実行'}</span>
                  </button>
                </div>

                {/* Result Box */}
                {resultState && (
                  <div
                    className={`mt-2 rounded-lg p-3 text-xs font-mono border ${
                      resultState.error
                        ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                        : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5 font-sans font-bold">
                      {resultState.error ? (
                        <>
                          <AlertCircle size={14} className="text-rose-400" />
                          <span>実行エラー</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={14} className="text-emerald-400" />
                          <span>実行成功レスポンス</span>
                        </>
                      )}
                    </div>
                    <pre className="overflow-x-auto max-h-48 text-[11px] leading-relaxed">
                      {resultState.error
                        ? resultState.error
                        : JSON.stringify(resultState.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
