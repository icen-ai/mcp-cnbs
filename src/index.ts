#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Command } from 'commander';
import http from 'http';
import { createCnbsServer } from './server.js';
import { isInitializeRequest, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';

function checkAuth(authToken: string | undefined, authHeader: string | undefined): { authorized: boolean; error?: string } {
  if (!authToken) {
    return { authorized: true };
  }

  if (!authHeader) {
    return { authorized: false, error: 'Missing Authorization header. Please provide: Authorization: Bearer <token>' };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { authorized: false, error: 'Invalid Authorization format. Use: Bearer <token>' };
  }

  const token = match[1];
  if (token !== authToken) {
    return { authorized: false, error: 'Invalid token. Please check your authentication token.' };
  }

  return { authorized: true };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
};

class SSETransport {
  sessionId: string | undefined;
  private res: http.ServerResponse;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: any) => void;

  constructor(res: http.ServerResponse, sessionId: string) {
    this.res = res;
    this.sessionId = sessionId;
  }

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.onclose?.();
  }

  async send(message: any): Promise<void> {
    const event = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
    try {
      this.res.write(event);
    } catch {
      this.onerror?.(new Error('Failed to send message'));
    }
  }
}

async function launchCnbsServer() {
  const program = new Command();

  program
    .option('-p, --port <port>', 'Port to listen on for HTTP/SSE mode')
    .option('-H, --host <host>', 'Host to listen on for HTTP/SSE mode', '127.0.0.1')
    .option('-a, --auth-token <token>', 'Authorization token for HTTP mode (or use MCP_CNBS_AUTH_TOKEN env var)')
    .parse();

  const options = program.opts<{ port?: string; host: string; authToken?: string }>();
  const authToken = options.authToken || process.env.MCP_CNBS_AUTH_TOKEN;

  if (options.port) {
    const port = parseInt(options.port, 10);
    const sseTransports = new Map<string, SSETransport>();

    if (authToken) {
      console.error(`CNBS MCP HTTP server running on ${options.host}:${port} with authentication enabled`);
      console.error('Authorization: Bearer <token> required');
    } else {
      console.error(`CNBS MCP HTTP server running on ${options.host}:${port} (no authentication)`);
    }

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      const authResult = checkAuth(authToken, req.headers.authorization);
      if (!authResult.authorized) {
        res.writeHead(401, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32600, message: `Authentication failed: ${authResult.error}` },
          id: null
        }));
        return;
      }

      // / 作为 SSE 端点（默认）
      if (url.pathname === '/' || url.pathname === '/sse' || url.pathname === '/sse/') {
        const sessionId = crypto.randomUUID();
        const transport = new SSETransport(res, sessionId);
        sseTransports.set(sessionId, transport);

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...corsHeaders
        });

        const endpointEvent = `event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`;
        res.write(endpointEvent);

        const mcpServer = createCnbsServer();
        transport.onclose = () => {
          sseTransports.delete(sessionId);
        };
        await mcpServer.connect(transport as any);
        return;
      }

      if (url.pathname === '/message') {
        const sessionId = url.searchParams.get('sessionId');
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ error: 'Missing sessionId' }));
          return;
        }

        const transport = sseTransports.get(sessionId);
        if (!transport) {
          res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const messages = Array.isArray(parsed) ? parsed : [parsed];
            for (const msg of messages) {
              try {
                const validated = JSONRPCMessageSchema.parse(msg);
                transport.onmessage?.(validated);
              } catch (e) {
                console.error('Failed to parse message:', e);
              }
            }
            res.writeHead(202, corsHeaders);
            res.end('Accepted');
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32601, message: 'Method not found. Use / for SSE endpoint.' },
        id: null
      }));
    });

    server.listen(port, options.host);
  } else {
    const server = createCnbsServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

launchCnbsServer().catch((error) => {
  console.error('Failed to launch CNBS server:', error);
  process.exit(1);
});
