import React, { useState, useEffect, useRef } from 'react'
import appIcon from '../assets/app-icon.png'
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Sliders,
  Bot,
  Home,
  Search,
  Star,
  Lock,
  Globe,
  X,
  ExternalLink,
  Folder
} from 'lucide-react'
import { LLMConfig, WebMCPTool, ChromeBookmark } from '../types'

interface HeaderProps {
  currentUrl: string
  onNavigate: (url: string) => void
  onReload: () => void
  onGoBack: () => void
  onGoForward: () => void
  canGoBack: boolean
  canGoForward: boolean
  isLoading?: boolean
  tools: WebMCPTool[]
  llmConfig: LLMConfig
  onOpenSettings: () => void
  onSwitchTab: (tab: 'chat' | 'inspector' | 'skills') => void
}

export const Header: React.FC<HeaderProps> = ({
  currentUrl,
  onNavigate,
  onReload,
  onGoBack,
  onGoForward,
  canGoBack,
  canGoForward,
  isLoading = false,
  tools,
  llmConfig,
  onOpenSettings,
  onSwitchTab
}) => {
  const [inputUrl, setInputUrl] = useState(currentUrl)
  const [bookmarks, setBookmarks] = useState<ChromeBookmark[]>([])
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false)
  const [bookmarkFilter, setBookmarkFilter] = useState('')
  const bookmarksRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInputUrl(currentUrl)
  }, [currentUrl])

  // Load Chrome bookmarks on mount
  useEffect(() => {
    if ((window as any).electronAPI?.getChromeBookmarks) {
      (window as any).electronAPI
        .getChromeBookmarks()
        .then((bms: ChromeBookmark[]) => {
          if (Array.isArray(bms)) setBookmarks(bms)
        })
        .catch((e: any) => console.warn('Failed to load Chrome bookmarks:', e))
    }
  }, [])

  // Close bookmarks on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bookmarksRef.current && !bookmarksRef.current.contains(e.target as Node)) {
        setIsBookmarksOpen(false)
      }
    }
    if (isBookmarksOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isBookmarksOpen])

  // Smart Omnibox URL / Search resolver
  const handleSubmit = (query: string) => {
    const target = query.trim()
    if (!target) return

    // 1. Direct protocol
    if (/^(https?:\/\/|file:\/\/)/i.test(target)) {
      onNavigate(target)
      return
    }

    // 2. Localhost
    if (/^localhost(:\d+)?(\/.*)?$/i.test(target) || /^127\.0\.0\.1(:\d+)?(\/.*)?$/i.test(target)) {
      onNavigate('http://' + target)
      return
    }

    // 3. Domain pattern without whitespace (e.g. github.com, news.ycombinator.com/item)
    if (/^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/.test(target)) {
      onNavigate('https://' + target)
      return
    }

    // 4. Default: Google search
    onNavigate(`https://www.google.com/search?q=${encodeURIComponent(target)}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit(inputUrl)
    }
  }

  const isHttps = currentUrl.startsWith('https://')
  const filteredBookmarks = bookmarks.filter((b) => {
    const q = bookmarkFilter.toLowerCase().trim()
    if (!q) return true
    return (
      b.title.toLowerCase().includes(q) ||
      b.url.toLowerCase().includes(q) ||
      (b.folder && b.folder.toLowerCase().includes(q))
    )
  })

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-3 md:px-4 flex items-center justify-between gap-3 select-none shrink-0 relative">
      {/* Brand & History Controls */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2.5 mr-1 select-none">
          <img
            src={appIcon}
            alt="WebMCP Deck"
            className="w-8 h-8 object-contain drop-shadow-sm"
          />
          <span className="font-bold text-sm tracking-wide bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent hidden lg:inline">
            WebMCP Deck
          </span>
        </div>

        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/50">
          <button
            onClick={onGoBack}
            disabled={!canGoBack}
            className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="戻る"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            onClick={onGoForward}
            disabled={!canGoForward}
            className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="進む"
          >
            <ArrowRight size={16} />
          </button>
          <button
            onClick={onReload}
            className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            title="再読み込み"
          >
            <RotateCw size={15} className={isLoading ? 'animate-spin text-indigo-400' : ''} />
          </button>
          <button
            onClick={() => onNavigate(llmConfig.homeUrl || 'https://www.google.com')}
            className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            title={`ホーム (${llmConfig.homeUrl || 'https://www.google.com'})`}
          >
            <Home size={15} />
          </button>
        </div>
      </div>

      {/* Smart Omnibox (Search & URL) */}
      <div className="flex-1 max-w-4xl flex items-center gap-1.5 relative">
        <div className="w-full relative flex items-center bg-slate-950 border border-slate-700/80 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 rounded-lg px-2.5 py-1 transition-all">
          <div className="mr-2 text-slate-500 flex items-center">
            {isHttps ? (
              <Lock size={13} className="text-emerald-400" title="保護された通信 (HTTPS)" />
            ) : (
              <Globe size={13} className="text-slate-500" title="通常の通信" />
            )}
          </div>

          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={(e) => e.target.select()}
            placeholder="URL または Google 検索キーワードを入力..."
            className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500 font-sans"
          />

          {isLoading && (
            <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0 mr-1" />
          )}

          <button
            onClick={() => handleSubmit(inputUrl)}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors shrink-0"
            title="移動 / 検索"
          >
            <Search size={14} />
          </button>
        </div>

        {/* Chrome Bookmarks Dropdown Button */}
        <div className="relative" ref={bookmarksRef}>
          <button
            onClick={() => setIsBookmarksOpen(!isBookmarksOpen)}
            className={`p-2 rounded-lg border transition-all flex items-center justify-center text-xs ${
              isBookmarksOpen
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-slate-800/80 text-slate-300 hover:text-amber-300 hover:bg-slate-700 border-slate-700/60'
            }`}
            title="Chrome お気に入り (Bookmarks)"
          >
            <Star size={15} className={bookmarks.length > 0 ? 'fill-amber-400 text-amber-400' : ''} />
          </button>

          {/* Bookmarks Popover */}
          {isBookmarksOpen && (
            <div className="absolute left-0 top-full mt-2 w-80 md:w-96 max-h-[460px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/80 flex flex-col z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              {/* Header & Filter Search */}
              <div className="p-2.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  <span>Chrome お気に入り</span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">
                    {bookmarks.length}
                  </span>
                </div>
                <button
                  onClick={() => setIsBookmarksOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-2 border-b border-slate-800 bg-slate-900">
                <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs">
                  <Search size={13} className="text-slate-500 mr-1.5 shrink-0" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={bookmarkFilter}
                    onChange={(e) => setBookmarkFilter(e.target.value)}
                    placeholder="お気に入りを検索..."
                    className="bg-transparent w-full text-slate-200 outline-none text-xs"
                  />
                  {bookmarkFilter && (
                    <button onClick={() => setBookmarkFilter('')} className="text-slate-500 hover:text-slate-300">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 max-h-[340px]">
                {filteredBookmarks.length > 0 ? (
                  filteredBookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      onClick={() => {
                        onNavigate(bm.url)
                        setIsBookmarksOpen(false)
                      }}
                      className="p-2 rounded-lg hover:bg-indigo-950/40 hover:border-indigo-500/30 border border-transparent cursor-pointer transition-colors group flex items-start justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-200 group-hover:text-indigo-300 truncate">
                          {bm.title}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5 font-mono">
                          {bm.url}
                        </div>
                      </div>
                      {bm.folder && (
                        <span className="text-[9px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded shrink-0 flex items-center gap-1">
                          <Folder size={10} />
                          <span className="max-w-[80px] truncate">{bm.folder.split(' / ').pop()}</span>
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500">
                    {bookmarks.length === 0
                      ? 'Chromeのブックマークが見つかりませんでした'
                      : '一致するブックマークがありません'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Badges & Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* WebMCP Tool Detection Badge */}
        <button
          onClick={() => onSwitchTab('inspector')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
            tools.length > 0
              ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/60 shadow-sm shadow-emerald-500/10'
              : 'bg-slate-800/70 text-slate-400 border-slate-700/60'
          }`}
          title="クリックしてインスペクターを開く"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              tools.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
            }`}
          />
          <span>{tools.length} Tools</span>
        </button>

        {/* Model Badge */}
        <div
          className="hidden md:flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 px-2.5 py-1 rounded-md text-xs text-slate-300 cursor-pointer hover:border-slate-600 transition-colors"
          onClick={onOpenSettings}
          title="LLM設定を開く"
        >
          <Bot size={13} className="text-indigo-400" />
          <span className="font-mono max-w-[120px] truncate">{llmConfig.model}</span>
        </div>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          title="設定"
        >
          <Sliders size={17} />
        </button>
      </div>
    </header>
  )
}
