import React, { useState, useRef, useEffect } from 'react'
import {
  ChatMessage,
  LLMConfig,
  WebMCPTool,
  ToolCallItem,
  ToolExecutionLog,
  SkillDefinition
} from '../types'
import { convertWebMCPToOpenAITools, isReadOnlyTool } from '../lib/llmClient'
import {
  Send,
  Bot,
  User,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  BookmarkPlus,
  RefreshCw,
  Terminal,
  Brain
} from 'lucide-react'

interface ChatTabProps {
  tools: WebMCPTool[]
  llmConfig: LLMConfig
  currentUrl: string
  onExecuteTool: (toolName: string, args: Record<string, any>) => Promise<any>
  onSaveSkill: (skill: SkillDefinition) => void
  onOpenSettings: () => void
}

export const ChatTab: React.FC<ChatTabProps> = ({
  tools,
  llmConfig,
  currentUrl,
  onExecuteTool,
  onSaveSkill,
  onOpenSettings
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'こんにちは！WebMCP Deckへようこそ。Webページを開くと、ページが公開しているWebMCPツールを自動検知してAIエージェントがブラウザ操作を支援します。',
      timestamp: Date.now()
    }
  ])
  const [inputText, setInputText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [completedToolLogs, setCompletedToolLogs] = useState<ToolExecutionLog[]>([])
  const [isSavingSkill, setIsSavingSkill] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Process LLM chat and tool-calling loop
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText.trim()
    if (!text || isGenerating) return

    setInputText('')
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now()
    }

    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setIsGenerating(true)

    try {
      await runAgentLoop(newMessages)
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error_${Date.now()}`,
          role: 'assistant',
          content: `⚠️ エラーが発生しました: ${err?.message || String(err)}。LLM設定（URL, Model）を確認してください。`,
          timestamp: Date.now()
        }
      ])
    } finally {
      setIsGenerating(false)
    }
  }

  const runAgentLoop = async (currentHistory: ChatMessage[]) => {
    // Convert history for OpenAI endpoint
    const apiMessages: any[] = [
      {
        role: 'system',
        content: `You are an intelligent web automation assistant equipped with WebMCP browser tools.
Use the provided tools to fulfill the user's intent directly on the active webpage.
When you complete the task or if you need clarification, provide a clear, helpful response in Japanese.`
      }
    ]

    for (const msg of currentHistory) {
      if (msg.role === 'user') {
        apiMessages.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          apiMessages.push({
            role: 'assistant',
            content: msg.content || '',
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
              }
            }))
          })

          // Add tool results
          for (const tc of msg.toolCalls) {
            if (tc.status === 'completed' || tc.status === 'failed') {
              apiMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result || { error: tc.error })
              })
            }
          }
        } else {
          apiMessages.push({ role: 'assistant', content: msg.content || '' })
        }
      }
    }

    const openAITools = convertWebMCPToOpenAITools(tools)

    // Call LLM
    const res = await (window as any).electronAPI.chatCompletion({
      baseUrl: llmConfig.baseUrl,
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      messages: apiMessages,
      tools: openAITools.length > 0 ? openAITools : undefined
    })

    const choiceMessage = res.message

    // Check for tool calls
    if (choiceMessage.tool_calls && choiceMessage.tool_calls.length > 0) {
      const toolCallItems: ToolCallItem[] = choiceMessage.tool_calls.map((rawCall: any) => {
        let args = {}
        try {
          args = typeof rawCall.function.arguments === 'string'
            ? JSON.parse(rawCall.function.arguments || '{}')
            : (rawCall.function.arguments || {})
        } catch {
          args = {}
        }

        const isReadOnly = isReadOnlyTool(rawCall.function.name)
        const autoApproved = llmConfig.autoApproveReadOnly && isReadOnly

        return {
          id: rawCall.id,
          name: rawCall.function.name,
          arguments: args,
          status: autoApproved ? 'running' : 'pending_approval'
        }
      })

      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: choiceMessage.content || undefined,
        reasoning: choiceMessage.reasoning_content || undefined,
        toolCalls: toolCallItems,
        timestamp: Date.now()
      }

      const updatedHistory = [...currentHistory, assistantMsg]
      setMessages(updatedHistory)

      // Execute auto-approved tools immediately
      const autoApprovedCalls = toolCallItems.filter((tc) => tc.status === 'running')
      if (autoApprovedCalls.length > 0) {
        await executeApprovedCalls(updatedHistory, assistantMsg.id, autoApprovedCalls)
      }
    } else {
      // Normal text response
      const content = choiceMessage.content || ''
      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: content || (choiceMessage.reasoning_content ? '' : '完了しました。'),
        reasoning: choiceMessage.reasoning_content || undefined,
        timestamp: Date.now()
      }
      setMessages([...currentHistory, assistantMsg])
    }
  }

  // Execute approved tool calls
  const executeApprovedCalls = async (
    history: ChatMessage[],
    assistantMsgId: string,
    callsToRun: ToolCallItem[]
  ) => {
    let currentMsgs = [...history]

    for (const call of callsToRun) {
      try {
        const result = await onExecuteTool(call.name, call.arguments)
        // Record completed tool execution
        setCompletedToolLogs((prev) => [
          ...prev,
          {
            id: call.id,
            tool: call.name,
            arguments: call.arguments,
            result,
            timestamp: Date.now()
          }
        ])

        currentMsgs = currentMsgs.map((m) => {
          if (m.id === assistantMsgId && m.toolCalls) {
            return {
              ...m,
              toolCalls: m.toolCalls.map((tc) =>
                tc.id === call.id ? { ...tc, status: 'completed', result } : tc
              )
            }
          }
          return m
        })
      } catch (err: any) {
        const errMsg = err?.message || String(err)
        currentMsgs = currentMsgs.map((m) => {
          if (m.id === assistantMsgId && m.toolCalls) {
            return {
              ...m,
              toolCalls: m.toolCalls.map((tc) =>
                tc.id === call.id ? { ...tc, status: 'failed', error: errMsg } : tc
              )
            }
          }
          return m
        })
      }
    }

    setMessages(currentMsgs)

    // If all tools in the message are finished, continue agent loop
    const targetMsg = currentMsgs.find((m) => m.id === assistantMsgId)
    const allDone = targetMsg?.toolCalls?.every(
      (tc) => tc.status === 'completed' || tc.status === 'failed' || tc.status === 'rejected'
    )

    if (allDone) {
      await runAgentLoop(currentMsgs)
    }
  }

  // Approve a pending tool call manually
  const handleApprove = async (msgId: string, callId: string) => {
    const msg = messages.find((m) => m.id === msgId)
    const call = msg?.toolCalls?.find((tc) => tc.id === callId)
    if (!call) return

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === msgId && m.toolCalls) {
          return {
            ...m,
            toolCalls: m.toolCalls.map((tc) =>
              tc.id === callId ? { ...tc, status: 'running' } : tc
            )
          }
        }
        return m
      })
    )

    setIsGenerating(true)
    try {
      await executeApprovedCalls(messages, msgId, [call])
    } finally {
      setIsGenerating(false)
    }
  }

  // Reject a pending tool call
  const handleReject = async (msgId: string, callId: string) => {
    const updated = messages.map((m) => {
      if (m.id === msgId && m.toolCalls) {
        return {
          ...m,
          toolCalls: m.toolCalls.map((tc) =>
            tc.id === callId
              ? { ...tc, status: 'rejected' as const, error: 'ユーザーによって拒否されました' }
              : tc
          )
        }
      }
      return m
    })
    setMessages(updated)
  }

  // Save successful tool logs as a reusable Skill
  const handleSaveAsSkill = async () => {
    if (completedToolLogs.length === 0 || isSavingSkill) return
    setIsSavingSkill(true)

    try {
      let origin = 'any'
      let hostname = 'Web'
      try {
        const u = new URL(currentUrl)
        origin = u.origin
        hostname = u.hostname
      } catch {}

      const skill: SkillDefinition = await (window as any).electronAPI.generateSkillDefinition({
        name: `${hostname}の操作スキル`,
        origin,
        logs: completedToolLogs.map((l) => ({ tool: l.tool, arguments: l.arguments })),
        baseUrl: llmConfig.baseUrl,
        apiKey: llmConfig.apiKey,
        model: llmConfig.model
      })

      await (window as any).electronAPI.saveSkill(skill)
      onSaveSkill(skill)

      setMessages((prev) => [
        ...prev,
        {
          id: `saved_${Date.now()}`,
          role: 'assistant',
          content: `🎉 「${skill.name}」をスキルとして保存しました！\n「Skills」タブからパラメータを入力してワンクリックで自動再実行できます。`,
          timestamp: Date.now()
        }
      ])
      setCompletedToolLogs([])
    } catch (err: any) {
      alert(`スキルの保存に失敗しました: ${err?.message || err}`)
    } finally {
      setIsSavingSkill(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Messages Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 text-xs leading-relaxed ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.role !== 'user' && (
              <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={15} />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                  : 'bg-slate-900 border border-slate-800/80 text-slate-200'
              }`}
            >
              {/* Reasoning / Thinking process */}
              {msg.reasoning && (
                <details className="mb-2 text-[11px] text-slate-400 bg-slate-950/60 rounded-lg border border-slate-800/80 p-2 group">
                  <summary className="cursor-pointer font-semibold flex items-center gap-1.5 text-slate-400 hover:text-slate-200 select-none">
                    <Brain size={13} className="text-indigo-400" />
                    <span>思考プロセス (Thinking)</span>
                  </summary>
                  <div className="mt-2 pt-2 border-t border-slate-800/60 font-mono text-[10px] text-slate-400 whitespace-pre-wrap leading-relaxed select-text">
                    {msg.reasoning}
                  </div>
                </details>
              )}

              {msg.content && (
                <div className="whitespace-pre-wrap select-text">{msg.content}</div>
              )}

              {/* Tool Calls inside Message */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mt-3 space-y-2.5">
                  {msg.toolCalls.map((tc) => (
                    <div
                      key={tc.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 font-mono font-bold text-indigo-300">
                          <Terminal size={13} />
                          <span>{tc.name}</span>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            tc.status === 'completed'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : tc.status === 'running'
                              ? 'bg-sky-950 text-sky-400 border border-sky-800 animate-pulse'
                              : tc.status === 'pending_approval'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {tc.status === 'completed' && '完了'}
                          {tc.status === 'running' && '実行中...'}
                          {tc.status === 'pending_approval' && '承認待ち'}
                          {tc.status === 'failed' && '失敗'}
                          {tc.status === 'rejected' && '拒否'}
                        </span>
                      </div>

                      {/* Arguments Preview */}
                      <div className="font-mono text-[11px] bg-slate-900/60 p-2 rounded border border-slate-800/50 text-slate-400 overflow-x-auto">
                        <pre>{JSON.stringify(tc.arguments, null, 2)}</pre>
                      </div>

                      {/* Pending Approval Controls (Human-in-the-Loop) */}
                      {tc.status === 'pending_approval' && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800/70 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 text-[11px] text-amber-400">
                            <ShieldAlert size={14} />
                            <span>実行前にユーザーの承認が必要です</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleReject(msg.id, tc.id)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                            >
                              拒否
                            </button>
                            <button
                              onClick={() => handleApprove(msg.id, tc.id)}
                              className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-colors flex items-center gap-1"
                            >
                              <ShieldCheck size={13} />
                              承認して実行
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Execution Result */}
                      {tc.result && (
                        <div className="mt-2 pt-1.5 border-t border-slate-800/50 text-[11px] text-emerald-400 font-mono">
                          <div className="font-bold flex items-center gap-1 mb-1">
                            <CheckCircle2 size={12} />
                            <span>実行結果:</span>
                          </div>
                          <pre className="overflow-x-auto max-h-28 text-slate-300 bg-slate-900/40 p-1.5 rounded">
                            {JSON.stringify(tc.result, null, 2)}
                          </pre>
                        </div>
                      )}

                      {tc.error && (
                        <div className="mt-2 text-[11px] text-rose-400 font-mono flex items-center gap-1">
                          <AlertCircle size={12} />
                          <span>{tc.error}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                <User size={15} />
              </div>
            )}
          </div>
        ))}

        {/* Save as Skill Action Banner */}
        {completedToolLogs.length > 0 && !isGenerating && (
          <div className="bg-gradient-to-r from-indigo-950/60 to-purple-950/60 border border-indigo-500/40 rounded-xl p-3 flex items-center justify-between gap-3 shadow-lg shadow-indigo-500/5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
                <Sparkles size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-100">
                  一連の操作 ({completedToolLogs.length} ステップ) をスキル化できます
                </h4>
                <p className="text-[11px] text-slate-400">
                  引数を自動で変数化し、次回以降LLM推論なしで高速に自動再実行できます
                </p>
              </div>
            </div>

            <button
              onClick={handleSaveAsSkill}
              disabled={isSavingSkill}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/20 disabled:opacity-50 shrink-0"
            >
              {isSavingSkill ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <BookmarkPlus size={14} />
              )}
              <span>{isSavingSkill ? '変数化中...' : 'Save as Skill'}</span>
            </button>
          </div>
        )}

        {isGenerating && (
          <div className="flex items-center gap-2 text-xs text-slate-400 pl-10">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span>LLMが推論中...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/50">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSendMessage()
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              tools.length > 0
                ? `ページに対する指示を入力 (検知された ${tools.length} 個のツールを利用可能)`
                : 'ページに対する指示を入力 (WebMCPツール未検出でも会話可能)'
            }
            disabled={isGenerating}
            className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isGenerating}
            className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white transition-colors"
            title="送信"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  )
}
