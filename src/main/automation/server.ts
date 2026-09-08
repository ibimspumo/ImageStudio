import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, CallToolResultSchema, ListToolsRequestSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'

export type AutomationMethod = 'tools/list' | 'tools/call'
export type AutomationDispatch = (method: AutomationMethod, params?: Record<string, unknown>) => Promise<unknown>

export interface AutomationHttpOptions {
  port: number
  token: () => string
  dispatch: AutomationDispatch
  rendererReady: () => boolean
  version: string
}

const MAX_BODY_BYTES = 32 * 1024 * 1024

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(value))
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw Object.assign(new Error('Content-Type must be application/json.'), { status: 415 })
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body exceeds 32 MB.'), { status: 413 })
    chunks.push(Buffer.from(chunk))
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {
    throw Object.assign(new Error('Invalid JSON request body.'), { status: 400 })
  }
}

/** Stateless MCP uses a fresh SDK protocol/transport pair per HTTP request. */
export function createAutomationHttpServer(options: AutomationHttpOptions): HttpServer {
  return createServer(async (req, res) => {
    try {
      const address = req.socket.localPort
      const expectedHost = `127.0.0.1:${address}`
      // Exact authority checks block DNS rebinding and browser cross-origin requests.
      if (req.headers.host !== expectedHost || (req.headers.origin !== undefined && req.headers.origin !== `http://${expectedHost}`)) {
        json(res, 403, { error: 'Only the local ImageStudio origin is allowed.' })
        return
      }
      const authorization = req.headers.authorization
      const expected = Buffer.from(`Bearer ${options.token()}`)
      const supplied = Buffer.from(typeof authorization === 'string' ? authorization : '')
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        json(res, 401, { error: 'A valid ImageStudio bearer token is required.' })
        return
      }
      res.setHeader('Cache-Control', 'no-store')
      const route = req.url
      if (route === '/health' && req.method === 'GET') {
        json(res, 200, { name: 'ImageStudio', version: options.version, running: true, rendererReady: options.rendererReady(), transport: 'streamable-http', mcp: '/mcp', tools: '/api/tools', call: '/api/call' })
        return
      }
      if (route === '/api/tools' && req.method === 'GET') {
        json(res, 200, ListToolsResultSchema.parse(await options.dispatch('tools/list')))
        return
      }
      if (route === '/api/call' && req.method === 'POST') {
        const body = await readJson(req)
        const parsed = CallToolRequestSchema.safeParse({ method: 'tools/call', params: body })
        if (!parsed.success) { json(res, 400, { error: 'Expected { name: string, arguments?: object }.' }); return }
        json(res, 200, CallToolResultSchema.parse(await options.dispatch('tools/call', parsed.data.params)))
        return
      }
      if (route === '/mcp') {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST')
          json(res, 405, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'This stateless MCP endpoint supports POST only.' } })
          return
        }
        const body = await readJson(req)
        const server = new Server({ name: 'imagestudio', version: options.version }, {
          capabilities: { tools: {} },
          instructions: 'Control the currently open ImageStudio app. Discover tools first. Generation creates paid provider jobs; inspect costs and capabilities before starting. Poll job status for progress. Secrets are never included in general status; read credentials only when specifically needed. App must remain open on this computer.'
        })
        server.setRequestHandler(ListToolsRequestSchema, async () => ListToolsResultSchema.parse(await options.dispatch('tools/list')))
        server.setRequestHandler(CallToolRequestSchema, async ({ params }) => CallToolResultSchema.parse(await options.dispatch('tools/call', params)))
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
        res.once('close', () => { void server.close().catch(() => {}) })
        await server.connect(transport)
        await transport.handleRequest(req, res, body)
        return
      }
      json(res, 404, { error: 'Unknown endpoint. Use GET /health, GET /api/tools, POST /api/call, or POST /mcp.' })
    } catch (error) {
      if (!res.headersSent && !res.destroyed) {
        const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 503
        json(res, status, { error: error instanceof Error ? error.message : 'ImageStudio request failed.' })
      } else if (!res.writableEnded) res.end()
    }
  })
}

export function listenAutomationServer(server: HttpServer, port: number): Promise<void> {
  server.requestTimeout = 135_000
  server.headersTimeout = 10_000
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => { server.removeListener('listening', onListening); reject(error) }
    const onListening = () => { server.removeListener('error', onError); resolve() }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

export async function closeAutomationServer(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
    server.closeAllConnections()
  })
}
