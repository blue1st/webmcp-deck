import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { WebMCPTool } from '../types'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: any
    }
  }
}

export interface BrowserPaneHandle {
  executeTool: (toolName: string, args: Record<string, any>) => Promise<any>
  navigate: (url: string) => void
  reload: () => void
  goBack: () => void
  goForward: () => void
}

interface BrowserPaneProps {
  initialUrl: string
  preloadPath: string
  onUrlChanged: (url: string) => void
  onTitleChanged: (title: string) => void
  onNavStateChanged: (canGoBack: boolean, canGoForward: boolean) => void
  onToolsUpdated: (tools: WebMCPTool[]) => void
  onLoadingChanged?: (isLoading: boolean) => void
}

export const BrowserPane = forwardRef<BrowserPaneHandle, BrowserPaneProps>(
  (
    {
      initialUrl,
      preloadPath,
      onUrlChanged,
      onTitleChanged,
      onNavStateChanged,
      onToolsUpdated,
      onLoadingChanged
    },
    ref
  ) => {
    const webviewRef = useRef<any>(null)
    const pendingCalls = useRef<Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>>(
      new Map()
    )

    useImperativeHandle(ref, () => ({
      executeTool: async (toolName: string, args: Record<string, any>) => {
        if (!webviewRef.current) {
          throw new Error('ブラウザビューが利用できません')
        }
        const wv = webviewRef.current

        // 1. Try direct execution via executeJavaScript in page context
        try {
          const res = await wv.executeJavaScript(`
            (async () => {
              const mc = document.modelContext || navigator.modelContext;
              if (!mc || typeof mc.executeTool !== 'function') {
                throw new Error("WebMCP: document.modelContext がこのページで利用できません。");
              }
              return await mc.executeTool(${JSON.stringify(toolName)}, ${JSON.stringify(args || {})});
            })()
          `)
          return res
        } catch (execErr: any) {
          // If the error came from document.modelContext not existing, try IPC route
          if (execErr?.message && !execErr.message.includes('not available')) {
            // Error came from within the tool itself
            throw execErr
          }
          console.warn('[BrowserPane executeTool] executeJavaScript failed, trying IPC fallback:', execErr)
        }

        // 2. Fallback to IPC message
        return new Promise((resolve, reject) => {
          const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
          pendingCalls.current.set(callId, { resolve, reject })

          wv.send('webmcp:execute-tool', {
            callId,
            toolName,
            args
          })

          // Timeout after 30 seconds
          setTimeout(() => {
            if (pendingCalls.current.has(callId)) {
              const p = pendingCalls.current.get(callId)
              pendingCalls.current.delete(callId)
              p?.reject(new Error(`Tool execution for '${toolName}' timed out.`))
            }
          }, 30000)
        })
      },
      navigate: (url: string) => {
        if (webviewRef.current) {
          webviewRef.current.loadURL(url)
        }
      },
      reload: () => {
        if (webviewRef.current) {
          webviewRef.current.reload()
        }
      },
      goBack: () => {
        if (webviewRef.current && webviewRef.current.canGoBack()) {
          webviewRef.current.goBack()
        }
      },
      goForward: () => {
        if (webviewRef.current && webviewRef.current.canGoForward()) {
          webviewRef.current.goForward()
        }
      }
    }))

    useEffect(() => {
      const wv = webviewRef.current
      if (!wv) return

      const queryToolsFromPage = async () => {
        try {
          const tools = await wv.executeJavaScript(`
            (async () => {
              try {
                const mc = document.modelContext || navigator.modelContext;
                if (mc && typeof mc.getTools === 'function') {
                  return await mc.getTools();
                }
                return [];
              } catch (e) {
                return [];
              }
            })()
          `)
          if (Array.isArray(tools) && tools.length > 0) {
            onToolsUpdated(tools)
          }
        } catch {
          // Silent catch if page is still navigating
        }
      }

      const handleIpcMessage = (event: any) => {
        const { channel, args } = event

        if (channel === 'webmcp:tools-updated') {
          const payload = args[0]
          if (payload && Array.isArray(payload.tools)) {
            onToolsUpdated(payload.tools)
          }
        }

        if (channel === 'webmcp:tool-result') {
          const { callId, result, error } = args[0] || {}
          if (pendingCalls.current.has(callId)) {
            const { resolve, reject } = pendingCalls.current.get(callId)!
            pendingCalls.current.delete(callId)
            if (error) {
              reject(new Error(error))
            } else {
              resolve(result)
            }
          }
        }
      }

      const handleDidNavigate = (e: any) => {
        onUrlChanged(e.url)
        onNavStateChanged(wv.canGoBack(), wv.canGoForward())
        queryToolsFromPage()
      }

      const handleDidNavigateInPage = (e: any) => {
        onUrlChanged(e.url)
        onNavStateChanged(wv.canGoBack(), wv.canGoForward())
        queryToolsFromPage()
      }

      const handlePageTitleUpdated = (e: any) => {
        onTitleChanged(e.title)
      }

      const handleConsoleMessage = (e: any) => {
        console.log(`[Webview Console] [${e.level}] ${e.message}`)
      }

      const handleDidFailLoad = (e: any) => {
        if (e.isMainFrame) {
          console.warn(`[Webview Failed to Load] ${e.validatedURL}: (${e.errorCode}) ${e.errorDescription}`)
        }
      }

      const handleDomReady = () => {
        onNavStateChanged(wv.canGoBack(), wv.canGoForward())
        wv.send('webmcp:request-tools')

        // Poll tools multiple times to catch async tool registrations
        queryToolsFromPage()
        setTimeout(queryToolsFromPage, 200)
        setTimeout(queryToolsFromPage, 600)
        setTimeout(queryToolsFromPage, 1500)
      }

      const handleStartLoading = () => {
        onLoadingChanged?.(true)
      }

      const handleStopLoading = () => {
        onLoadingChanged?.(false)
      }

      wv.addEventListener('ipc-message', handleIpcMessage)
      wv.addEventListener('did-navigate', handleDidNavigate)
      wv.addEventListener('did-navigate-in-page', handleDidNavigateInPage)
      wv.addEventListener('page-title-updated', handlePageTitleUpdated)
      wv.addEventListener('console-message', handleConsoleMessage)
      wv.addEventListener('did-fail-load', handleDidFailLoad)
      wv.addEventListener('dom-ready', handleDomReady)
      wv.addEventListener('did-start-loading', handleStartLoading)
      wv.addEventListener('did-stop-loading', handleStopLoading)

      return () => {
        wv.removeEventListener('ipc-message', handleIpcMessage)
        wv.removeEventListener('did-navigate', handleDidNavigate)
        wv.removeEventListener('did-navigate-in-page', handleDidNavigateInPage)
        wv.removeEventListener('page-title-updated', handlePageTitleUpdated)
        wv.removeEventListener('console-message', handleConsoleMessage)
        wv.removeEventListener('did-fail-load', handleDidFailLoad)
        wv.removeEventListener('dom-ready', handleDomReady)
        wv.removeEventListener('did-start-loading', handleStartLoading)
        wv.removeEventListener('did-stop-loading', handleStopLoading)
      }
    }, [onUrlChanged, onTitleChanged, onNavStateChanged, onToolsUpdated, onLoadingChanged])

    const formattedPreload = preloadPath
      ? preloadPath.startsWith('file://')
        ? preloadPath
        : `file://${preloadPath}`
      : undefined

    return (
      <div className="w-full h-full flex flex-col bg-white overflow-hidden relative">
        <webview
          ref={webviewRef}
          src={initialUrl}
          preload={formattedPreload}
          className="w-full h-full border-none"
          allowpopups="true"
        />
      </div>
    )
  }
)

BrowserPane.displayName = 'BrowserPane'
