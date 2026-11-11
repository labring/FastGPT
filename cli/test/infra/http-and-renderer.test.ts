import { describe, expect, it } from 'vitest';
import {
  buildAuthHeaders,
  createFastGptHttpClient
} from '../../src/infra/http/fastgpt-http-client';
import { createOutputRenderer } from '../../src/infra/ui/renderer';
import { CliApiError, CliArgumentError, CliNetworkError } from '../../src/shared/errors';
import type { CliFetchFn } from '../../src/shared/types';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('FastGptHttpClient (ky) & OutputRenderer (picocolors)', () => {
  it('builds token header without Cookie and Bearer header for API Keys', () => {
    const tokenHeaders = buildAuthHeaders({
      auth: { authType: 'token', secret: 'u1:sess' },
      cliVersion: '0.1.0'
    });
    expect(tokenHeaders.token).toBe('u1:sess');
    expect(tokenHeaders.cookie).toBeUndefined();
    expect(tokenHeaders['x-fastgpt-client']).toContain('fastgpt-cli/0.1.0');

    const keyHeaders = buildAuthHeaders({
      auth: { authType: 'apikey', secret: 'fastgpt-abc' },
      cliVersion: '0.1.0'
    });
    expect(keyHeaders.authorization).toBe('Bearer fastgpt-abc');
  });

  it('unwraps FastGPT envelopes and classifies 514/expired/quota/business/network errors', async () => {
    const mockFetch: CliFetchFn = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/ok')) {
        return jsonResponse({ code: 200, statusText: '', message: '', data: { hello: 'world' } });
      }
      if (url.endsWith('/key-514')) {
        return jsonResponse(
          { code: 514, statusText: 'unAuthApiKey', message: 'APIKey invalid', data: null },
          500
        );
      }
      if (url.endsWith('/expired')) {
        return jsonResponse(
          { code: 500, statusText: 'error', message: 'API Key is expired', data: null },
          500
        );
      }
      if (url.endsWith('/quota')) {
        return jsonResponse(
          { code: 500, statusText: 'error', message: 'API Key is over usage', data: null },
          500
        );
      }
      if (url.endsWith('/bad-req')) {
        return jsonResponse(
          { code: 400, statusText: 'error', message: 'Data validation error', data: null },
          400
        );
      }
      throw new Error('connect ECONNREFUSED 127.0.0.1:3000');
    };

    const client = createFastGptHttpClient({
      baseUrl: 'http://127.0.0.1:3000/api',
      cliVersion: '0.1.0',
      fetchFn: mockFetch
    });

    await expect(client.request({ method: 'GET', path: '/ok' })).resolves.toEqual({
      hello: 'world'
    });
    await expect(client.request({ method: 'GET', path: '/key-514' })).rejects.toMatchObject({
      code: 'AUTH_INVALID',
      exitCode: 3
    });
    await expect(client.request({ method: 'GET', path: '/expired' })).rejects.toMatchObject({
      code: 'AUTH_EXPIRED',
      exitCode: 3
    });
    await expect(client.request({ method: 'GET', path: '/quota' })).rejects.toMatchObject({
      code: 'AUTH_QUOTA_EXCEEDED',
      exitCode: 3
    });
    await expect(client.request({ method: 'GET', path: '/bad-req' })).rejects.toBeInstanceOf(
      CliApiError
    );
    await expect(client.request({ method: 'GET', path: '/down' })).rejects.toBeInstanceOf(
      CliNetworkError
    );
  });

  it('renders JSON and text formats with picocolors and redaction', () => {
    const textRenderer = createOutputRenderer({ format: 'text', color: false });
    const renderedText = textRenderer.renderSuccess({
      command: 'auth status',
      result: {
        changed: false,
        message: 'Authenticated',
        data: {
          profile: 'default',
          tags: ['a', 'b'],
          emptyList: [],
          nested: { team: 'Core', checks: [{ name: 'ok' }, 'raw'] }
        },
        warnings: ['Fallback file mode with Authorization: Bearer secret-123']
      }
    });

    expect(renderedText).toContain('Authenticated');
    expect(renderedText).toContain('profile: default');
    expect(renderedText).toContain('tags: a, b');
    expect(renderedText).toContain('emptyList: (none)');
    expect(renderedText).toContain(
      'Warning: Fallback file mode with Authorization: Bearer [REDACTED]'
    );

    expect(
      textRenderer.renderSuccess({
        command: 'whoami',
        quiet: true,
        result: { changed: false, message: 'Banner', data: 'ok-str', warnings: ['Warn'] }
      })
    ).toBe('ok-str');

    const errText = textRenderer.renderError({
      command: 'login',
      error: new CliArgumentError('Bad flag', undefined, 'Run --help')
    });
    expect(errText).toContain('Error [CLI_ARGUMENT_INVALID]: Bad flag');
    expect(errText).toContain('Hint: Run --help');

    const jsonRenderer = createOutputRenderer({ format: 'json', color: true });
    const errJson = JSON.parse(
      jsonRenderer.renderError({
        command: 'login',
        error: new Error('Authorization: Bearer secret-xyz')
      })
    );
    expect(errJson.error.code).toBe('CLI_INTERNAL_ERROR');
    expect(errJson.error.message).toBe('Authorization: Bearer [REDACTED]');
  });
});
