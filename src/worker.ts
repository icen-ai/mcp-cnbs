import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createCnbsServer } from './server.js';
import { isInitializeRequest, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

function checkAuth(request: Request, authToken: string | undefined): { authorized: boolean; error?: string } {
  if (!authToken) {
    return { authorized: true };
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return { authorized: false, error: 'Missing Authorization header' };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { authorized: false, error: 'Invalid Authorization format. Use: Bearer <token>' };
  }

  const token = match[1];
  if (token !== authToken) {
    return { authorized: false, error: 'Invalid token' };
  }

  return { authorized: true };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
};

class SSETransport implements Transport {
  sessionId: string | undefined;
  private controller: ReadableStreamDefaultController<Uint8Array>;
  private encoder: TextEncoder;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(controller: ReadableStreamDefaultController<Uint8Array>, sessionId: string) {
    this.controller = controller;
    this.encoder = new TextEncoder();
    this.sessionId = sessionId;
  }

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const event = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
    try {
      this.controller.enqueue(this.encoder.encode(event));
    } catch {
      this.onerror?.(new Error('Failed to send message'));
    }
  }
}

export class NationalStatsAgent {
  private state: DurableObjectState;
  private env: any;
  private transport: WebStandardStreamableHTTPServerTransport | null = null;
  private server: McpServer | null = null;
  private sseTransports: Map<string, SSETransport> = new Map();

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const authResult = checkAuth(request, this.env.MCP_CNBS_AUTH_TOKEN);
    if (!authResult.authorized) {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32600, message: `Authentication failed: ${authResult.error}` },
        id: null
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (url.pathname === '/sse' || url.pathname === '/sse/') {
      return this.handleSSE(request);
    }

    if (url.pathname === '/message') {
      return this.handleSSEMessage(request);
    }

    // / 作为 MCP 端点
    return this.handleMCPRequest(request);
  }

  async handleSSE(request: Request): Promise<Response> {
    const sessionId = crypto.randomUUID();
    let controller: ReadableStreamDefaultController<Uint8Array>;
    
    const readable = new ReadableStream<Uint8Array>({
      start: (ctrl) => {
        controller = ctrl;
        const endpointEvent = `event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`;
        controller.enqueue(new TextEncoder().encode(endpointEvent));
      },
      cancel: () => {
        this.sseTransports.delete(sessionId);
      }
    });

    const transport = new SSETransport(controller!, sessionId);
    this.sseTransports.set(sessionId, transport);

    const server = createCnbsServer();
    
    transport.onclose = () => {
      this.sseTransports.delete(sessionId);
    };

    await server.connect(transport);

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders
      }
    });
  }

  async handleSSEMessage(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing sessionId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const transport = this.sseTransports.get(sessionId);
    if (!transport) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const messages = Array.isArray(body) ? body : [body];
    
    for (const msg of messages) {
      try {
        const parsed = JSONRPCMessageSchema.parse(msg);
        transport.onmessage?.(parsed);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    }

    return new Response('Accepted', { status: 202, headers: corsHeaders });
  }

  async handleMCPRequest(request: Request): Promise<Response> {
    const sessionId = request.headers.get('mcp-session-id');
    
    if (sessionId && this.transport && this.transport.sessionId === sessionId) {
      return this.transport.handleRequest(request);
    }

    if (request.method === 'POST') {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error: Invalid JSON' },
          id: null
        }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }

      const messages = Array.isArray(body) ? body : [body];
      const isInit = messages.some((m: any) => isInitializeRequest(m));

      if (isInit) {
        if (this.transport && this.transport.sessionId) {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32600, message: 'Invalid Request: Server already initialized' },
            id: null
          }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        this.transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
        });

        this.transport.onclose = () => {
          this.transport = null;
          this.server = null;
        };

        this.server = createCnbsServer();
        await this.server.connect(this.transport);

        return this.transport.handleRequest(request, { parsedBody: body });
      }
    }

    if (request.method === 'GET') {
      const acceptHeader = request.headers.get('accept');
      if (!acceptHeader?.includes('text/event-stream')) {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Not Acceptable: Client must accept text/event-stream' },
          id: null
        }), { status: 406, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }

      if (!this.transport) {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: Server not initialized' },
          id: null
        }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }

      return this.transport.handleRequest(request);
    }

    if (request.method === 'DELETE') {
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
        this.server = null;
      }
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed' },
      id: null
    }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/mcp' || url.pathname === '/mcp/' || url.pathname === '/' || url.pathname === '/sse' || url.pathname === '/sse/' || url.pathname === '/message') {
      const id = env.MCP_OBJECT.idFromName('default');
      const stub = env.MCP_OBJECT.get(id);
      return stub.fetch(request);
    }

    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32601, message: 'Method not found. Use / for MCP endpoint.' },
      id: null
    }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  },
};
