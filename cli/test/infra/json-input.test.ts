import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { readJsonInput } from '../../src/infra/input/json-input';

describe('readJsonInput', () => {
  it('returns an empty object when no source is selected and rejects conflicting sources', async () => {
    const readStdin = vi.fn();
    expect(await readJsonInput({ cwd: '.', readStdin })).toEqual({});
    await expect(readJsonInput({ cwd: '.', readStdin, stdin: true, file: '-' })).rejects.toThrow(
      'either'
    );
    expect(readStdin).not.toHaveBeenCalled();
  });

  it.each([{ stdin: true }, { file: '-' }])('reads stdin for %j', async (options) => {
    const readStdin = vi.fn().mockResolvedValue('{"messages":[]}');
    expect(await readJsonInput({ cwd: '.', readStdin, ...options })).toEqual({ messages: [] });
    expect(readStdin).toHaveBeenCalledOnce();
  });

  it('resolves files against cwd and reports unreadable files without their contents', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'fastgpt-json-input-'));
    try {
      await writeFile(join(cwd, 'request.json'), '{"variables":{"count":0}}');
      expect(await readJsonInput({ cwd, file: 'request.json', readStdin: vi.fn() })).toEqual({
        variables: { count: 0 }
      });
      await expect(
        readJsonInput({ cwd, file: 'missing.json', readStdin: vi.fn() })
      ).rejects.toThrow('Unable to read');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('reports invalid JSON without echoing user input', async () => {
    await expect(
      readJsonInput({ cwd: '.', stdin: true, readStdin: async () => 'sensitive-invalid-content' })
    ).rejects.toThrow('Request input must contain valid JSON.');
  });
});
