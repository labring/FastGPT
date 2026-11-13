import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { executeCommandWithPipeline, type CliCommandSpec } from '../../src/cli/pipeline';
import { CliArgumentError } from '../../src/shared/errors';
import { createSuccessResult } from '../../src/shared/result';
import type { CliContainer } from '../../src/cli/container';
import type { Prompter } from '../../src/infra/ui/prompter';

function createMockContainer(isInteractive = false): CliContainer {
  const dummyPrompter: Prompter = {
    isInteractive,
    text: async () => '',
    secret: async () => '',
    confirm: async () => false,
    select: async <T extends string>() => '' as T,
    note: () => {},
    spinner: () => ({ start: () => {}, stop: () => {} })
  };

  return {
    env: {},
    configRepo: {
      getConfigDir: () => '/tmp',
      getConfigPath: () => '/tmp/config.json',
      read: async () => ({
        configPath: '/tmp/config.json',
        config: { schemaVersion: 1, currentProfile: 'default', profiles: {} },
        warnings: []
      }),
      write: async () => '/tmp/config.json'
    },
    secretStore: {
      getBackendName: async () => 'file',
      getSecret: async () => undefined,
      setSecret: async () => ({ backend: 'file' }),
      deleteSecret: async () => {}
    },
    prompter: dummyPrompter,
    fileIo: {} as any,
    readStdin: async () => '',
    fetchFn: globalThis.fetch,
    createHttpClient: () => ({}) as any,
    authService: {} as any,
    profileService: {} as any,
    doctorService: {} as any,
    datasetService: {} as any,
    datasetCollectionService: {} as any,
    datasetDataService: {} as any,
    stdout: () => {},
    stderr: () => {}
  };
}

describe('Pipeline Middleware Guards (src/cli/pipeline.ts)', () => {
  it('blocks destructive command in non-interactive/JSON mode when --yes is missing', async () => {
    const destructiveSpec: CliCommandSpec = {
      path: ['test', 'purge'],
      summary: 'Purge test resources',
      risk: 'destructive',
      authModes: ['none'],
      options: [],
      execute: async () => createSuccessResult({ data: { purged: true } })
    };

    const container = createMockContainer(false);

    await expect(
      executeCommandWithPipeline({
        spec: destructiveSpec,
        rawOptions: { format: 'json' },
        positional: [],
        defaultFormat: 'json',
        defaultColor: false,
        container,
        commandMetas: [],
        stdout: () => {}
      })
    ).rejects.toMatchObject({
      code: 'CLI_ARGUMENT_INVALID',
      exitCode: 2,
      hint: 'Pass --yes to confirm execution.'
    });
  });

  it('allows destructive command when --yes is supplied', async () => {
    let executed = false;
    const destructiveSpec: CliCommandSpec = {
      path: ['test', 'purge'],
      summary: 'Purge test resources',
      risk: 'destructive',
      authModes: ['none'],
      options: [],
      execute: async () => {
        executed = true;
        return createSuccessResult({ data: { purged: true } });
      }
    };

    const container = createMockContainer(false);
    const stdoutLines: string[] = [];

    await executeCommandWithPipeline({
      spec: destructiveSpec,
      rawOptions: { yes: true, format: 'json' },
      positional: [],
      defaultFormat: 'json',
      defaultColor: false,
      container,
      commandMetas: [],
      stdout: (line) => stdoutLines.push(line)
    });

    expect(executed).toBe(true);
    expect(stdoutLines.length).toBe(1);
    const parsed = JSON.parse(stdoutLines[0]);
    expect(parsed.ok).toBe(true);
    expect(parsed.meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('validates inputSchema and maps ZodError to CliArgumentError', async () => {
    const schemaSpec: CliCommandSpec = {
      path: ['test', 'validated'],
      summary: 'Schema validated command',
      risk: 'read',
      authModes: ['none'],
      options: [],
      inputSchema: z.object({
        count: z.number().int().positive()
      }),
      execute: async ({ options }) => createSuccessResult({ data: options })
    };

    const container = createMockContainer(false);

    await expect(
      executeCommandWithPipeline({
        spec: schemaSpec,
        rawOptions: { count: -1 },
        positional: [],
        defaultFormat: 'json',
        defaultColor: false,
        container,
        commandMetas: [],
        stdout: () => {}
      })
    ).rejects.toBeInstanceOf(CliArgumentError);
  });
});
