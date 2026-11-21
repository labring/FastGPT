/**
 * MCP OAuth E2E fixture: authorization server (CIMD / DCR / manual) + Streamable
 * HTTP MCP server, in one zero-dependency Node process.
 *
 * Test-only. Never used by the production bundle. It intentionally implements
 * exactly the subset of RFC 8414 / 9728 / 7591 / 7592 / 7009 / PKCE that the
 * FastGPT MCP OAuth client exercises, so the real Next.js server can run
 * against a real HTTP peer.
 *
 * Scenario paths (all mounted on the same listener):
 *
 *   /s/<scenario>/mcp                  MCP JSON-RPC endpoint (Bearer required)
 *   /.well-known/oauth-protected-resource/s/<scenario>/mcp     (RFC 9728 PRM)
 *   /s/<scenario>                      AS issuer (exact string in metadata)
 *   /.well-known/oauth-authorization-server/s/<scenario>       (RFC 8414)
 *   /s/<scenario>/authorize|token|register|revoke
 *
 * Scenarios:
 *   a         CIMD advertised + DCR endpoint present (DCR must NOT be called)
 *   b         no CIMD, DCR works (exactly one /register)
 *   c         no CIMD, DCR declared but rejects (manual fallback path)
 *   manual    only manual client accepted
 *   ssrf      PRM points the authorization server at 127.0.0.1 (must be rejected)
 *   prm       PRM resource does not match the MCP URL (must be rejected)
 *   widen     token endpoint widens the granted scope (must be rejected)
 *   short     access tokens live 5s (proactive refresh path)
 *   norefresh authorization code response has no refresh_token
 *
 * Debug/control (loopback only, in-process API is the primary interface):
 *   GET  /__control/stats?scenario=a
 *   POST /__control/reset?scenario=a
 *   POST /__control/expire?scenario=a          -> previously issued ATs become 401
 *   POST /__control/mcp-mode?scenario=a&mode=ok|always401|insufficient_scope
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const DEFAULT_SCOPE = 'mcp:tools';

const SCENARIO_DEFS = {
  a: { cimd: true, dcr: true },
  b: { cimd: false, dcr: true },
  c: { cimd: false, dcr: 'fail', allowManual: true },
  manual: { cimd: false, dcr: false, allowManual: true },
  ssrf: { cimd: false, dcr: true },
  prm: { cimd: false, dcr: true, prmResourceMismatch: true },
  widen: { cimd: false, dcr: true, widenScope: true },
  short: { cimd: false, dcr: true, ttlSeconds: 5 },
  norefresh: { cimd: false, dcr: true, issueRefresh: false, ttlSeconds: 5 }
};

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const b64url = (buffer) => buffer.toString('base64url');
const randomToken = () => b64url(randomBytes(32));
const now = () => Date.now();

const json = (res, status, body, headers = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...headers
  });
  res.end(payload);
};

const readBody = (req, limit = 256 * 1024) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const parseForm = (raw) => Object.fromEntries(new URLSearchParams(raw));
const parseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/** Constant-time compare for PKCE/registration tokens; both inputs are hex/base64url. */
const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
};

