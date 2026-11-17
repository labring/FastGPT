/** 手动运行夹具协议回归：node --test .agents/test/support/toolset-fixture.selftest.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import https from 'node:https';

/** 仅为本轮夹具申请空闲端口；不创建任何数据库服务。 */
async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** HTTPS 只访问本轮临时自签证书的 localhost 夹具。 */
async function protocol({ url, data }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        rejectUnauthorized: false,
        headers: { 'content-type': 'application/json' }
      },
      (res) => {
        let value = '';
        res.on('data', (chunk) => {
          value += chunk;
        });
        res.on('end', () => resolve(JSON.parse(value)));
      }
    );
    req.on('error', reject);
    req.end(JSON.stringify(data));
  });
}

const tool = (name, description) => ({
  type: 'function',
  function: {
    name,
    description,
    parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] }
  }
});

test('toolset fixture advances by acknowledged calls', { timeout: 30000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fastgpt-toolset-fixture-'));
  const key = join(directory, 'key.pem'),
    cert = join(directory, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=localhost'
    ],
    { stdio: 'ignore' }
  );
  const [controlPort, portA, portB] = await Promise.all([freePort(), freePort(), freePort()]);
  const child = spawn(
    process.execPath,
    [new URL('./toolset-fixture.mjs', import.meta.url).pathname],
    {
      env: {
        ...process.env,
        FASTGPT_FIXTURE_TLS_KEY: key,
        FASTGPT_FIXTURE_TLS_CERT: cert,
        FASTGPT_FIXTURE_CONTROL_PORT: String(controlPort),
        FASTGPT_FIXTURE_PORT_A: String(portA),
        FASTGPT_FIXTURE_PORT_B: String(portB)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'exit').then(() => {
        throw new Error('Fixture exited during startup');
      })
    ]);
    const control = `http://127.0.0.1:${controlPort}`;
    const configure = async (steps) => {
      const response = await fetch(control, {
        method: 'POST',
        body: JSON.stringify({ resetAudit: true, plan: { steps } })
      });
      assert.equal(response.status, 200);
    };
    const model = async (input) => {
      const response = await fetch(control + '/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'test', ...input })
      });
      if (!input.stream || response.status !== 200)
        return { status: response.status, body: await response.json() };
      const chunks = (await response.text())
        .split('\n')
        .filter((line) => line.startsWith('data: {'))
        .map((line) => JSON.parse(line.slice(6)));
      return {
        status: response.status,
        body: {
          choices: [
            {
              message: chunks[0].choices[0].delta,
              finish_reason: chunks.at(-1).choices[0].finish_reason
            }
          ]
        }
      };
    };
    const acknowledge = (messages, message) => [
      ...messages,
      message,
      { role: 'tool', tool_call_id: message.tool_calls[0].id, content: 'ok' }
    ];
    const catalog = [
      tool('mcp_echo', 'MCP echo'),
      tool('http_echo', 'HTTP echo'),
      tool('long_tool', 'long remote tool')
    ];
    for (const stream of [false, true])
      await t.test(
        `same catalog executes all three protocol calls (stream=${stream})`,
        async () => {
          await configure(
            catalog.map((entry) => ({
              match: '^' + entry.function.description + '$',
              args: { q: 'fixture' }
            }))
          );
          let messages = [{ role: 'user', content: 'execute three tools' }];
          for (const [index, entry] of catalog.entries()) {
            const result = await model({ tools: catalog, messages, stream });
            assert.equal(result.status, 200);
            const message = result.body.choices[0].message;
            assert.equal(message.tool_calls[0].function.name, entry.function.name);
            const args = JSON.parse(message.tool_calls[0].function.arguments);
            const remote =
              index === 1
                ? await protocol({ url: `https://127.0.0.1:${portA}/echo?q=${args.q}`, data: {} })
                : await protocol({
                    url: `https://127.0.0.1:${portA}/mcp/names`,
                    data: {
                      jsonrpc: '2.0',
                      id: index,
                      method: 'tools/call',
                      params: {
                        name: index === 0 ? 'echo' : 'long_' + 'a'.repeat(59),
                        arguments: args
                      }
                    }
                  });
            assert.ok(
              index === 1 ? remote.fixture === 'http-A' : remote.result.content.length === 1
            );
            messages = acknowledge(messages, message);
          }
          assert.equal(
            (await model({ tools: catalog, messages, stream })).body.choices[0].finish_reason,
            'stop'
          );
          const audit = await (await fetch(control)).json();
          assert.equal(audit.state.plan.index, 3);
          assert.equal(
            audit.audits.filter((entry) => entry.kind === 'http' || entry.kind === 'mcp').length,
            3
          );
        }
      );
    await t.test(
      'single step stops only after its matching result and retry preserves call ID',
      async () => {
        await configure([{ match: 'MCP echo', args: { q: 'single' } }]);
        const input = { tools: catalog, messages: [{ role: 'user', content: 'single' }] };
        const first = await model(input),
          retry = await model(input);
        assert.equal(
          first.body.choices[0].message.tool_calls[0].id,
          retry.body.choices[0].message.tool_calls[0].id
        );
        const wrong = await model({
          ...input,
          messages: [
            ...input.messages,
            { role: 'tool', tool_call_id: 'unrelated', content: 'wrong' }
          ]
        });
        assert.equal(wrong.status, 400);
        const other = await model({
          ...input,
          messages: [{ role: 'user', content: 'another conversation' }]
        });
        assert.equal(other.status, 400);
        assert.equal((await (await fetch(control)).json()).state.plan.index ?? 0, 0);
        const final = await model({
          ...input,
          messages: acknowledge(input.messages, first.body.choices[0].message)
        });
        assert.equal(final.body.choices[0].finish_reason, 'stop');
      }
    );
    await t.test('next node and later user turn can continue the remaining plan', async () => {
      await configure([
        { match: 'MCP echo', args: { q: 'first' } },
        { match: 'HTTP echo', args: { q: 'second' } }
      ]);
      const messages = [{ role: 'user', content: 'first node' }];
      const first = await model({ tools: catalog.slice(0, 1), messages });
      const completed = acknowledge(messages, first.body.choices[0].message);
      assert.equal(
        (await model({ tools: catalog.slice(0, 1), messages: completed })).body.choices[0]
          .finish_reason,
        'stop'
      );
      const next = await model({
        tools: catalog,
        messages: [...completed, { role: 'user', content: 'next turn' }]
      });
      assert.equal(next.body.choices[0].message.tool_calls[0].function.name, 'http_echo');
    });
  } finally {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
