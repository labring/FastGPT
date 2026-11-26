/**
 * 内联工具集验收的协议边界夹具。只替代外部 MCP、HTTP 与模型服务；
 * FastGPT API、存储和工作流使用实际 dev 实例。控制端仅监听本机，不记录请求头原值。
 * 通过 FASTGPT_FIXTURE_TLS_KEY / FASTGPT_FIXTURE_TLS_CERT 指定测试证书和私钥后运行：
 * node .agents/test/support/toolset-fixture.mjs
 * 控制端 9446 的 POST 设置版本、换序、故障和模型计划；GET 返回状态和脱敏审计。
 * 模型审计包含完整测试消息，仅能传入本轮合成数据，不能用于真实用户或真实凭据。
 */
import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const controlPort = Number(process.env.FASTGPT_FIXTURE_CONTROL_PORT || 9446);
const portA = Number(process.env.FASTGPT_FIXTURE_PORT_A || 9447);
const portB = Number(process.env.FASTGPT_FIXTURE_PORT_B || 9448);
const originA = `https://127.0.0.1:${portA}`;
const longName = 'long_' + 'a'.repeat(59);
const audits = [];
const state = {
  version: 1,
  reverse: false,
  invalidMcp: false,
  invalidHttp: false,
  authTokens: {},
  expectedAuth: 'A',
  expectedApiKey: 'A',
  apiKeyHeader: 'x-api-key',
  plan: null,
  writes: 0
};
const held = new Map();
const send = ({ res, body, status = 200 }) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const record = (kind, data) => audits.push({ at: new Date().toISOString(), kind, ...data });
const parameters = (name) => ({
  type: 'object',
  properties: {
    q: { type: 'string' },
    ...(name === 'echo'
      ? {
          limit: { type: 'integer' },
          ...(state.version === 2 ? { locale: { type: 'string' } } : {})
        }
      : {})
  },
  required: ['q', ...(name === 'echo' && state.version === 2 ? ['locale'] : [])]
});
function tools(variant = '') {
  let result = [
    'echo',
    'fail',
    ...(state.version === 2 || variant === 'resume' ? ['lookup'] : []),
    ...(variant === 'names' ? [longName] : [])
  ].map((name) => ({
    name,
    description: name === 'echo' ? `MCP remote-echo-v${state.version}` : `MCP ${name}`,
    inputSchema: parameters(name)
  }));
  if (variant === 'parent' || variant === 'child')
    result = [
      { name: variant + '_tool', description: variant + '_tool', inputSchema: parameters('lookup') }
    ];
  return state.reverse ? result.reverse() : result;
}
function schema(variant = '', serverOrigin = originA) {
  const entries = [
    'echo',
    'fail',
    ...(state.version === 2 || variant === 'resume' ? ['lookup'] : [])
  ].map((name) => {
    const operation = {
      operationId: name,
      description: name === 'echo' ? `HTTP remote-echo-v${state.version}` : `HTTP ${name}`,
      parameters: Object.entries(parameters(name).properties).map(([key, value]) => ({
        name: key,
        in: 'query',
        required: parameters(name).required.includes(key),
        schema: value
      })),
      responses: {
        200: {
          description: 'ok',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  fixture: { type: 'string' },
                  q: { type: 'string' },
                  limit: { type: 'integer' }
                }
              }
            }
          }
        }
      }
    };
    return ['/' + name, { get: operation }];
  });
  let paths = Object.fromEntries(state.reverse ? entries.reverse() : entries);
  if (variant === 'dup') {
    const operations = [
      ['get', { description: 'HTTP read items', responses: { 200: { description: 'read' } } }],
      ['post', { description: 'HTTP write items', responses: { 200: { description: 'write' } } }]
    ];
    paths = { '/items': Object.fromEntries(state.reverse ? operations.reverse() : operations) };
  }
  return {
    openapi: '3.0.0',
    info: { title: 'FG integration fixture', version: String(state.version) },
    servers: [{ url: serverOrigin + (variant === 'auth' ? '/auth' : '') }],
    paths
  };
}
async function body(req) {
  let value = '';
  for await (const chunk of req) value += chunk;
  return value ? JSON.parse(value) : {};
}
/** 模型出口校验真实名称，并按当前计划选取真实目录中的工具，不改写非法名称。 */
async function completion(req, res) {
  const input = await body(req);
  const names = (input.tools ?? []).map((t) => t.function.name);
  const valid =
    names.every((s) => /^[a-zA-Z0-9_-]{1,64}$/.test(s)) && new Set(names).size === names.length;
  record('model', { body: input, valid });
  if (!valid)
    return send({
      res,
      body: {
        error: { message: 'Invalid or duplicate tool function name', type: 'invalid_request_error' }
      },
      status: 400
    });
  const plan = state.plan;
  if (!plan)
    return send({
      res,
      body: { error: { message: 'No deterministic test plan configured' } },
      status: 400
    });
  // 目录可在连续调用和后续回合中保持相同；只有收到本计划发出的调用结果才推进步骤。
  const pendingCall = plan.pendingCall;
  const requestIdentity = JSON.stringify({
    model: input.model,
    user: input.user,
    messages: input.messages,
    tools: input.tools
  });
  const receivedResult =
    pendingCall &&
    input.messages?.some(
      (message) => message.role === 'tool' && message.tool_call_id === pendingCall.id
    );
  if (receivedResult) {
    plan.index = (plan.index ?? 0) + 1;
    delete plan.pendingCall;
    delete plan.pendingRequest;
  } else if (pendingCall && plan.pendingRequest !== requestIdentity) {
    return send({
      res,
      body: { error: { message: 'Pending planned tool call has no matching result' } },
      status: 400
    });
  }
  let call;
  const step = plan.steps[plan.index ?? 0];
  if (plan.pendingCall) {
    // 重复请求重放同一次调用，不能因为重试跳过步骤或生成另一个调用 ID。
    call = plan.pendingCall;
  } else if (step) {
    const match = (input.tools ?? []).filter((t) =>
      new RegExp(step.match, 'i').test(t.function.description ?? '')
    );
    // 下一步属于后续工作流节点时先结束当前模型循环，保持该步供下一次模型请求使用。
    if (match.length !== 1 && !(receivedResult && match.length === 0))
      return send({
        res,
        body: { error: { message: `Plan matched ${match.length} tools: ${step.match}` } },
        status: 400
      });
    const selected = match[0]?.function;
    if (selected) {
      for (const key of selected.parameters?.required ?? [])
        assert.ok(Object.hasOwn(step.args ?? {}, key), `Plan lacks ${key}`);
      call = {
        id: 'call_' + randomUUID().replaceAll('-', ''),
        type: 'function',
        function: { name: selected.name, arguments: JSON.stringify(step.args ?? {}) }
      };
      plan.pendingCall = call;
      plan.pendingRequest = requestIdentity;
    }
  }
  const id = 'chatcmpl-' + randomUUID();
  const base = { id, created: Math.floor(Date.now() / 1000), model: input.model };
  const final = 'FG-TEST complete';
  if (!input.stream)
    return send({
      res,
      body: {
        ...base,
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: call
              ? { role: 'assistant', content: null, tool_calls: [call] }
              : { role: 'assistant', content: final },
            finish_reason: call ? 'tool_calls' : 'stop'
          }
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
      }
    });
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const chunk = ({ delta, finish_reason = null, usage }) =>
    res.write(
      'data: ' +
        JSON.stringify({
          ...base,
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta, finish_reason }],
          ...(usage ? { usage } : {})
        }) +
        '\n\n'
    );
  chunk({
    delta: {
      role: 'assistant',
      ...(call ? { tool_calls: [{ index: 0, ...call }] } : { content: final })
    }
  });
  chunk({
    delta: {},
    finish_reason: call ? 'tool_calls' : 'stop',
    usage: {
      prompt_tokens: 20,
      completion_tokens: 10,
      total_tokens: 30
    }
  });
  res.end('data: [DONE]\n\n');
}
async function handler({ req, res, marker }) {
  try {
    const url = new URL(req.url, originA);
    if (url.pathname.startsWith('/schema/')) {
      const variant = url.pathname.split('/')[2];
      const requestId = randomUUID();
      record('schema', { variant, marker, requestId });
      if (variant === 'slowA') await new Promise((resolve) => held.set('slowA', resolve));
      record('schema-response', { variant, marker, requestId });
      return send({
        res,
        body: state.invalidHttp
          ? { invalid: true }
          : schema(variant, marker === 'http-B' ? `https://127.0.0.1:${portB}` : originA)
      });
    }
    const protectedRoute = url.pathname.includes('/auth');
    const authAlias =
      Object.entries(state.authTokens).find(
        ([, token]) =>
          token === req.headers.authorization || `Bearer ${token}` === req.headers.authorization
      )?.[0] ?? 'missing-or-invalid';
    const apiKeyAlias =
      Object.entries(state.authTokens).find(
        ([, token]) => token === req.headers[state.apiKeyHeader.toLowerCase()]
      )?.[0] ?? 'missing-or-invalid';
    const isMcp = url.pathname.startsWith('/mcp/');
    const authorized =
      !protectedRoute ||
      (authAlias === state.expectedAuth && (isMcp || apiKeyAlias === state.expectedApiKey));
    if (url.pathname.startsWith('/mcp/')) {
      if (req.method === 'GET') {
        res.writeHead(405);
        return res.end();
      }
      const input = await body(req);
      const variant = url.pathname.split('/')[2];
      record('mcp', {
        method: input.method,
        tool: input.params?.name,
        args: input.params?.arguments,
        authorized,
        authAlias,
        ...(isMcp ? {} : { apiKeyAlias })
      });
      if (!authorized) return send({ res, body: { error: 'Unauthorized' }, status: 401 });
      if (!Object.hasOwn(input, 'id')) {
        res.writeHead(202);
        return res.end();
      }
      let result;
      if (input.method === 'initialize')
        result = {
          protocolVersion: input.params.protocolVersion,
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: 'fg-test', version: '1' }
        };
      else if (input.method === 'tools/list')
        result = { tools: state.invalidMcp ? 'invalid' : tools(variant) };
      else if (input.method === 'tools/call') {
        const name = input.params.name;
        if (!tools(variant).some((t) => t.name === name))
          return send({
            res,
            body: {
              jsonrpc: '2.0',
              id: input.id,
              error: { code: -32602, message: 'Unknown tool' }
            }
          });
        result =
          name === 'fail'
            ? { isError: true, content: [{ type: 'text', text: 'FG-TEST tool failure' }] }
            : {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      fixture: 'mcp',
                      operation: name,
                      ...input.params.arguments
                    })
                  }
                ]
              };
      } else
        return send({
          res,
          body: {
            jsonrpc: '2.0',
            id: input.id,
            error: { code: -32601, message: 'Unknown method' }
          }
        });
      return send({ res, body: { jsonrpc: '2.0', id: input.id, result } });
    }
    const route = url.pathname.replace(/^\/auth/, '');
    record('http', {
      method: req.method,
      path: route,
      query: Object.fromEntries(url.searchParams),
      marker,
      authorized,
      authAlias,
      ...(isMcp ? {} : { apiKeyAlias })
    });
    if (!authorized) return send({ res, body: { error: 'Unauthorized' }, status: 401 });
    if (route === '/fail')
      return send({ res, body: { error: 'FG-TEST HTTP failure' }, status: 500 });
    if (route === '/items') {
      if (req.method === 'POST') state.writes++;
      return send({
        res,
        body: { fixture: marker, operation: req.method === 'GET' ? 'read' : 'write' }
      });
    }
    return send({
      res,
      body: {
        fixture: marker,
        ...(route === '/lookup' ? { operation: 'lookup' } : {}),
        ...Object.fromEntries(
          [...url.searchParams].map(([k, v]) => [k, k === 'limit' ? Number(v) : v])
        )
      }
    });
  } catch (error) {
    record('fixture-error', { message: error.message });
    if (!res.headersSent) send({ res, body: { error: error.message }, status: 500 });
    else res.end();
  }
}
const tls = {
  key: await readFile(process.env.FASTGPT_FIXTURE_TLS_KEY),
  cert: await readFile(process.env.FASTGPT_FIXTURE_TLS_CERT)
};
for (const [port, marker] of [
  [portA, 'http-A'],
  [portB, 'http-B']
])
  https.createServer(tls, (req, res) => handler({ req, res, marker })).listen(port, '127.0.0.1');
http
  .createServer(async (req, res) => {
    try {
      if (req.url === '/v1/chat/completions') return await completion(req, res);
      if (req.method === 'GET')
        return send({
          res,
          body: {
            state: { ...state, authTokens: Object.keys(state.authTokens) },
            audits,
            held: [...held.keys()],
            longName
          }
        });
      const input = await body(req);
      if (input.release) {
        held.get(input.release)?.();
        held.delete(input.release);
      }
      if (input.resetAudit) audits.length = 0;
      for (const k of [
        'version',
        'reverse',
        'invalidMcp',
        'invalidHttp',
        'authTokens',
        'expectedAuth',
        'expectedApiKey',
        'apiKeyHeader',
        'plan'
      ])
        if (Object.hasOwn(input, k)) state[k] = input[k];
      send({ res, body: { ok: true } });
    } catch (error) {
      send({ res, body: { error: error.message }, status: 500 });
    }
  })
  .listen(controlPort, '127.0.0.1');
console.log(JSON.stringify({ controlPort, portA, portB }));
