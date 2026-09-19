import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { AddressInfo } from 'net'

export class LocalDemoServer {
  private server: http.Server | null = null
  private port = 0
  private demoDir: string

  constructor() {
    const candidates = [
      path.resolve(__dirname, '../../src/demo'),
      path.resolve(__dirname, '../demo'),
      path.resolve(process.cwd(), 'src/demo'),
      path.resolve(process.cwd(), 'out/demo')
    ]
    this.demoDir = candidates.find(c => fs.existsSync(c)) || candidates[0]
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const preferredPort = 3847

      const createAndListen = (portToTry: number) => {
        const srv = http.createServer((req, res) => {
          // Enable CORS
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

          if (req.method === 'OPTIONS') {
            res.writeHead(200)
            res.end()
            return
          }

          const urlPath = req.url?.split('?')[0] || '/'
          let fileName = 'hotel.html'
          if (urlPath === '/shop' || urlPath === '/shop.html') {
            fileName = 'shop.html'
          } else if (urlPath === '/hotel' || urlPath === '/hotel.html' || urlPath === '/') {
            fileName = 'hotel.html'
          }

          const filePath = path.join(this.demoDir, fileName)
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8')
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(content)
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('Not Found')
          }
        })

        srv.once('listening', () => {
          this.server = srv
          const addr = srv.address() as AddressInfo
          this.port = addr.port
          console.log(`[WebMCP Demo Server] Running on http://127.0.0.1:${this.port}`)
          resolve(this.port)
        })

        srv.once('error', (err: any) => {
          try { srv.close() } catch {}
          if (err.code === 'EADDRINUSE' && portToTry !== 0) {
            console.warn(`[WebMCP Demo Server] Port ${portToTry} is busy, selecting an ephemeral port...`)
            createAndListen(0)
          } else {
            console.error('[WebMCP Demo Server] Error:', err)
            reject(err)
          }
        })

        srv.listen(portToTry, '127.0.0.1')
      }

      createAndListen(preferredPort)
    })
  }

  public getPort(): number {
    return this.port
  }

  public getUrls(): { hotel: string; shop: string } {
    return {
      hotel: `http://127.0.0.1:${this.port}/hotel.html`,
      shop: `http://127.0.0.1:${this.port}/shop.html`
    }
  }

  public stop(): void {
    if (this.server) {
      this.server.close()
      this.server = null
    }
  }
}
