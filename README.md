# WebMCP Deck

> **WebMCP Client & Live Browser for AI Agents**  
> Chromium標準のWebMCP（`document.modelContext` / `navigator.modelContext`）を人間が普段使いできるデスクトップブラウザに統合。さらに外部LLM（Claude Desktop, Cursor等）から実ブラウザを操作できる **MCPプロキシサーバー** を備えたAI時代のWebクライアント。

---

## 📦 インストール方法

### macOS (Homebrew Cask)
```bash
brew tap blue1st/taps
brew install --cask webmcp-deck
```

### Windows
[GitHub Releases](https://github.com/blue1st/webmcp-deck/releases) から最新の `WebMCP-Deck-Setup-*.exe` をダウンロードして実行してください。

---

## 🌟 主な機能

### 1. 実用的なモダンブラウザ機能
* **スマートアドレスバー**: URL直接入力（自動補完）とGoogle検索キーワードを自動判定。
* **Chrome ブックマーク直接連携**: ローカルのChromeお気に入りを自動検出し、ヘッダーの「★」から瞬時に検索・ジャンプ。
* **ホームページURL設定**: お好みのサイト（Google、GitHub、社内ポータル等）をホームに指定可能。
* **ネイティブ右クリックメニュー**: コピー、貼り付け、要素の検証（Inspect Element）をフルサポート。

### 2. MCP サーバー機能（外部AIツール向けプロキシ）
* WebMCP Deck 自体がローカルの **MCP (Model Context Protocol) サーバー** として動作（ポート `3939`）。
* **Claude Desktop** や **Cursor** から、WebMCP Deck で開いているWebページのツールを透過的に呼び出せます。
* **Headlessブラウザの壁を突破**: ユーザーが手元でログインした後の実セッションを外部AIがそのまま安全に操作可能。
* 設定画面（⚙️）の「MCP連携」タブから、Claude Desktop 用や Cursor 用の設定JSONを1クリックでコピーできます。

### 3. サイト別スキル管理＆高速マクロ実行
* LLMと対話して実行したツールの操作履歴を、引数を変数化した「スキル」として1クリック保存。
* 開いているサイト（ドメイン）ごとのフィルタリング、誤削除防止付きの削除機能を搭載。
* 次回以降はLLM推論をスキップして爆速で一括実行。

### 4. 2ペイン・コックピットUI
* **左ペイン (Browser)**: 実ブラウザ画面。
* **右ペイン (Cockpit)**:
  * **Chat**: ローカルLLM（Ollama, vLLM, LM Studio等）と対話しながらページ上のタスクを実行。
  * **Inspector**: ページが公開しているWebMCPツールの定義一覧とフォームからの手動実行テスト。
  * **Skills**: 保存したサイト別自動化マクロの管理・実行。

---

## 🛠️ 開発・ビルド

```bash
# 依存パッケージのインストール
npm install

# 開発モード起動
npm run dev

# プロダクションビルド
npm run build

# パッケージング (ローカルテスト)
npm run dist:mac  # macOS (DMG & ZIP)
npm run dist:win  # Windows (EXE & ZIP)
```

---

## 🚀 リリース手順 (メンテナー向け)

本プロジェクトは `release-it` と GitHub Actions を利用してタグプッシュ時に macOS（Apple Silicon & Intel）と Windows 向けのインストーラーを自動生成・公開します。

```bash
# バージョンアップ & タギング & リモートプッシュ
npm run release
```
GitHub Actions により自動でビルドが走り、GitHub Releases へのアセット公開および `blue1st/homebrew-taps` への Cask 自動更新が実行されます。
