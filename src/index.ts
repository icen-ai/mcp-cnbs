#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Command } from 'commander';
import http from 'http';
import { createCnbsServer } from './server.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, X-Fred-Api-Key',
};

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
    const transports: Map<string, StreamableHTTPServerTransport> = new Map();
    const sseTransports: Map<string, SSEServerTransport> = new Map();

    if (authToken) {
      console.error(`CNBS MCP HTTP server running on ${options.host}:${port} with authentication enabled`);
      console.error('Authorization: Bearer <token> required');
    } else {
      console.error(`CNBS MCP HTTP server running on ${options.host}:${port} (no authentication)`);
    }

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const fredApiKey = req.headers['x-fred-api-key'] as string | undefined;

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

      // SSE endpoint
      if (url.pathname === '/sse' || url.pathname === '/sse/') {
        if (req.method !== 'GET') {
          res.writeHead(405, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32601, message: 'Method not allowed. Use GET for SSE endpoint.' },
            id: null
          }));
          return;
        }

        const transport = new SSEServerTransport('/message', res);
        sseTransports.set(transport.sessionId, transport);

        res.on('close', () => {
          sseTransports.delete(transport.sessionId);
        });

        const mcpServer = createCnbsServer({ fredApiKey });
        await mcpServer.connect(transport);
        return;
      }

      // SSE message endpoint
      if (url.pathname === '/message') {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32601, message: 'Method not allowed. Use POST for message endpoint.' },
            id: null
          }));
          return;
        }

        const sessionId = url.searchParams.get('sessionId');
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32600, message: 'Missing sessionId parameter' },
            id: null
          }));
          return;
        }

        const transport = sseTransports.get(sessionId);
        if (!transport) {
          res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Session not found' },
            id: null
          }));
          return;
        }

        let body: any = null;
        try {
          body = await new Promise((resolve, reject) => {
            let data = '';
            req.on('data', chunk => data += chunk);
            req.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch {
                resolve(null);
              }
            });
            req.on('error', reject);
          });
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal error reading request body' },
            id: null
          }));
          return;
        }

        await transport.handlePostMessage(req, res, body);
        return;
      }

      // Streamable HTTP endpoints
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId) {
        const transport = transports.get(sessionId);
        if (!transport) {
          res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Session not found. Server not initialized.' },
            id: null
          }));
          return;
        }

        if (req.method === 'POST') {
          let body: any = null;
          try {
            body = await new Promise((resolve, reject) => {
              let data = '';
              req.on('data', chunk => data += chunk);
              req.on('end', () => {
                try {
                  resolve(JSON.parse(data));
                } catch {
                  resolve(null);
                }
              });
              req.on('error', reject);
            });
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal error reading request body' },
              id: null
            }));
            return;
          }

          await transport.handleRequest(req, res, body);
          return;
        }

        if (req.method === 'GET') {
          const acceptHeader = req.headers['accept'] || '';
          if (!acceptHeader.includes('text/event-stream')) {
            res.writeHead(406, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32600, message: 'Not Acceptable: Client must accept text/event-stream for GET requests' },
              id: null
            }));
            return;
          }

          await transport.handleRequest(req, res);
          return;
        }

        if (req.method === 'DELETE') {
          await transport.handleRequest(req, res);
          transports.delete(sessionId);
          return;
        }

        res.writeHead(405, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32601, message: 'Method not allowed. Use POST, GET, or DELETE.' },
          id: null
        }));
        return;
      }

      if (req.method === 'POST' && (url.pathname === '/' || url.pathname === '/mcp')) {
        let body: any;
        try {
          body = await new Promise<any>((resolve, reject) => {
            let data = '';
            req.on('data', chunk => data += chunk);
            req.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch {
                resolve(null);
              }
            });
            req.on('error', reject);
          });
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal error reading request body' },
            id: null
          }));
          return;
        }

        if (!body) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error: Invalid JSON' },
            id: null
          }));
          return;
        }

        const messages = Array.isArray(body) ? body : [body];
        const isInit = messages.some((m: any) => isInitializeRequest(m));

        if (isInit) {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (sessionId) => {
              transports.set(sessionId, transport);
            }
          });

          transport.onclose = () => {
            if (transport.sessionId) {
              transports.delete(transport.sessionId);
            }
          };

          const mcpServer = createCnbsServer({ fredApiKey });
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, body);
          return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32002, message: 'Server not initialized. Send initialize request first.' },
          id: null
        }));
        return;
      }

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/mcp')) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32002, message: 'Server not initialized. Send initialize request first.' },
          id: null
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32601, message: 'Method not found. Use POST / or POST /mcp for Streamable HTTP, or GET /sse for legacy SSE.' },
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
