import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { runCli } from '../../src/cli/run';
import type { Prompter, SelectOption } from '../../src/infra/ui/prompter';
import type { CliFetchFn } from '../../src/shared/types';

const OBJECT_ID_USER = '68ad85a7463006c963799a01';
const OBJECT_ID_TEAM = '68ad85a7463006c963799a02';
const OBJECT_ID_TEAM_2 = '68ad85a7463006c963799a22';
const OBJECT_ID_TMB = '68ad85a7463006c963799a03';
const OBJECT_ID_KEY = '68ad85a7463006c963799a04';

const tempDirs: string[] = [];

async function makeConfigDir() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-e2e-'));
  tempDirs.push(dir);
  return dir;
}

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify({ code: status >= 400 ? status : 200, data }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

const fullPermission = {
  isOwner: true,
  hasManagePer: true,
  hasWritePer: true,
  hasReadPer: true,
  hasAppCreatePer: true,
  hasDatasetCreatePer: true,
  hasApikeyCreatePer: true,
  hasSkillCreatePer: true,
  hasModelCreatePer: true
};

const sampleUser = {
  _id: OBJECT_ID_USER,
  username: 'alice@fastgpt.in',
  timezone: 'Asia/Shanghai',
  hasPassword: true,
  status: 'active',
  team: {
    userId: OBJECT_ID_USER,
    teamId: OBJECT_ID_TEAM,
    teamName: 'Core Team',
    memberName: 'Alice',
    tmbId: OBJECT_ID_TMB,
    status: 'active',
    permission: {}
  },
  permission: {}
};

function createTestPrompter({
  textQueue = [],
  secretQueue = [],
  selectQueue = [],
  onSelect
}: {
  textQueue?: string[];
  secretQueue?: string[];
  selectQueue?: string[];
  onSelect?: (params: { message: string; options: readonly SelectOption<string>[] }) => void;
}): Prompter {
  const texts = [...textQueue];
  const secrets = [...secretQueue];
  const selects = [...selectQueue];
  return {
    isInteractive: true,
    text: async () => texts.shift() ?? '',
    secret: async () => secrets.shift() ?? '',
    confirm: async () => true,
    select: async <T extends string>({
      message,
      options
    }: {
      message: string;
      options: readonly SelectOption<T>[];
    }) => {
      onSelect?.({ message, options });
      const picked = selects.shift() ?? options[0].value;
      return picked as T;
    },
    note: () => {},
    spinner: () => ({
      start: () => {},
      stop: () => {}
    })
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function execCli({
  argv,
  configDir,
  isTTY = false,
  fetchFn,
  stdinText = '',
  prompter,
  openExternal
}: {
  argv: string[];
  configDir: string;
  isTTY?: boolean;
  fetchFn?: CliFetchFn;
  stdinText?: string;
  prompter?: Prompter;
  openExternal?: (path: string) => Promise<boolean>;
}) {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  const exitCode = await runCli({
    argv,
    env: {
      FASTGPT_CONFIG_DIR: configDir,
      FASTGPT_SECRET_STORE: 'file'
    },
    isTTY,
    fetchFn,
    prompter,
    readStdin: async () => stdinText,
    openExternal,
    stdout: (line) => stdoutLines.push(line),
    stderr: (line) => stderrLines.push(line)
  });

  return {
    exitCode,
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n')
  };
}

describe('CLI auth command integration', () => {
  it('runs login --api-key-stdin, whoami, doctor, auth list/switch, config, and logout', async () => {
    const configDir = await makeConfigDir();
    const rawKey = 'fastgpt-personal-key-1234567890abcdef123456';

    const mockFetch: CliFetchFn = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const authHeader =
        input instanceof Request
          ? input.headers.get('authorization')
          : (init?.headers as Record<string, string> | undefined)?.authorization;

      if (url.endsWith('/apidoc/devapi.json')) {
        return new Response(
          JSON.stringify({ paths: { '/support/user/account/whoami': { get: {} } } }),
          { status: 200 }
        );
      }

      if (url.endsWith('/support/user/account/whoami')) {
        expect(authHeader).toBe(`Bearer ${rawKey}`);
        return jsonResp({
          authType: 'apikey',
          apiKeyType: 'personal',
          user: { userId: OBJECT_ID_USER, username: 'alice@fastgpt.in' },
          team: {
            teamId: OBJECT_ID_TEAM,
            teamName: 'Core Team',
            tmbId: OBJECT_ID_TMB,
            role: 'owner',
            permission: fullPermission
          },
          apiKey: {
            id: OBJECT_ID_KEY,
            name: 'CI Key',
            maskedKey: '******3456',
            authProxy: false,
            limit: {
              expiredTime: null,
              maxUsagePoints: 1000,
              usagePoints: 950,
              remainingPoints: 50
            }
          }
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    };

    const loginRes = await execCli({
      argv: [
        'login',
        '--base-url',
        'https://cloud.fastgpt.in',
        '--api-key-stdin',
        '--profile',
        'ci'
      ],
      configDir,
      stdinText: `${rawKey}\n`,
      fetchFn: mockFetch
    });
    expect(loginRes.exitCode).toBe(0);
    expect(loginRes.stdout).not.toContain(rawKey);
    expect(JSON.parse(loginRes.stdout).data).toMatchObject({
      profile: 'ci',
      authType: 'apikey',
      apiKeyType: 'personal',
      maskedSecret: 'fastgpt-******3456',
      storageMode: 'file'
    });

    const whoamiRes = await execCli({ argv: ['whoami'], configDir, fetchFn: mockFetch });
    expect(whoamiRes.exitCode).toBe(0);
    expect(JSON.parse(whoamiRes.stdout).data).toMatchObject({
      profile: 'ci',
      authType: 'apikey',
      team: { teamName: 'Core Team' },
      apiKey: {
        id: OBJECT_ID_KEY,
        name: 'CI Key',
        maskedKey: '******3456',
        limit: {
          maxUsagePoints: 1000,
          usagePoints: 950,
          remainingPoints: 50
        }
      }
    });

    const doctorRes = await execCli({ argv: ['doctor'], configDir, fetchFn: mockFetch });
    expect(doctorRes.exitCode).toBe(0);
    const doctorJson = JSON.parse(doctorRes.stdout);
    expect(doctorJson.data.ok).toBe(true);
    expect(doctorJson.data.capabilities.credentialKind).toBe('personalKey');

    expect(
      (
        await execCli({
          argv: ['config', 'set', 'baseUrl', 'https://custom.fastgpt.in', '--profile', 'staging'],
          configDir
        })
      ).exitCode
    ).toBe(0);
    expect((await execCli({ argv: ['auth', 'switch', 'staging'], configDir })).exitCode).toBe(0);
    const listRes = await execCli({ argv: ['auth', 'list'], configDir });
    expect(JSON.parse(listRes.stdout).data.currentProfile).toBe('staging');

    const logoutRes = await execCli({ argv: ['logout', '--profile', 'ci', '--purge'], configDir });
    expect(logoutRes.exitCode).toBe(0);
    const credFile = JSON.parse(await readFile(join(configDir, 'credentials.json'), 'utf8'));
    expect(credFile.ci).toBeUndefined();
  });

  it('completes interactive password login with @clack/prompts select + 2FA, switch-team, and logout', async () => {
    const configDir = await makeConfigDir();
    const rawPassword = 'MySecretPassword!1';
    const expectedSha = createHash('sha256').update(rawPassword, 'utf8').digest('hex');
    const seenCaptchaPaths: string[] = [];
    let activeTeamId = OBJECT_ID_TEAM;

    const mockFetch: CliFetchFn = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = input instanceof Request && input.body ? await input.clone().json() : undefined;

      if (url.includes('/support/user/account/preLogin')) {
        return jsonResp({ code: 'pre-123' });
      }
      if (url.endsWith('/support/user/account/loginByPassword')) {
        expect(body.password).toBe(expectedSha);
        expect(body.code).toBe('pre-123');
        return jsonResp({
          status: 'verificationRequired',
          challenge: 'chal-1',
          method: 'code',
          channel: 'email',
          maskedTarget: 'al***@fastgpt.in',
          expiredAt: '2026-11-10T16:00:00.000Z'
        });
      }
      if (url.endsWith('/support/user/account/login/verification/captcha')) {
        return jsonResp({ captchaImage: 'data:image/png;base64,iVBORw0KGgo=' });
      }
      if (url.endsWith('/support/user/account/login/verification/sendCode')) {
        expect(body).toEqual({ challenge: 'chal-1', captcha: 'ABCD' });
        return jsonResp({ message: 'sent' });
      }
      if (url.endsWith('/support/user/account/login/verification/verify')) {
        expect(body).toEqual({ challenge: 'chal-1', code: '654321' });
        return jsonResp({ user: sampleUser, token: `${OBJECT_ID_USER}:tok-2fa` });
      }
      if (url.endsWith('/proApi/support/user/team/switch')) {
        expect(body).toEqual({ teamId: OBJECT_ID_TEAM_2 });
        activeTeamId = OBJECT_ID_TEAM_2;
        return jsonResp(`${OBJECT_ID_USER}:tok-team2`);
      }
      if (url.endsWith('/support/user/account/whoami')) {
        return jsonResp({
          authType: 'token',
          user: {
            userId: OBJECT_ID_USER,
            username: 'alice@fastgpt.in',
            avatar: '/icon/avatar.svg'
          },
          team: {
            teamId: activeTeamId,
            teamName: activeTeamId === OBJECT_ID_TEAM_2 ? 'Team 2' : 'Core Team',
            tmbId: OBJECT_ID_TMB,
            role: 'owner',
            permission: fullPermission
          },
          isRoot: false,
          session: {
            createdAt: Date.now(),
            expiresAt: Date.now() + 7 * 86400 * 1000
          }
        });
      }
      if (url.endsWith('/support/user/account/loginout')) {
        return jsonResp(null);
      }

      throw new Error(`Unexpected URL ${url}`);
    };

    const seenSelects: Array<{ message: string; values: string[] }> = [];
    const loginRes = await execCli({
      argv: ['login', '--format', 'json'],
      configDir,
      isTTY: true,
      fetchFn: mockFetch,
      prompter: createTestPrompter({
        selectQueue: ['__custom__', 'password'],
        textQueue: ['https://cloud.fastgpt.in', 'alice@fastgpt.in', 'ABCD', '654321'],
        secretQueue: [rawPassword],
        onSelect: ({ message, options }) =>
          seenSelects.push({ message, values: options.map((o) => o.value) })
      }),
      openExternal: async (path) => {
        seenCaptchaPaths.push(path);
        expect(existsSync(path)).toBe(true);
        return true;
      }
    });

    expect(seenSelects[0]?.values).toEqual([
      'http://localhost:3000',
      'https://cloud.fastgpt.cn',
      'https://cloud.fastgpt.io',
      '__custom__'
    ]);
    expect(loginRes.exitCode).toBe(0);
    expect(seenCaptchaPaths).toHaveLength(1);
    expect(existsSync(seenCaptchaPaths[0])).toBe(false);
    expect(JSON.parse(loginRes.stdout).data).toMatchObject({
      authType: 'token',
      maskedSecret: '******-2fa'
    });

    // 验证交互登录直接选择预设 Base URL（https://cloud.fastgpt.io）时无需二次文本输入。
    const presetLoginRes = await execCli({
      argv: ['login', '--profile', 'global', '--format', 'json'],
      configDir,
      isTTY: true,
      fetchFn: async (input) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === 'https://cloud.fastgpt.io/api/support/user/account/whoami') {
          return jsonResp({
            authType: 'apikey',
            apiKeyType: 'personal',
            user: { userId: OBJECT_ID_USER, username: 'alice@fastgpt.in' },
            team: {
              teamId: OBJECT_ID_TEAM,
              teamName: 'Core Team',
              tmbId: OBJECT_ID_TMB,
              role: 'owner',
              permission: fullPermission
            },
            apiKey: {
              id: OBJECT_ID_KEY,
              name: 'Global Key',
              maskedKey: '******9999',
              authProxy: false,
              limit: {
                expiredTime: null,
                maxUsagePoints: -1,
                usagePoints: 0,
                remainingPoints: null
              }
            }
          });
        }
        throw new Error(`Unexpected URL ${url}`);
      },
      prompter: createTestPrompter({
        selectQueue: ['https://cloud.fastgpt.io', 'apiKey'],
        secretQueue: ['fastgpt-global-secret-9999']
      })
    });
    expect(presetLoginRes.exitCode).toBe(0);
    expect(JSON.parse(presetLoginRes.stdout).data).toMatchObject({
      profile: 'global',
      baseUrl: 'https://cloud.fastgpt.io/api'
    });
    expect((await execCli({ argv: ['auth', 'switch', 'default'], configDir })).exitCode).toBe(0);

    const whoamiRes = await execCli({
      argv: ['whoami'],
      configDir,
      fetchFn: mockFetch
    });
    expect(whoamiRes.exitCode).toBe(0);
    expect(JSON.parse(whoamiRes.stdout).data.user.avatar).toBe(
      'https://cloud.fastgpt.in/icon/avatar.svg'
    );

    const switchTeamRes = await execCli({
      argv: ['auth', 'switch-team', OBJECT_ID_TEAM_2],
      configDir,
      fetchFn: mockFetch
    });
    expect(switchTeamRes.exitCode).toBe(0);
    expect(JSON.parse(switchTeamRes.stdout).data.team.teamName).toBe('Team 2');

    const logoutRes = await execCli({
      argv: ['auth', 'logout'],
      configDir,
      fetchFn: mockFetch
    });
    expect(logoutRes.exitCode).toBe(0);
    expect(JSON.parse(logoutRes.stdout).data.serverRevoked).toBe(true);
  });

  it('handles non-TTY guards, authModes gate, auth status, config, commands, help, and version', async () => {
    const configDir = await makeConfigDir();

    const missingCreds = await execCli({ argv: ['login'], configDir, isTTY: false });
    expect(missingCreds.exitCode).toBe(2);
    expect(JSON.parse(missingCreds.stderr).error.code).toBe('CLI_ARGUMENT_INVALID');

    // 即便在 TTY 中，显式传入 --format json 且未提供凭据参数时也不得弹出交互菜单。
    const ttyJsonMode = await execCli({
      argv: ['login', '--format', 'json'],
      configDir,
      isTTY: true
    });
    expect(ttyJsonMode.exitCode).toBe(2);
    expect(JSON.parse(ttyJsonMode.stderr).error.code).toBe('CLI_ARGUMENT_INVALID');

    const nonTty2fa = await execCli({
      argv: ['login', '--username', 'alice@fastgpt.in', '--password-stdin'],
      configDir,
      isTTY: false,
      stdinText: 'secret-pass',
      fetchFn: async (input) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.includes('preLogin')) return jsonResp({ code: '123' });
        return jsonResp({
          status: 'verificationRequired',
          challenge: 'c',
          method: 'code',
          channel: 'email',
          maskedTarget: 'a***@fastgpt.in',
          expiredAt: '2026-11-10T16:00:00.000Z'
        });
      }
    });
    expect(nonTty2fa.exitCode).toBe(3);

    const apiKeyPayload = {
      authType: 'apikey',
      apiKeyType: 'personal',
      user: { userId: OBJECT_ID_USER, username: 'alice' },
      team: {
        teamId: OBJECT_ID_TEAM,
        teamName: 'Core',
        tmbId: OBJECT_ID_TMB,
        role: 'owner',
        permission: fullPermission
      },
      apiKey: {
        id: OBJECT_ID_KEY,
        name: 'k',
        maskedKey: '******1234',
        authProxy: false,
        limit: { expiredTime: null, maxUsagePoints: -1, usagePoints: 0, remainingPoints: null }
      }
    };

    await execCli({
      argv: ['login', '--api-key', 'fastgpt-personal-1234'],
      configDir,
      fetchFn: async () => jsonResp(apiKeyPayload)
    });

    let fetchCalled = false;
    const blockedRes = await execCli({
      argv: ['auth', 'switch-team', OBJECT_ID_TEAM_2],
      configDir,
      fetchFn: async () => {
        fetchCalled = true;
        return jsonResp({});
      }
    });
    expect(blockedRes.exitCode).toBe(3);
    expect(fetchCalled).toBe(false);
    expect(JSON.parse(blockedRes.stderr).error.code).toBe('AUTH_MODE_UNSUPPORTED');

    const statusVerify = await execCli({
      argv: ['auth', 'status', '--verify'],
      configDir,
      fetchFn: async () => jsonResp(apiKeyPayload)
    });
    expect(statusVerify.exitCode).toBe(0);
    expect(JSON.parse(statusVerify.stdout).data.verified).toBe(true);

    expect(
      (await execCli({ argv: ['config', 'set', 'allowInsecureHttp', 'true'], configDir })).exitCode
    ).toBe(0);
    const cfgGet = await execCli({ argv: ['config', 'get', 'allowInsecureHttp'], configDir });
    expect(JSON.parse(cfgGet.stdout).data.value).toBe(true);
    const cfgList = await execCli({ argv: ['config', 'list'], configDir });
    expect(JSON.parse(cfgList.stdout).data.currentProfile).toBe('default');

    const helpRes = await execCli({ argv: ['--help'], configDir });
    expect(helpRes.exitCode).toBe(0);
    expect(helpRes.stdout).toContain('Usage: fastgpt');

    const verRes = await execCli({ argv: ['--version'], configDir });
    expect(verRes.exitCode).toBe(0);
    expect(verRes.stdout.trim()).toBe(pkg.version);

    const verJsonRes = await execCli({ argv: ['--version', '--format', 'json'], configDir });
    expect(verJsonRes.exitCode).toBe(0);
    expect(JSON.parse(verJsonRes.stdout).data.version).toBe(pkg.version);

    const cmdsRes = await execCli({ argv: ['commands', '--format', 'json'], configDir });
    expect(cmdsRes.exitCode).toBe(0);
    expect(JSON.parse(cmdsRes.stdout).data.commands.length).toBeGreaterThanOrEqual(11);
  });

  it('does not leak token from options as command name in error envelopes (F1 regression)', async () => {
    const configDir = await makeConfigDir();
    const rawSecret = 'fastgpt-secret-token-abcdef1234567890';

    const res = await execCli({
      argv: ['--token', rawSecret, 'whoami', '--format', 'json'],
      configDir,
      fetchFn: async () => {
        throw new Error('Connection failed');
      }
    });

    expect(res.exitCode).toBe(5);
    const parsedErr = JSON.parse(res.stderr);
    expect(parsedErr.command).toBe('whoami');
    expect(res.stderr).not.toContain(rawSecret);
  });
});
