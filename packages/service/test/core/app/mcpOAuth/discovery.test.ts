import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  discoverMcpOAuth,
  resetMcpOAuthFetchImpl,
  setMcpOAuthFetchImpl
} from '@fastgpt/service/core/app/mcpOAuth';
import { McpOAuthApiError } from '@fastgpt/service/core/app/mcpOAuth/errors';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });

const asOAuthError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as McpOAuthApiError;
  }
  throw new Error('Expected promise to reject');
};

describe('mcpOAuth discovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    resetMcpOAuthFetchImpl();
  });

  it('uses unauthenticated MCP initialize POST to read the PRM challenge', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    setMcpOAuthFetchImpl(async (url, init) => {
      calls.push({ url: url.toString(), init });
      if (url.toString() === 'https://mcp.example.com/mcp') {
        return json({}, 401, {
          'www-authenticate': 'Bearer resource_metadata="https://mcp.example.com/prm"'
        });
      }
      if (url.toString() === 'https://mcp.example.com/prm') {
        return json({
          resource: 'https://mcp.example.com/mcp',
          authorization_servers: ['https://as.example.net']
        });
      }
      if (url.toString() === 'https://as.example.net/.well-known/oauth-authorization-server') {
        return json({
          issuer: 'https://as.example.net',
          authorization_endpoint: 'https://as.example.net/authorize',
          token_endpoint: 'https://as.example.net/token',
          code_challenge_methods_supported: ['S256']
        });
      }
      return json({}, 404);
    });

    const result = await discoverMcpOAuth({
      mcpUrl: 'https://mcp.example.com/mcp'
    });

    const initializeCall = calls.find((call) => call.url === 'https://mcp.example.com/mcp');
    expect(initializeCall?.init?.method).toBe('POST');
    expect(JSON.parse(String(initializeCall?.init?.body)).method).toBe('initialize');
    expect(result.issuer).toBe('https://as.example.net/');
    expect(result.resource).toBe('https://mcp.example.com/mcp');
    expect(result.server.tokenEndpoint).toBe('https://as.example.net/token');
  });

  it('falls back to the MCP origin authorization server when PRM returns 404', async () => {
    setMcpOAuthFetchImpl(async (url) => {
      const value = url.toString();
      if (value === 'https://legacy.example.com/mcp') {
        return json({}, 401);
      }
      if (value.includes('/.well-known/oauth-protected-resource')) {
        return json({}, 404);
      }
      if (value === 'https://legacy.example.com/.well-known/oauth-authorization-server') {
        return json({
          issuer: 'https://legacy.example.com/',
          authorization_endpoint: 'https://legacy.example.com/authorize',
          token_endpoint: 'https://legacy.example.com/token'
        });
      }
      return json({}, 404);
    });

    const result = await discoverMcpOAuth({ mcpUrl: 'https://legacy.example.com/mcp' });
    expect(result.issuer).toBe('https://legacy.example.com/');
    expect(result.resource).toBe('https://legacy.example.com/mcp');
  });

  it('accepts cross-origin AS endpoints but still validates them individually', async () => {
    setMcpOAuthFetchImpl(async (url) => {
      const value = url.toString();
      if (value === 'https://mcp.example.com/mcp') {
        return json({}, 401, {
          'www-authenticate': 'Bearer resource_metadata="https://mcp.example.com/prm"'
        });
      }
      if (value === 'https://mcp.example.com/prm') {
        return json({
          resource: 'https://mcp.example.com/mcp',
          authorization_servers: ['https://as.example.net']
        });
      }
      if (value === 'https://as.example.net/.well-known/oauth-authorization-server') {
        return json({
          issuer: 'https://as.example.net',
          authorization_endpoint: 'https://auth.other.example/authorize',
          token_endpoint: 'https://token.other.example/token'
        });
      }
      return json({}, 404);
    });

    const result = await discoverMcpOAuth({ mcpUrl: 'https://mcp.example.com/mcp' });
    expect(result.server.authorizationEndpoint).toBe('https://auth.other.example/authorize');
    expect(result.server.tokenEndpoint).toBe('https://token.other.example/token');
  });

  it('rejects an AS document whose issuer differs, even cross-origin', async () => {
    setMcpOAuthFetchImpl(async (url) => {
      const value = url.toString();
      if (value === 'https://mcp.example.com/mcp') {
        return json({}, 401, {
          'www-authenticate': 'Bearer resource_metadata="https://mcp.example.com/prm"'
        });
      }
      if (value === 'https://mcp.example.com/prm') {
        return json({
          resource: 'https://mcp.example.com/mcp',
          authorization_servers: ['https://as.example.net']
        });
      }
      if (value === 'https://as.example.net/.well-known/oauth-authorization-server') {
        return json({
          issuer: 'https://attacker.example.net',
          authorization_endpoint: 'https://as.example.net/authorize',
          token_endpoint: 'https://as.example.net/token'
        });
      }
      return json({}, 404);
    });

    const error = await asOAuthError(discoverMcpOAuth({ mcpUrl: 'https://mcp.example.com/mcp' }));
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.issuerMismatch);
  });

  it('rejects a probe redirect without following it', async () => {
    setMcpOAuthFetchImpl(async (url) => {
      if (url.toString() === 'https://mcp.example.com/mcp') {
        return json({}, 302, { location: 'https://internal.example.net/' });
      }
      return json({}, 404);
    });

    const error = await asOAuthError(discoverMcpOAuth({ mcpUrl: 'https://mcp.example.com/mcp' }));
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.discoveryFailed);
  });

  it('rejects PRM resource mismatch', async () => {
    setMcpOAuthFetchImpl(async (url) => {
      const value = url.toString();
      if (value === 'https://mcp.example.com/mcp') {
        return json({}, 401, {
          'www-authenticate': 'Bearer resource_metadata="https://mcp.example.com/prm"'
        });
      }
      if (value === 'https://mcp.example.com/prm') {
        return json({
          resource: 'https://other.example.com/mcp',
          authorization_servers: ['https://as.example.net']
        });
      }
      return json({}, 404);
    });

    const error = await asOAuthError(discoverMcpOAuth({ mcpUrl: 'https://mcp.example.com/mcp' }));
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.prmResourceMismatch);
  });
});