export const createMockOAuthProvider = ({ host, port }) => {
  const base = `http://${host}:${port}`;
  const scenarios = new Map();
  const accessTokens = new Map();
  const refreshTokens = new Map();
  const authCodes = new Map();
  const registeredClients = new Map();

  const getScenario = (name) => scenarios.get(name);

  for (const [name, def] of Object.entries(SCENARIO_DEFS)) {
    scenarios.set(name, {
      name,
      ...def,
      issuer: `${base}/s/${name}`,
      mcpUrl: `${base}/s/${name}/mcp`,
      mcpMode: 'ok',
      stats: {
        authorize: 0,
        tokenExchange: 0,
        refresh: 0,
        revoke: 0,
        register: 0,
        deregister: 0,
        tokenErrors: 0,
        mcpAuthorizedRequests: 0,
        mcpProbe401: 0,
        mcp401: 0,
        mcp403: 0,
        mcpGets: 0,
        issuedAccessTokens: 0
      },
      events: []
    });
  }

  const record = (scenario, event) => {
    scenario.events.push({ at: new Date().toISOString(), ...event });
    if (scenario.events.length > 200) scenario.events.shift();
  };

  const issueTokens = (scenario, { clientId, scope, resource }) => {
    const accessToken = randomToken();
    const expiresIn = scenario.ttlSeconds ?? 3600;
    const recordValue = {
      scenario: scenario.name,
      clientId,
      scope,
      resource,
      expiresAt: now() + expiresIn * 1000,
      forcedExpired: false,
      fingerprint: sha256(accessToken)
    };
    accessTokens.set(accessToken, recordValue);
    scenario.stats.issuedAccessTokens += 1;

    let refreshToken;
    if (scenario.issueRefresh !== false) {
      refreshToken = randomToken();
      refreshTokens.set(refreshToken, {
        scenario: scenario.name,
        clientId,
        scope,
        resource,
        used: false,
        expiresAt: now() + 7 * 24 * 3600 * 1000
      });
    }

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope,
      ...(refreshToken ? { refresh_token: refreshToken } : {})
    };
  };

  const parseScenarioPath = (pathname, suffix) => {
    // /s/<name><suffix>
    const match = new RegExp(`^/s/([a-z]+)${suffix}$`).exec(pathname);
    return match?.[1];
  };

  const bearerOf = (req) => {
    const header = String(req.headers.authorization ?? '');
    const [scheme, value] = header.split(' ');
    if (!value || scheme.toLowerCase() !== 'bearer') return undefined;
    return value;
  };

  const bearerFailure = (scenario, res, status, error, description) => {
    const header =
      `Bearer error="${error}", error_description="${description}", ` +
      `scope="${DEFAULT_SCOPE}", ` +
      `resource_metadata="${base}/.well-known/oauth-protected-resource/s/${scenario.name}/mcp"`;
    json(res, status, { error, error_description: description }, { 'www-authenticate': header });
  };

  const TOOLS = [
    {
      name: 'echo',
      description: 'Echo the text argument (E2E fixture)',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text']
      }
    }
  ];

  const rpcResult = (message) => {
    switch (message.method) {
      case 'initialize':
        return {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'mcp-oauth-e2e-fixture', version: '1.0.0' }
        };
      case 'ping':
        return {};
      case 'tools/list':
        return { tools: TOOLS };
      case 'tools/call': {
        const params = message.params ?? {};
        if (params.name === 'echo') {
          return {
            content: [{ type: 'text', text: String(params.arguments?.text ?? '') }]
          };
        }
        return {
          isError: true,
          content: [{ type: 'text', text: `unknown tool: ${params.name}` }]
        };
      }
      default:
        return {};
    }
  };

  const handleMcp = async (req, res, scenario) => {
    if (req.method === 'GET') {
      scenario.stats.mcpGets += 1;
      record(scenario, { kind: 'mcp-get', authorization: bearerOf(req) ? 'present' : 'absent' });
      const token = bearerOf(req);
      if (!token) return bearerFailure(scenario, res, 401, 'invalid_token', 'missing bearer');
      return json(res, 405, { error: 'method_not_allowed' }, { allow: 'POST, DELETE' });
    }
    if (req.method === 'DELETE') {
      res.writeHead(204);
      return res.end();
    }
    if (req.method !== 'POST') {
      return json(res, 405, { error: 'method_not_allowed' }, { allow: 'POST, DELETE' });
    }

    const token = bearerOf(req);
    if (!token) {
      scenario.stats.mcpProbe401 += 1;
      record(scenario, { kind: 'mcp-unauthorized', mode: scenario.mcpMode });
      return bearerFailure(scenario, res, 401, 'invalid_token', 'missing bearer');
    }

    if (scenario.mcpMode === 'insufficient_scope') {
      scenario.stats.mcp403 += 1;
      record(scenario, { kind: 'mcp-403', mode: scenario.mcpMode });
      return bearerFailure(scenario, res, 403, 'insufficient_scope', 'fixture injected scope error');
    }

    if (scenario.mcpMode === 'always401') {
      scenario.stats.mcp401 += 1;
      record(scenario, { kind: 'mcp-401', mode: scenario.mcpMode });
      return bearerFailure(scenario, res, 401, 'invalid_token', 'fixture injected rejection');
    }

    const tokenRecord = accessTokens.get(token);
    if (
      !tokenRecord ||
      tokenRecord.scenario !== scenario.name ||
      tokenRecord.forcedExpired ||
      tokenRecord.expiresAt <= now()
    ) {
      scenario.stats.mcp401 += 1;
      record(scenario, { kind: 'mcp-401', mode: 'invalid-token' });
      return bearerFailure(scenario, res, 401, 'invalid_token', 'token expired or unknown');
    }

    scenario.stats.mcpAuthorizedRequests += 1;
    const message = parseJson(await readBody(req)) ?? {};
    record(scenario, {
      kind: 'mcp-rpc',
      method: message.method,
      hasId: message.id !== undefined && message.id !== null
    });

    if (message.id === undefined || message.id === null) {
      res.writeHead(202, { 'cache-control': 'no-store' });
      return res.end();
    }
    return json(res, 200, { jsonrpc: '2.0', id: message.id, result: rpcResult(message) });
  };

  const handleAuthorize = (url, res, scenario) => {
    const clientId = url.searchParams.get('client_id') ?? '';
    const redirectUri = url.searchParams.get('redirect_uri') ?? '';
    const state = url.searchParams.get('state') ?? '';
    const codeChallenge = url.searchParams.get('code_challenge') ?? '';
    const codeChallengeMethod = url.searchParams.get('code_challenge_method') ?? '';
    const scope = url.searchParams.get('scope') ?? DEFAULT_SCOPE;
    const resource = url.searchParams.get('resource') ?? scenario.mcpUrl;

    scenario.stats.authorize += 1;

    const clientAllowed =
      (scenario.cimd && /^https?:\/\/.+client-metadata\.json$/.test(clientId)) ||
      registeredClients.has(`${scenario.name}:${clientId}`) ||
      (scenario.allowManual && clientId === 'manual-client');

    if (!clientAllowed || !redirectUri || !state) {
      scenario.stats.tokenErrors += 1;
      record(scenario, { kind: 'authorize-rejected', clientId });
      return json(res, 400, { error: 'invalid_client', error_description: 'client not allowed' });
    }

    const code = randomToken();
    authCodes.set(code, {
      scenario: scenario.name,
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      scope,
      resource,
      used: false
    });
    record(scenario, { kind: 'authorize' });

    const location = new URL(redirectUri);
    location.searchParams.set('code', code);
    location.searchParams.set('state', state);
    location.searchParams.set('iss', scenario.issuer);
    res.writeHead(302, { location: location.toString(), 'cache-control': 'no-store' });
    return res.end();
  };

  const handleRegister = (req, res, scenario) => {
    if (scenario.dcr === 'fail') {
      scenario.stats.register += 1;
      record(scenario, { kind: 'register-rejected' });
      return json(res, 400, { error: 'invalid_client_metadata' });
    }
    scenario.stats.register += 1;
    Promise.resolve(readBody(req))
      .then((raw) => {
        const body = parseJson(raw) ?? {};
        if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
          return json(res, 400, { error: 'invalid_redirect_uri' });
        }
        const clientId = `dcr-${scenario.name}-${scenario.stats.register}`;
        const registrationAccessToken = `rat-${randomToken()}`;
        registeredClients.set(`${scenario.name}:${clientId}`, {
          redirectUris: body.redirect_uris,
          registrationAccessToken
        });
        record(scenario, { kind: 'register', clientId });
        return json(res, 201, {
          client_id: clientId,
          token_endpoint_auth_method: 'none',
          registration_client_uri: `${scenario.issuer}/register/${clientId}`,
          registration_access_token: registrationAccessToken
        });
      })
      .catch(() => json(res, 400, { error: 'invalid_client_metadata' }));
  };

  const handleToken = async (req, res, scenario) => {
    const form = parseForm(await readBody(req));
    const grantType = form.grant_type;
    const clientId = form.client_id ?? '';
    const clientOk = (candidate) =>
      candidate === '' ||
      (scenario.cimd && /^https?:\/\/.+client-metadata\.json$/.test(candidate)) ||
      registeredClients.has(`${scenario.name}:${candidate}`) ||
      (scenario.allowManual && candidate === 'manual-client');

    if (grantType === 'authorization_code') {
      const recordValue = authCodes.get(form.code ?? '');
      if (
        !recordValue ||
        recordValue.used ||
        recordValue.scenario !== scenario.name ||
        !clientOk(clientId) ||
        recordValue.clientId !== clientId ||
        recordValue.redirectUri !== form.redirect_uri ||
        !recordValue.codeChallenge ||
        !safeEqual(
          b64url(createHash('sha256').update(form.code_verifier ?? '').digest()),
          recordValue.codeChallenge
        ) ||
        (form.resource && form.resource !== recordValue.resource)
      ) {
        scenario.stats.tokenErrors += 1;
        record(scenario, { kind: 'token-exchange-rejected' });
        return json(res, 400, { error: 'invalid_grant' });
      }
      recordValue.used = true;
      authCodes.delete(form.code);

      scenario.stats.tokenExchange += 1;
      const grantedScope = scenario.widenScope
        ? `${recordValue.scope} ${DEFAULT_SCOPE}-admin`
        : recordValue.scope;
      return json(
        res,
        200,
        issueTokens(scenario, {
          clientId: recordValue.clientId,
          scope: grantedScope,
          resource: recordValue.resource
        })
      );
    }

    if (grantType === 'refresh_token') {
      const recordValue = refreshTokens.get(form.refresh_token ?? '');
      if (
        !recordValue ||
        recordValue.scenario !== scenario.name ||
        recordValue.used ||
        recordValue.expiresAt <= now() ||
        !clientOk(clientId) ||
        recordValue.clientId !== clientId ||
        (form.resource && form.resource !== recordValue.resource)
      ) {
        scenario.stats.tokenErrors += 1;
        record(scenario, { kind: 'refresh-rejected' });
        return json(res, 400, { error: 'invalid_grant' });
      }
      recordValue.used = true;
      refreshTokens.delete(form.refresh_token);
      scenario.stats.refresh += 1;
      record(scenario, { kind: 'refresh' });
      return json(
        res,
        200,
        issueTokens(scenario, {
          clientId: recordValue.clientId,
          scope: recordValue.scope,
          resource: recordValue.resource
        })
      );
    }

    scenario.stats.tokenErrors += 1;
    return json(res, 400, { error: 'unsupported_grant_type' });
  };

  const handleRequest = async (req, res) => {
    const url = new URL(req.url, base);
    const pathname = url.pathname;

    // Control API (fixture-local; stays inside the test process/loopback).
    if (pathname.startsWith('/__control/')) {
      const scenario = getScenario(url.searchParams.get('scenario') ?? 'a');
      switch (pathname) {
        case '/__control/stats':
          return json(res, 200, { stats: scenario?.stats, events: scenario?.events ?? [] });
        case '/__control/reset':
          if (scenario) {
            for (const key of Object.keys(scenario.stats)) scenario.stats[key] = 0;
            scenario.events.length = 0;
            scenario.mcpMode = 'ok';
          }
          return json(res, 200, { ok: true });
        case '/__control/expire':
          for (const token of accessTokens.values()) {
            if (!scenario || token.scenario === scenario.name) token.forcedExpired = true;
          }
          return json(res, 200, { ok: true });
        case '/__control/mcp-mode': {
          const mode = url.searchParams.get('mode') ?? 'ok';
          if (scenario) scenario.mcpMode = mode;
          return json(res, 200, { ok: true, mode });
        }
        default:
          return json(res, 404, { error: 'not_found' });
      }
    }

    // RFC 9728 protected resource metadata (path-aware).
    if (pathname.startsWith('/.well-known/oauth-protected-resource/s/')) {
      const scenario = getScenario(
        pathname.slice('/.well-known/oauth-protected-resource/s/'.length).replace(/\/mcp$/, '')
      );
      if (!scenario) return json(res, 404, { error: 'not_found' });
      const resource = scenario.prmResourceMismatch
        ? `${base}/s/${scenario.name}/other-resource`
        : scenario.mcpUrl;
      const authorizationServer =
        scenario.name === 'ssrf'
          ? `http://127.0.0.1:${port}/s/${scenario.name}`
          : scenario.issuer;
      return json(res, 200, {
        resource,
        authorization_servers: [authorizationServer],
        bearer_methods_supported: ['header'],
        scopes_supported: [DEFAULT_SCOPE]
      });
    }

    // RFC 8414 authorization server metadata: /.well-known/oauth-authorization-server/s/<name>
    if (pathname.startsWith('/.well-known/oauth-authorization-server/s/')) {
      const scenario = getScenario(
        pathname.slice('/.well-known/oauth-authorization-server/s/'.length)
      );
      if (!scenario) return json(res, 404, { error: 'not_found' });
      return json(res, 200, {
        issuer: scenario.issuer,
        authorization_endpoint: `${scenario.issuer}/authorize`,
        token_endpoint: `${scenario.issuer}/token`,
        ...(scenario.dcr !== false ? { registration_endpoint: `${scenario.issuer}/register` } : {}),
        revocation_endpoint: `${scenario.issuer}/revoke`,
        token_endpoint_auth_methods_supported: ['none'],
        code_challenge_methods_supported: ['S256'],
        client_id_metadata_document_supported: scenario.cimd === true,
        scopes_supported: [DEFAULT_SCOPE]
      });
    }

    const mcpScenarioName = parseScenarioPath(pathname, '/mcp');
    if (mcpScenarioName) {
      const scenario = getScenario(mcpScenarioName);
      if (!scenario) return json(res, 404, { error: 'not_found' });
      return handleMcp(req, res, scenario);
    }

    const authorizeScenario = parseScenarioPath(pathname, '/authorize');
    if (authorizeScenario && req.method === 'GET') {
      const scenario = getScenario(authorizeScenario);
      if (!scenario) return json(res, 404, { error: 'not_found' });
      return handleAuthorize(url, res, scenario);
    }

    const registerScenario = parseScenarioPath(pathname, '/register');
    if (registerScenario && req.method === 'POST') {
      const scenario = getScenario(registerScenario);
      if (!scenario || scenario.dcr === false) return json(res, 404, { error: 'not_found' });
      return handleRegister(req, res, scenario);
    }

    const deregisterMatch = /^\/s\/([a-z]+)\/register\/(.+)$/.exec(pathname);
    if (deregisterMatch && req.method === 'DELETE') {
      const scenario = getScenario(deregisterMatch[1]);
      if (!scenario) return json(res, 404, { error: 'not_found' });
      scenario.stats.deregister += 1;
      record(scenario, { kind: 'deregister', clientId: deregisterMatch[2] });
      res.writeHead(204, { 'cache-control': 'no-store' });
      return res.end();
    }

    const tokenScenario = parseScenarioPath(pathname, '/token');
    if (tokenScenario && req.method === 'POST') {
      const scenario = getScenario(tokenScenario);
      if (!scenario) return json(res, 404, { error: 'not_found' });
      return handleToken(req, res, scenario);
    }

    const revokeScenario = parseScenarioPath(pathname, '/revoke');
    if (revokeScenario && req.method === 'POST') {
      const scenario = getScenario(revokeScenario);
      if (!scenario) return json(res, 404, { error: 'not_found' });
      const form = parseForm(await readBody(req));
      const token = form.token ?? '';
      accessTokens.delete(token);
      refreshTokens.delete(token);
      scenario.stats.revoke += 1;
      record(scenario, { kind: 'revoke', tokenTypeHint: form.token_type_hint ?? 'unknown' });
      res.writeHead(200, { 'cache-control': 'no-store' });
      return res.end();
    }

    return json(res, 404, { error: 'not_found' });
  };

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      if (!res.headersSent) {
        json(res, 500, { error: 'server_error', error_description: String(error?.message ?? error) });
      } else {
        res.end();
      }
    });
  });

  return {
    base,
    scenarios,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '0.0.0.0', () => resolve());
      }),
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
    /** In-process control used by run.mjs (no secrets ever returned). */
    control: {
      stats: (name) => ({ ...getScenario(name).stats }),
      events: (name) => [...getScenario(name).events],
      reset: (name) => {
        const scenario = getScenario(name);
        for (const key of Object.keys(scenario.stats)) scenario.stats[key] = 0;
        scenario.events.length = 0;
        scenario.mcpMode = 'ok';
      },
      expireAccessTokens: (name) => {
        const scenario = getScenario(name);
        for (const token of accessTokens.values()) {
          if (token.scenario === scenario.name) token.forcedExpired = true;
        }
      },
      setMcpMode: (name, mode) => {
        getScenario(name).mcpMode = mode;
      },
      mcpUrl: (name) => getScenario(name).mcpUrl,
      issuer: (name) => getScenario(name).issuer,
      prmUrl: (name) =>
        `${base}/.well-known/oauth-protected-resource/s/${name}/mcp`
    }
  };
};
