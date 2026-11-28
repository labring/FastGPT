import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run';
import type { CliFetchFn } from '../../src/shared/types';

const RAW_KEY = 'fastgpt-personal-key-1234567890abcdef123456';
const SAMPLE_PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-file-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function execCli({
  argv,
  configDir,
  fetchFn
}: {
  argv: string[];
  configDir: string;
  fetchFn?: CliFetchFn;
}) {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  const exitCode = await runCli({
    argv,
    env: {
      FASTGPT_CONFIG_DIR: configDir,
      FASTGPT_SECRET_STORE: 'file'
    },
    isTTY: false,
    fetchFn,
    stdout: (line) => stdoutLines.push(line),
    stderr: (line) => stderrLines.push(line)
  });

  return {
    exitCode,
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n')
  };
}

describe('File CLI Commands integration (cli/src/cli/commands/file.ts)', () => {
  it('blocks API Key auth locally because presignAvatarPostUrl is token-only', async () => {
    const configDir = await makeTempDir();
    const imgPath = join(configDir, 'bot.png');
    await writeFile(imgPath, SAMPLE_PNG);
    let calls = 0;

    const res = await execCli({
      configDir,
      argv: [
        'file',
        'upload-avatar',
        imgPath,
        '--api-key',
        RAW_KEY,
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async () => {
        calls += 1;
        return new Response('{}');
      }
    });

    expect(res.exitCode).toBe(3);
    expect(calls).toBe(0);
  });

  it('uploads avatar via presign + cross-origin PUT without leaking FastGPT session token', async () => {
    const configDir = await makeTempDir();
    const imgPath = join(configDir, 'bot.png');
    await writeFile(imgPath, SAMPLE_PNG);

    let presignBody: any;
    let putHeaders: Headers | undefined;
    let putMethod: string | undefined;

    const res = await execCli({
      configDir,
      argv: [
        'file',
        'upload-avatar',
        imgPath,
        '--token',
        'session-secret-token',
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async (input, init) => {
        const req = input instanceof Request ? input : new Request(input, init);
        if (req.url.includes('/common/file/presignAvatarPostUrl')) {
          expect(req.headers.get('token')).toBe('session-secret-token');
          presignBody = await req.clone().json();
          return new Response(
            JSON.stringify({
              code: 200,
              data: {
                url: 'https://s3.example.com/public/avatar/team/file/bot.png?X-Amz-Signature=abc',
                key: 'avatar/team/file/bot.png',
                headers: { 'content-type': 'image/png' },
                previewUrl: 'https://cloud.fastgpt.cn/api/system/file/d/preview.png',
                maxSize: 5242880,
                uploadMode: 'single'
              }
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (req.url.startsWith('https://s3.example.com/')) {
          putMethod = req.method;
          putHeaders = req.headers;
          return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected URL: ${req.url}`);
      }
    });

    expect(res.exitCode).toBe(0);
    expect(presignBody).toEqual({
      filename: 'bot.png',
      size: SAMPLE_PNG.byteLength,
      autoExpired: true
    });
    expect(putMethod).toBe('PUT');
    expect(putHeaders?.get('content-type')).toBe('image/png');
    expect(putHeaders?.get('token')).toBeNull();
    expect(putHeaders?.get('authorization')).toBeNull();
    expect(JSON.parse(res.stdout)).toMatchObject({
      ok: true,
      changed: true,
      data: {
        avatar: '/api/system/img/avatar/team/file/bot.png',
        key: 'avatar/team/file/bot.png',
        autoExpired: true
      }
    });
  });
});
