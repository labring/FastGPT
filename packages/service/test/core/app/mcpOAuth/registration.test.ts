import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildMcpOAuthCimdDocument,
  deregisterMcpOAuthClient,
  getMcpOAuthCimdEtag,
  isMcpOAuthCimdAvailable,
  isMcpOAuthCimdEtagMatched,
  isMcpOAuthCimdHostAllowed,
  resetMcpOAuthFetchImpl,
  selectMcpOAuthClient,
  setMcpOAuthFetchImpl,
  type McpOAuthServerMetadataType
} from '@fastgpt/service/core/app/mcpOAuth';
import { McpOAuthApiError } from '@fastgpt/service/core/app/mcpOAuth/errors';
import { decryptSecretValue, encryptSecretValue } from '@fastgpt/service/common/secret/utils';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';

const server = (overrides: Partial<McpOAuthServerMetadataType> = {}): McpOAuthServerMetadataType => ({
  issuer: 'https://example.org/',
  authorizationEndpoint: 'https://example.org/authorize',
  tokenEndpoint: 'https://example.org/token',
  source: 'discovered',
  fetchedAt: Date.now(),
  ...overrides
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

const asOAuthError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as McpOAuthApiError;
  }
  throw new Error('Expected promise to reject');
};

describe('mcpOAuth registration', () => {
  beforeEach(() => {});
  afterEach(() => resetMcpOAuthFetchImpl());

  it('builds a CIMD document with fixed S256 contract and ETag/304 semantics', () => {
    const document = buildMcpOAuthCimdDocument({
      clientId: 'https://fastgpt.example.com/api/core/app/mcpTools/oauth/client-metadata.json',
      redirectUri: 'https://fastgpt.example.com/api/core/app/mcpTools/oauth/callback'
    });
    expect(document).toMatchObject({
      client_name: 'FastGPT',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      code_challenge_method: 'S256'
    });
    expect(document.redirect_uris).toHaveLength(1);

    const etag = getMcpOAuthCimdEtag(document);
    expect(isMcpOAuthCimdEtagMatched(etag, etag)).toBe(true);
    expect(isMcpOAuthCimdEtagMatched(`W/${etag}`, etag)).toBe(true);
    expect(isMcpOAuthCimdEtagMatched('"other"', etag)).toBe(false);
    expect(isMcpOAuthCimdEtagMatched(undefined, etag)).toBe(false);
  });

  it('requires the CIMD Host to equal FE_DOMAIN', () => {
    expect(isMcpOAuthCimdHostAllowed('fastgpt.example.com', 'https://fastgpt.example.com')).toBe(
      true
    );
    expect(
      isMcpOAuthCimdHostAllowed('fastgpt.example.com:443', 'https://fastgpt.example.com')
    ).toBe(false);
    expect(isMcpOAuthCimdHostAllowed('evil.example.com', 'https://fastgpt.example.com')).toBe(
      false
    );
  });

  it('CIMD is unavailable unless the AS declares support and FE_DOMAIN is https', async () => {
    await expect(
      isMcpOAuthCimdAvailable({
        server: server({ clientIdMetadataDocumentSupported: true }),
        feDomain: 'https://example.com'
      })
    ).resolves.toBe(true);
    await expect(
      isMcpOAuthCimdAvailable({
        server: server({ clientIdMetadataDocumentSupported: false }),
        feDomain: 'https://example.com'
      })
    ).resolves.toBe(false);
    await expect(
      isMcpOAuthCimdAvailable({
        server: server({ clientIdMetadataDocumentSupported: true }),
        feDomain: 'http://example.com'
      })
    ).resolves.toBe(false);
  });

  it('auto prefers CIMD when available', async () => {
    const result = await selectMcpOAuthClient({
      server: server({ clientIdMetadataDocumentSupported: true }),
      clientMode: 'auto',
      redirectUri: 'https://example.com/callback',
      cimdClientId: 'https://example.com/client-metadata.json',
      cimdAvailable: true
    });
    expect(result.source).toBe('cimd');
    expect(result.client.clientId).toBe('https://example.com/client-metadata.json');
    expect(result.client.tokenEndpointAuthMethod).toBe('none');
  });

  it('auto falls back to DCR and encrypts the client secret', async () => {
    let registrationBody: any;
    setMcpOAuthFetchImpl(async (url, init) => {
      expect(url.toString()).toBe('https://example.org/register');
      registrationBody = JSON.parse(String(init?.body));
      return json(
        {
          client_id: 'dcr-client',
          client_secret: 'plain-secret',
          token_endpoint_auth_method: 'client_secret_post',
          registration_client_uri: 'https://example.org/register/dcr-client',
          registration_access_token: 'registration-token'
        },
        201
      );
    });

    const result = await selectMcpOAuthClient({
      server: server({
        registrationEndpoint: 'https://example.org/register',
        tokenEndpointAuthMethodsSupported: ['none', 'client_secret_post']
      }),
      clientMode: 'auto',
      redirectUri: 'https://example.com/callback',
      cimdClientId: 'https://example.com/client-metadata.json',
      cimdAvailable: false
    });

    expect(registrationBody.token_endpoint_auth_method).toBe('none');
    expect(registrationBody.code_challenge_method).toBe('S256');
    expect(result.source).toBe('dcr');
    expect(result.client.clientId).toBe('dcr-client');
    expect(result.client.tokenEndpointAuthMethod).toBe('client_secret_post');
    expect(result.client.clientSecret?.secret).toBeTruthy();
    expect(decryptSecretValue(result.client.clientSecret)).toBe('plain-secret');
    expect(decryptSecretValue(result.client.registrationAccessToken)).toBe('registration-token');
  });

  it('selects client_secret_basic by default when the AS does not declare methods', async () => {
    let registrationBody: any;
    setMcpOAuthFetchImpl(async (_url, init) => {
      registrationBody = JSON.parse(String(init?.body));
      return json({
        client_id: 'dcr-client',
        client_secret: 'plain-secret',
        registration_client_uri: 'https://example.org/register/dcr-client',
        registration_access_token: 'registration-token'
      });
    });

    const result = await selectMcpOAuthClient({
      server: server({ registrationEndpoint: 'https://example.org/register' }),
      clientMode: 'dcr',
      redirectUri: 'https://example.com/callback',
      cimdClientId: 'https://example.com/client-metadata.json',
      cimdAvailable: false
    });
    expect(registrationBody.token_endpoint_auth_method).toBe('client_secret_basic');
    expect(result.client.tokenEndpointAuthMethod).toBe('client_secret_basic');
  });

  it('manual requires a secret for confidential auth methods', async () => {
    const error = await asOAuthError(
      selectMcpOAuthClient({
        server: server(),
        clientMode: 'manual',
        redirectUri: 'https://example.com/callback',
        cimdClientId: 'https://example.com/client-metadata.json',
        cimdAvailable: false,
        manualClient: { clientId: 'manual-client', tokenEndpointAuthMethod: 'client_secret_post' }
      })
    );
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.clientRequired);
  });

  it('maps DCR 4xx to registration_rejected', async () => {
    setMcpOAuthFetchImpl(async () => json({ error: 'invalid_redirect_uri' }, 400));
    const error = await asOAuthError(
      selectMcpOAuthClient({
        server: server({ registrationEndpoint: 'https://example.org/register' }),
        clientMode: 'dcr',
        redirectUri: 'https://example.com/callback',
        cimdClientId: 'https://example.com/client-metadata.json',
        cimdAvailable: false
      })
    );
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.registrationRejected);
  });

  it('deregisters with RFC 7592 credentials', async () => {
    let authorization: string | undefined;
    setMcpOAuthFetchImpl(async (_url, init) => {
      authorization = new Headers(init?.headers).get('authorization') ?? undefined;
      return new Response(null, { status: 204 });
    });

    const deregistered = await deregisterMcpOAuthClient({
      clientId: 'dcr-client',
      tokenEndpointAuthMethod: 'none',
      registrationClientUri: 'https://example.org/register/dcr-client',
      registrationAccessToken: encryptSecretValue({ value: 'registration-token' })
    });
    expect(deregistered).toBe(true);
    expect(authorization).toBe('Bearer registration-token');
  });
});
