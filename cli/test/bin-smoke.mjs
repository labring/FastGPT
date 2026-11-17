import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = join(packageRoot, 'dist', 'cli.mjs');
const configDir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-bin-smoke-'));

const OBJECT_ID_USER = '68ad85a7463006c963799a01';
const OBJECT_ID_TEAM = '68ad85a7463006c963799a02';
const OBJECT_ID_TMB = '68ad85a7463006c963799a03';
const OBJECT_ID_KEY = '68ad85a7463006c963799a04';
const SMOKE_KEY = 'fastgpt-smoke-secret-1234567890abcdef9999';

const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url === '/api/apidoc/devapi.json') {
    res.end(JSON.stringify({ paths: { '/support/user/account/whoami': { get: {} } } }));
    return;
  }
  if (req.url === '/api/support/user/account/whoami') {
    assert.equal(req.headers.authorization, `Bearer ${SMOKE_KEY}`);
    res.end(
      JSON.stringify({
        code: 200,
        statusText: '',
        message: '',
        data: {
          authType: 'apikey',
          apiKeyType: 'personal',
          user: { userId: OBJECT_ID_USER, username: 'smoke@fastgpt.in' },
          team: {
            teamId: OBJECT_ID_TEAM,
            teamName: 'Smoke Team',
            tmbId: OBJECT_ID_TMB,
            role: 'owner',
            permission: {
              isOwner: true,
              hasManagePer: true,
              hasWritePer: true,
              hasReadPer: true,
              hasAppCreatePer: true,
              hasDatasetCreatePer: true,
              hasApikeyCreatePer: true,
              hasSkillCreatePer: true,
              hasModelCreatePer: true
            }
          },
          apiKey: {
            id: OBJECT_ID_KEY,
            name: 'Smoke Key',
            maskedKey: '******9999',
            authProxy: false,
            limit: {
              expiredTime: null,
              maxUsagePoints: -1,
              usagePoints: 0,
              remainingPoints: null
            }
          }
        }
      })
    );
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ code: 404, message: 'Not Found', data: null }));
});

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
const baseUrl = `http://127.0.0.1:${port}`;

function run(args, input) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: packageRoot,
      env: {
        ...process.env,
        FASTGPT_CONFIG_DIR: configDir,
        FASTGPT_SECRET_STORE: 'file'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', rejectRun);
    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      try {
        assert.equal(code, 0, stderr || stdout);
        resolveRun(stdout);
      } catch (err) {
        rejectRun(err);
      }
    });
    if (input !== undefined) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

try {
  const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal((await run(['--version'])).trim(), pkg.version);

  const loginOut = JSON.parse(
    await run(['login', '--base-url', baseUrl, '--api-key-stdin'], `${SMOKE_KEY}\n`)
  );
  assert.equal(loginOut.ok, true);
  assert.equal(loginOut.data.maskedSecret, 'fastgpt-******9999');

  const whoamiOut = JSON.parse(await run(['whoami']));
  assert.equal(whoamiOut.ok, true);
  assert.equal(whoamiOut.data.user.username, 'smoke@fastgpt.in');
  assert.equal(whoamiOut.data.apiKey.name, 'Smoke Key');
  assert.equal(whoamiOut.data.apiKey.maskedKey, '******9999');

  const doctorOut = JSON.parse(await run(['doctor']));
  assert.equal(doctorOut.ok, true);
  assert.equal(doctorOut.data.ok, true);

  const logoutOut = JSON.parse(await run(['logout', '--purge']));
  assert.equal(logoutOut.ok, true);
  assert.equal(logoutOut.data.purged, true);

  process.stdout.write('fastgpt cli built bin smoke passed\n');
} finally {
  server.close();
  await rm(configDir, { recursive: true, force: true });
}
