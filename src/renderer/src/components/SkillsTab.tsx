import React, { useState, useMemo } from 'react'
import { SkillDefinition, SkillParameter } from '../types'
import { executeSkill, StepExecutionResult } from '../lib/skillRunner'
import {
  Play,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Sparkles,
  ChevronRight,
  Workflow,
  RotateCcw,
  Globe,
  ExternalLink,
  Filter
} from 'lucide-react'

interface SkillsTabProps {
  skills: SkillDefinition[]
  currentUrl?: string
  onDeleteSkill: (id: string) => void
  onExecuteTool: (toolName: string, args: Record<string, any>) => Promise<any>
  onNavigate?: (url: string) => void
}

export const SkillsTab: React.FC<SkillsTabProps> = ({
  skills,
  currentUrl = '',
  onDeleteSkill,
  onExecuteTool,
  onNavigate
}) => {
  const [filterMode, setFilterMode] = useState<'current' | 'all'>('current')
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [paramInputs, setParamInputs] = useState<Record<string, any>>({})
  const [isRunning, setIsRunning] = useState(false)
  const [executionSteps, setExecutionSteps] = useState<StepExecutionResult[]>([])
  const [runError, setRunError] = useState<string | null>(null)

  // Extract current page origin & hostname
  const { currentOrigin, currentHost } = useMemo(() => {
    try {
      const u = new URL(currentUrl)
      return { currentOrigin: u.origin, currentHost: u.hostname }
    } catch {
      return { currentOrigin: '', currentHost: '' }
    }
  }, [currentUrl])

  // Filter skills by origin
  const filteredSkills = useMemo(() => {
    if (filterMode === 'all' || !currentOrigin) {
      return skills
    }
    return skills.filter((s) => {
      if (!s.targetOrigin || s.targetOrigin === 'any' || s.targetOrigin === '*') return true
      return s.targetOrigin.toLowerCase() === currentOrigin.toLowerCase()
    })
  }, [skills, filterMode, currentOrigin])

  // Count skills matching current site
  const currentSiteSkillCount = useMemo(() => {
    if (!currentOrigin) return 0
    return skills.filter((s) => {
      if (!s.targetOrigin || s.targetOrigin === 'any' || s.targetOrigin === '*') return true
      return s.targetOrigin.toLowerCase() === currentOrigin.toLowerCase()
    }).length
  }, [skills, currentOrigin])

  const selectedSkill = useMemo(() => {
    if (selectedSkillId) {
      const found = skills.find((s) => s.id === selectedSkillId)
      if (found) return found
    }
    return filteredSkills.length > 0 ? filteredSkills[0] : null
  }, [skills, filteredSkills, selectedSkillId])

  // Handle skill selection
  const handleSelectSkill = (skill: SkillDefinition) => {
    setSelectedSkillId(skill.id)
    setExecutionSteps([])
    setRunError(null)

    const initialVals: Record<string, any> = {}
    skill.parameters.forEach((p) => {
      initialVals[p.name] = p.defaultValue ?? ''
    })
    setParamInputs(initialVals)
  }

  const handleParamChange = (name: string, val: any) => {
    setParamInputs((prev) => ({ ...prev, [name]: val }))
  }

  const handleDeleteSkillClick = (skill: SkillDefinition, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (window.confirm(`スキル「${skill.name}」を削除してもよろしいですか？`)) {
      if (selectedSkillId === skill.id) {
        setSelectedSkillId(null)
      }
      onDeleteSkill(skill.id)
    }
  }

  const handleRunSkill = async () => {
    if (!selectedSkill || isRunning) return

    setIsRunning(true)
    setRunError(null)
    setExecutionSteps(
      selectedSkill.steps.map((s, idx) => ({
        stepIndex: idx,
        tool: s.tool,
        arguments: s.arguments,
        status: 'pending'
      }))
    )

    try {
      await executeSkill(
        selectedSkill,
        paramInputs,
        onExecuteTool,
        (progress) => {
          setExecutionSteps((prev) => {
            const copy = [...prev]
            copy[progress.stepIndex] = progress
            return copy
          })
        }
      )
    } catch (err: any) {
      setRunError(err?.message || String(err))
    } finally {
      setIsRunning(false)
    }
  }

  const isOriginMismatch =
    selectedSkill &&
    selectedSkill.targetOrigin &&
    selectedSkill.targetOrigin !== 'any' &&
    selectedSkill.targetOrigin !== '*' &&
    currentOrigin &&
    selectedSkill.targetOrigin.toLowerCase() !== currentOrigin.toLowerCase()

  if (skills.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
        <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mb-3 text-slate-500">
          <Workflow size={24} />
        </div>
        <h3 className="font-semibold text-slate-200 mb-1">保存されたスキルがありません</h3>
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
          「Chat」タブでLLMと対話してWebページ上のタスクを実行すると、「Save as Skill」ボタンから自動で再利用可能なスキルを保存できます。
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex divide-x divide-slate-800 bg-slate-950">
      {/* Skill List Sidebar (Left) */}
      <div className="w-1/3 min-w-[220px] flex flex-col h-full bg-slate-900/30">
        {/* Scope Filter Tabs */}
        <div className="p-2 border-b border-slate-800 bg-slate-950/60">
          <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[11px]">
            <button
              onClick={() => setFilterMode('current')}
              className={`py-1 px-1.5 rounded-md font-semibold truncate transition-all ${
                filterMode === 'current'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={currentHost ? `現在のサイト: ${currentHost}` : '現在のサイト'}
            >
              このサイト ({currentSiteSkillCount})
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`py-1 px-1.5 rounded-md font-semibold truncate transition-all ${
                filterMode === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              すべて ({skills.length})
            </button>
          </div>
        </div>

        {/* List of Skills */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filteredSkills.length > 0 ? (
            filteredSkills.map((skill) => {
              const isSelected = selectedSkill?.id === skill.id
              const isCurrent =
                currentOrigin &&
                skill.targetOrigin &&
                skill.targetOrigin.toLowerCase() === currentOrigin.toLowerCase()

              let hostLabel = 'any'
              try {
                if (skill.targetOrigin && skill.targetOrigin !== 'any') {
                  hostLabel = new URL(skill.targetOrigin).hostname
                }
              } catch {}

              return (
                <div
                  key={skill.id}
                  onClick={() => handleSelectSkill(skill)}
                  className={`p-2.5 rounded-xl cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-indigo-950/60 border-indigo-500/50 text-white shadow-sm'
                      : 'bg-slate-900/50 border-slate-800/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="font-bold text-xs truncate flex-1">{skill.name}</div>
                    <button
                      onClick={(e) => handleDeleteSkillClick(skill, e)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 transition-colors shrink-0"
                      title="スキルを削除"
                    >
                      <Trash2 size={12} />
                    </button>
                    <ChevronRight size={13} className={isSelected ? 'text-indigo-400' : 'text-slate-600'} />
                  </div>

                  {skill.description && (
                    <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                      {skill.description}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-slate-800/60">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span>{skill.steps.length} steps</span>
                      <span>•</span>
                      <span>{skill.parameters.length} params</span>
                    </div>

                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono truncate max-w-[100px] flex items-center gap-1 ${
                        isCurrent
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-semibold'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                      title={`対象サイト: ${skill.targetOrigin || 'any'}`}
                    >
                      <Globe size={9} />
                      <span className="truncate">{hostLabel}</span>
                    </span>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="p-4 text-center text-xs text-slate-500 space-y-2">
              <p>このサイト用のスキルはまだありません</p>
              <button
                onClick={() => setFilterMode('all')}
                className="text-indigo-400 hover:underline text-[11px]"
              >
                すべてのスキル ({skills.length}件) を表示
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Skill Runner & Details Panel (Right) */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 space-y-4">
        {selectedSkill ? (
          <>
            {/* Origin Mismatch Warning Banner */}
            {isOriginMismatch && (
              <div className="bg-amber-950/40 border border-amber-500/50 rounded-xl p-3 flex items-center justify-between gap-3 text-xs text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-amber-400 shrink-0" />
                  <div>
                    <span className="font-semibold">対象サイトが異なります：</span>
                    <span className="text-slate-300 ml-1">
                      このスキルは <span className="font-mono text-amber-300">{selectedSkill.targetOrigin}</span> 用です。
                    </span>
                  </div>
                </div>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate(selectedSkill.targetOrigin)}
                    className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-xs flex items-center gap-1 shrink-0 transition-colors"
                  >
                    <ExternalLink size={12} />
                    <span>対象サイトを開く</span>
                  </button>
                )}
              </div>
            )}

            {/* Header with Title & Delete */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-400" />
                  {selectedSkill.name}
                </h3>
                {selectedSkill.description && (
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {selectedSkill.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-900 border border-slate-800 px-2 py-0.5 rounded flex items-center gap-1">
                    <Globe size={10} className="text-indigo-400" />
                    Target: {selectedSkill.targetOrigin || 'any'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleDeleteSkillClick(selectedSkill)}
                className="px-2.5 py-1.5 rounded-lg border border-rose-800/60 bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 hover:text-rose-100 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
                title="このスキルを削除"
              >
                <Trash2 size={13} />
                <span>スキルを削除</span>
              </button>
            </div>

            {/* Parameters Form */}
            {selectedSkill.parameters.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <h4 className="text-xs font-bold text-slate-200">パラメータ設定 (引数)</h4>
                <div className="grid grid-cols-1 gap-2.5">
                  {selectedSkill.parameters.map((param) => (
                    <div key={param.name} className="text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-mono text-slate-300 font-semibold">
                          ${param.name}
                        </label>
                        <span className="text-[10px] text-slate-500">{param.description}</span>
                      </div>
                      <input
                        type={param.type === 'number' ? 'number' : 'text'}
                        value={paramInputs[param.name] ?? ''}
                        onChange={(e) =>
                          handleParamChange(
                            param.name,
                            param.type === 'number'
                              ? e.target.value === ''
                                ? ''
                                : Number(e.target.value)
                              : e.target.value
                          )
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Execute Button */}
            <div className="flex items-center justify-between pt-1">
              <div className="text-xs text-slate-400">
                LLM推論をスキップしてWebMCPツールを直接高速実行します
              </div>
              <button
                onClick={handleRunSkill}
                disabled={isRunning}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all"
              >
                {isRunning ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
                <span>{isRunning ? 'スキル実行中...' : 'スキルを実行 (Run Skill)'}</span>
              </button>
            </div>

            {/* Execution Progress & Steps */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-slate-300">実行ステップ ({selectedSkill.steps.length})</h4>

              <div className="space-y-2">
                {selectedSkill.steps.map((step, idx) => {
                  const progress = executionSteps[idx]
                  const status = progress?.status || 'pending'

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border text-xs transition-all ${
                        status === 'success'
                          ? 'bg-emerald-950/30 border-emerald-800/60'
                          : status === 'running'
                          ? 'bg-sky-950/40 border-sky-600 animate-pulse'
                          : status === 'failed'
                          ? 'bg-rose-950/30 border-rose-800/60'
                          : 'bg-slate-900 border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-800 text-[10px] font-mono flex items-center justify-center font-bold text-slate-400">
                            {idx + 1}
                          </span>
                          <span className="font-mono font-bold text-indigo-300">{step.tool}</span>
                        </div>

                        <div>
                          {status === 'success' && (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                              <CheckCircle2 size={13} /> 完了
                            </span>
                          )}
                          {status === 'running' && (
                            <span className="flex items-center gap-1 text-[11px] text-sky-400 font-semibold">
                              <Clock size={13} className="animate-spin" /> 実行中
                            </span>
                          )}
                          {status === 'failed' && (
                            <span className="flex items-center gap-1 text-[11px] text-rose-400 font-semibold">
                              <AlertCircle size={13} /> エラー
                            </span>
                          )}
                          {status === 'pending' && (
                            <span className="text-[10px] text-slate-500 font-semibold">待機中</span>
                          )}
                        </div>
                      </div>

                      {/* Template Arguments */}
                      <div className="mt-2 text-[11px] font-mono text-slate-400 bg-slate-950/60 p-2 rounded border border-slate-800/50 overflow-x-auto">
                        <pre>
                          {JSON.stringify(progress?.arguments || step.arguments, null, 2)}
                        </pre>
                      </div>

                      {/* Result */}
                      {progress?.result && (
                        <div className="mt-2 text-[11px] font-mono text-emerald-300 bg-emerald-950/40 p-2 rounded border border-emerald-900/50 overflow-x-auto max-h-28">
                          <pre>{JSON.stringify(progress.result, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {runError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-xs text-rose-200 flex items-center gap-2">
                  <AlertCircle size={16} className="text-rose-400 shrink-0" />
                  <span>{runError}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500 text-xs">
            スキルを選択してください
          </div>
        )}
      </div>
    </div>
  )
}
