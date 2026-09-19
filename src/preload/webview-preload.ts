import { ipcRenderer, webFrame } from 'electron'

// Injection script to run inside the Webview's Main World
const injectionScript = `
(() => {
  if (window.__webmcp_deck_injected__) return;
  window.__webmcp_deck_injected__ = true;

  const toolsRegistry = new Map();

  // ModelContext implementation / wrapper
  class ModelContextShim {
    constructor() {
      this._tools = toolsRegistry;
    }

    async registerTool(toolDef) {
      if (!toolDef || !toolDef.name) {
        throw new Error('WebMCP: registerTool requires a tool definition with a name.');
      }
      this._tools.set(toolDef.name, toolDef);
      this._notifyToolsChanged();
      return { success: true, name: toolDef.name };
    }

    async getTools() {
      return Array.from(this._tools.values()).map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || { type: 'object', properties: {} }
      }));
    }

    async executeTool(name, args) {
      const tool = this._tools.get(name);
      if (!tool) {
        throw new Error("WebMCP: Tool '" + name + "' not found.");
      }
      if (typeof tool.execute !== 'function') {
        throw new Error("WebMCP: Tool '" + name + "' does not have an execute function.");
      }
      return await tool.execute(args || {});
    }

    _notifyToolsChanged() {
      const toolSummaries = Array.from(this._tools.values()).map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || { type: 'object', properties: {} }
      }));
      window.postMessage({
        type: '__WEBMCP_TOOLS_UPDATED__',
        tools: toolSummaries,
        url: window.location.href,
        title: document.title
      }, '*');
    }
  }

  // Setup document.modelContext & navigator.modelContext
  const shim = new ModelContextShim();

  if (!document.modelContext) {
    Object.defineProperty(document, 'modelContext', {
      value: shim,
      writable: false,
      configurable: true
    });
  } else {
    // If native exists, wrap registerTool to capture tools for deck inspector
    const originalRegister = document.modelContext.registerTool.bind(document.modelContext);
    document.modelContext.registerTool = async function(toolDef) {
      toolsRegistry.set(toolDef.name, toolDef);
      shim._notifyToolsChanged();
      return await originalRegister(toolDef);
    };
  }

  if (!navigator.modelContext) {
    Object.defineProperty(navigator, 'modelContext', {
      value: document.modelContext,
      writable: false,
      configurable: true
    });
  }

  // Listen for execution commands from Preload
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.type === '__WEBMCP_REQUEST_TOOLS_REQ__') {
      shim._notifyToolsChanged();
    }

    if (event.data.type === '__WEBMCP_EXECUTE_TOOL_REQ__') {
      const { callId, name, args } = event.data;
      try {
        let result;
        const tool = toolsRegistry.get(name);
        if (tool && typeof tool.execute === 'function') {
          result = await tool.execute(args || {});
        } else if (typeof document.modelContext?.executeTool === 'function') {
          result = await document.modelContext.executeTool(name, args || {});
        } else {
          throw new Error("Tool '" + name + "' is not registered or not executable.");
        }
        window.postMessage({
          type: '__WEBMCP_EXECUTE_TOOL_RES__',
          callId,
          result: result !== undefined ? result : null
        }, '*');
      } catch (err) {
        window.postMessage({
          type: '__WEBMCP_EXECUTE_TOOL_RES__',
          callId,
          error: err instanceof Error ? err.message : String(err)
        }, '*');
      }
    }
  });

  // Notify on DOM / load events
  window.addEventListener('DOMContentLoaded', () => shim._notifyToolsChanged());
  window.addEventListener('load', () => shim._notifyToolsChanged());
  window.addEventListener('popstate', () => shim._notifyToolsChanged());

  setTimeout(() => shim._notifyToolsChanged(), 100);
  setTimeout(() => shim._notifyToolsChanged(), 500);
  setTimeout(() => shim._notifyToolsChanged(), 1500);
})();
`

// Inject safely into Main World
function injectMainWorld() {
  try {
    if (webFrame && typeof webFrame.executeJavaScript === 'function') {
      webFrame.executeJavaScript(injectionScript)
      return
    }
  } catch (e) {
    console.warn('[WebMCP webview-preload] webFrame.executeJavaScript failed, trying fallback:', e)
  }

  const target = document.head || document.documentElement
  if (target) {
    const scriptTag = document.createElement('script')
    scriptTag.textContent = injectionScript
    target.appendChild(scriptTag)
    scriptTag.remove()
  } else {
    document.addEventListener('DOMContentLoaded', injectMainWorld, { once: true })
  }
}

injectMainWorld()

// Listen to Main World messages and forward to Electron host
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data) return

  if (event.data.type === '__WEBMCP_TOOLS_UPDATED__') {
    ipcRenderer.sendToHost('webmcp:tools-updated', {
      tools: event.data.tools,
      url: event.data.url,
      title: event.data.title
    })
  }

  if (event.data.type === '__WEBMCP_EXECUTE_TOOL_RES__') {
    ipcRenderer.sendToHost('webmcp:tool-result', {
      callId: event.data.callId,
      result: event.data.result,
      error: event.data.error
    })
  }
})

// Listen to commands from host and forward to Main World
ipcRenderer.on('webmcp:execute-tool', (_event, { callId, toolName, args }) => {
  window.postMessage({
    type: '__WEBMCP_EXECUTE_TOOL_REQ__',
    callId,
    name: toolName,
    args
  }, '*')
})

ipcRenderer.on('webmcp:request-tools', () => {
  window.postMessage({
    type: '__WEBMCP_REQUEST_TOOLS_REQ__'
  }, '*')
})
