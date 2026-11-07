import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../src/run';

const id = '507f1f77bcf86cd799439011';
const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

const run = async (argv: string[], options: Partial<Parameters<typeof runCli>[0]> = {}) => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const code = await runCli({
    argv,
    env: { FASTGPT_BASE_URL: 'https://fastgpt.invalid/api', FASTGPT_API_KEY: 'test-key' },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({ code: 200, data: { list: [], total: 0 } });
    },
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
    ...options
  });
  return { code, stdout, stderr, calls };
};

describe('CLI SDK integration', () => {
  it('provides help and version without credentials', async () => {
    const help = await run(['--help'], { env: {} });
    expect(help.code).toBe(0);
    expect(help.stdout[0]).toContain('dataset collection upload');
    expect(help.calls).toHaveLength(0);
    expect((await run(['--version'], { env: {} })).stdout).toEqual(['0.1.0']);
    expect((await run(['dataset', 'search', '--help'])).stdout[0]).toContain('datasets.search');
  });

  it('uses API Key auth and emits a single machine-readable result', async () => {
    const result = await run(['dataset', 'list', '--page-size', '5']);
    expect(result.code).toBe(0);
    expect(result.calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    expect(JSON.parse(result.calls[0].init?.body as string)).toMatchObject({ pageSize: 5 });
    expect(result.stdout).toHaveLength(1);
    expect(JSON.parse(result.stdout[0])).toEqual({ list: [], total: 0 });
    expect(result.stderr).toEqual([]);
  });

  it('reads structured input from stdin and from files', async () => {
    const result = await run(['dataset', 'search', '--input', '-'], {
      stdin: async () => JSON.stringify({ scope: { datasetIds: [id] }, query: { text: 'test' } })
    });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.calls[0].init?.body as string)).toHaveProperty('query.text', 'test');
    const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-'));
    folders.push(dir);
    await writeFile(join(dir, 'params.json'), JSON.stringify({ id }));
    expect((await run(['dataset', 'get', '--input', 'params.json'], { cwd: dir })).code).toBe(0);
  });

  it('uploads files through the SDK multipart contract', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-'));
    folders.push(dir);
    await writeFile(join(dir, '手册.txt'), '内容');
    const result = await run(
      ['dataset', 'collection', 'upload', '--dataset-id', id, '--file', '手册.txt'],
      { cwd: dir }
    );
    expect(result.code).toBe(0);
    const form = result.calls[0].init?.body as FormData;
    expect(JSON.parse(form.get('data') as string)).toHaveProperty('datasetId', id);
    expect(await (form.get('file') as Blob).text()).toBe('内容');
  });

  it('saves downloads and refuses to overwrite an existing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-'));
    folders.push(dir);
    const argv = [
      'dataset',
      'collection',
      'download',
      '--ticket',
      'ticket',
      '--output',
      'data.csv'
    ];
    const fetch: typeof globalThis.fetch = async () =>
      new Response('q,a\nhello,world', { headers: { 'Content-Type': 'text/csv' } });
    expect((await run(argv, { cwd: dir, fetch })).code).toBe(0);
    expect(await readFile(join(dir, 'data.csv'), 'utf8')).toContain('hello,world');
    expect((await run(argv, { cwd: dir, fetch })).code).toBe(1);
  });

  it('waits for the imported collection using the SDK lifecycle', async () => {
    const urls: string[] = [];
    const result = await run(
      [
        'dataset',
        'collection',
        'import-text',
        '--dataset-id',
        id,
        '--name',
        'Intro',
        '--text',
        'content',
        '--wait'
      ],
      {
        fetch: async (url) => {
          urls.push(String(url));
          return Response.json({
            code: 200,
            data:
              urls.length === 1
                ? { collectionId: id }
                : {
                    activeTrainingAmount: 0,
                    finalErrorAmount: 0,
                    indexAmount: 1
                  }
          });
        }
      }
    );
    expect(result.code).toBe(0);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain(`id=${id}`);
    expect(JSON.parse(result.stdout[0])).toMatchObject({
      collectionId: id,
      training: { indexAmount: 1 }
    });
  });

  it('removes partial downloads when the response stream fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-'));
    folders.push(dir);
    const fetch: typeof globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('partial'));
          },
          pull(controller) {
            controller.error(new Error('download interrupted'));
          }
        }),
        { headers: { 'Content-Type': 'text/csv' } }
      );
    expect(
      (
        await run(
          ['dataset', 'collection', 'download', '--ticket', 'ticket', '--output', 'partial.csv'],
          {
            cwd: dir,
            fetch
          }
        )
      ).code
    ).toBe(1);
    await expect(readFile(join(dir, 'partial.csv'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    ['dataset', 'unknown'],
    ['dataset', 'list', '--typo', 'x'],
    ['dataset', 'list', '--format', 'yaml'],
    ['dataset', 'list', '--page-size', 'bad'],
    ['dataset', 'list', '--params', '{invalid'],
    ['dataset', 'list', '--input', '-', '--params', '{}'],
    ['dataset', 'list', '--timeout', '0'],
    [
      'dataset',
      'collection',
      'import-text',
      '--dataset-id',
      id,
      '--name',
      'Intro',
      '--text',
      'content',
      '--wait',
      '--poll-interval',
      '2147483648'
    ],
    ['dataset', 'list', '--base-url', 'x', '--base-url', 'y'],
    ['dataset', 'delete', '--id', id, '--wait'],
    ['dataset', 'collection', 'download', '--ticket', 'ticket'],
    ['dataset', 'list', '--output', 'unexpected.json'],
    ['dataset', 'list', '--wait=maybe'],
    ['dataset', 'collection', 'upload', '--dataset-id', id]
  ])('reports usage errors before contacting the server: %j', async (...argv) => {
    const result = await run(argv);
    expect(result.code).toBe(2);
    expect(result.calls).toHaveLength(0);
    expect(result.stdout).toEqual([]);
    expect(JSON.parse(result.stderr[0])).toHaveProperty('error.message');
  });

  it('reports missing credentials and preserves service diagnostics without exposing the key', async () => {
    expect((await run(['dataset', 'list'], { env: {} })).code).toBe(2);
    const result = await run(['dataset', 'list'], {
      fetch: async () =>
        Response.json(
          { code: 401, message: 'Key test-key expired' },
          { status: 401, headers: { 'x-request-id': 'req-1' } }
        )
    });
    expect(result.code).toBe(1);
    expect(result.stderr[0]).not.toContain('test-key');
    expect(JSON.parse(result.stderr[0])).toHaveProperty('error.requestId', 'req-1');
  });

  it('honors explicit boolean wait flags without adding a second operation', async () => {
    expect((await run(['dataset', 'list', '--wait=false'])).calls).toHaveLength(1);
    expect((await run(['dataset', 'list', '--no-wait'])).calls).toHaveLength(1);
  });
});
