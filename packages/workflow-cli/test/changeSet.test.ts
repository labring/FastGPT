import { runCli } from '../src';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const createHarness = async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'workflow-cli-changeset-'));
  const dir = join(cwd, 'workflow');
  const invoke = async ({
    args,
    stdin = '',
    isTTY = false,
    requestConfirmation
  }: {
    args: string[];
    stdin?: string;
    isTTY?: boolean;
    requestConfirmation?: (targetChecksum: string) => Promise<boolean>;
  }) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCli({
      argv: [...args, '--dir', dir, '--format', 'json'],
      cwd,
      env: { NODE_ENV: 'test' },
      isTTY,
      stdin: async () => stdin,
      requestConfirmation,
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value)
    });
    return {
      exitCode,
      stdout: stdout[0] ? JSON.parse(stdout[0]) : undefined,
      stderr: stderr[0] ? JSON.parse(stderr[0]) : undefined
    };
  };
  await invoke({ args: ['init', '--name', 'Initial'] });
  return { cwd, dir, invoke };
};

const createChangeSet = ({ baseChecksum, name }: { baseChecksum: string; name: string }) => ({
  schemaVersion: 'fastgpt-workflow-changeset/v1',
  baseChecksum,
  commands: [{ type: 'meta.update', name }]
});

const inspect = async (invoke: Awaited<ReturnType<typeof createHarness>>['invoke']) =>
  invoke({ args: ['inspect'] });

const plan = async ({
  invoke,
  baseChecksum,
  name,
  output
}: {
  invoke: Awaited<ReturnType<typeof createHarness>>['invoke'];
  baseChecksum: string;
  name: string;
  output?: string;
}) =>
  invoke({
    args: ['changeset', 'plan', '--input', '-', ...(output ? ['--output', output] : [])],
    stdin: JSON.stringify(createChangeSet({ baseChecksum, name }))
  });

describe('PR4 ChangeSet CLI', () => {
  it('plans through stdin, supports an optional file, and applies only after checksum confirmation', async () => {
    const { cwd, dir, invoke } = await createHarness();
    const before = await readFile(join(dir, 'workflow.json'), 'utf8');
    const baseChecksum = (await inspect(invoke)).stdout.checksum as string;
    const planned = await plan({
      invoke,
      baseChecksum,
      name: 'Applied',
      output: 'workflow.plan.json'
    });
    expect(planned.exitCode).toBe(0);
    expect(planned.stdout).toMatchObject({
      command: 'changeset plan',
      changed: false,
      result: {
        schemaVersion: 'fastgpt-workflow-plan/v1',
        baseChecksum,
        targetChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
      },
      audit: {
        command: 'changeset plan',
        baseChecksum,
        result: 'success'
      }
    });
    expect(JSON.parse(await readFile(join(cwd, 'workflow.plan.json'), 'utf8'))).toEqual(
      planned.stdout.result
    );
    expect(await readFile(join(dir, 'workflow.json'), 'utf8')).toBe(before);

    const dryRun = await invoke({
      args: ['changeset', 'apply', '--plan', '-', '--dry-run'],
      stdin: JSON.stringify(planned.stdout.result)
    });
    expect(dryRun.exitCode).toBe(0);
    expect(dryRun.stdout.result.dryRun).toBe(true);
    expect(await readFile(join(dir, 'workflow.json'), 'utf8')).toBe(before);

    const missingConfirm = await invoke({
      args: ['changeset', 'apply', '--plan', '-'],
      stdin: JSON.stringify(planned.stdout.result)
    });
    expect(missingConfirm).toMatchObject({
      exitCode: 2,
      stderr: { errors: [{ code: 'CLI_CONFIRM_REQUIRED' }] }
    });
    expect(await readFile(join(dir, 'workflow.json'), 'utf8')).toBe(before);

    const wrongConfirm = await invoke({
      args: ['changeset', 'apply', '--plan', '-', '--confirm', `sha256:${'0'.repeat(64)}`],
      stdin: JSON.stringify(planned.stdout.result)
    });
    expect(wrongConfirm).toMatchObject({
      exitCode: 2,
      stderr: { errors: [{ code: 'CLI_CONFIRM_CHECKSUM_MISMATCH' }] }
    });
    expect(await readFile(join(dir, 'workflow.json'), 'utf8')).toBe(before);

    const applied = await invoke({
      args: [
        'changeset',
        'apply',
        '--plan',
        '-',
        '--confirm',
        planned.stdout.result.targetChecksum
      ],
      stdin: JSON.stringify(planned.stdout.result)
    });
    expect(applied.exitCode).toBe(0);
    expect(applied.stdout).toMatchObject({
      changed: true,
      checksum: planned.stdout.result.targetChecksum,
      result: { dryRun: false },
      audit: { command: 'changeset apply', result: 'success' }
    });
    expect((await inspect(invoke)).stdout.result.app.name).toBe('Applied');
  });

  it('invalidates an old plan after a manual mutation', async () => {
    const { dir, invoke } = await createHarness();
    const baseChecksum = (await inspect(invoke)).stdout.checksum as string;
    const planned = await plan({ invoke, baseChecksum, name: 'Automated' });
    await invoke({ args: ['meta', 'set', '--name', 'Manual'] });
    const manuallyChanged = await readFile(join(dir, 'workflow.json'), 'utf8');

    const result = await invoke({
      args: [
        'changeset',
        'apply',
        '--plan',
        '-',
        '--confirm',
        planned.stdout.result.targetChecksum
      ],
      stdin: JSON.stringify(planned.stdout.result)
    });
    expect(result).toMatchObject({
      exitCode: 3,
      stderr: {
        errors: [
          {
            diagnostics: [expect.objectContaining({ code: 'WORKFLOW_BASE_CHECKSUM_MISMATCH' })]
          }
        ]
      }
    });
    expect(await readFile(join(dir, 'workflow.json'), 'utf8')).toBe(manuallyChanged);
  });

  it('rejects a plan whose review summary was tampered with', async () => {
    const { dir, invoke } = await createHarness();
    const baseChecksum = (await inspect(invoke)).stdout.checksum as string;
    const planned = await plan({ invoke, baseChecksum, name: 'Hidden change' });
    const before = await readFile(join(dir, 'workflow.json'), 'utf8');
    planned.stdout.result.changes = [];
    const result = await invoke({
      args: [
        'changeset',
        'apply',
        '--plan',
        '-',
        '--confirm',
        planned.stdout.result.targetChecksum
      ],
      stdin: JSON.stringify(planned.stdout.result)
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderr.errors[0].diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WORKFLOW_PLAN_CONTENT_MISMATCH' })])
    );
    expect(await readFile(join(dir, 'workflow.json'), 'utf8')).toBe(before);
  });

  it('prompts only in TTY mode and preserves the file when confirmation is rejected', async () => {
    const { dir, invoke } = await createHarness();
    const baseChecksum = (await inspect(invoke)).stdout.checksum as string;
    const planned = await plan({ invoke, baseChecksum, name: 'TTY applied' });
    const before = await readFile(join(dir, 'workflow.json'), 'utf8');
    let promptedChecksum = '';

    const rejected = await invoke({
      args: ['changeset', 'apply', '--plan', '-'],
      stdin: JSON.stringify(planned.stdout.result),
      isTTY: true,
      requestConfirmation: async (targetChecksum) => {
        promptedChecksum = targetChecksum;
        return false;
      }
    });
    expect(promptedChecksum).toBe(planned.stdout.result.targetChecksum);
    expect(rejected).toMatchObject({
      exitCode: 2,
      stderr: { errors: [{ code: 'CLI_CONFIRM_REJECTED' }] }
    });
    expect(await readFile(join(dir, 'workflow.json'), 'utf8')).toBe(before);

    const accepted = await invoke({
      args: ['changeset', 'apply', '--plan', '-'],
      stdin: JSON.stringify(planned.stdout.result),
      isTTY: true,
      requestConfirmation: async () => true
    });
    expect(accepted.exitCode).toBe(0);
    expect((await inspect(invoke)).stdout.result.app.name).toBe('TTY applied');
  });

  it('rechecks the base checksum after an interactive confirmation', async () => {
    const { dir, invoke } = await createHarness();
    const baseChecksum = (await inspect(invoke)).stdout.checksum as string;
    const planned = await plan({ invoke, baseChecksum, name: 'Must not overwrite' });
    const result = await invoke({
      args: ['changeset', 'apply', '--plan', '-'],
      stdin: JSON.stringify(planned.stdout.result),
      isTTY: true,
      requestConfirmation: async () => {
        expect(
          (await invoke({ args: ['meta', 'set', '--name', 'Concurrent edit'] })).exitCode
        ).toBe(0);
        return true;
      }
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderr.errors[0].diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WORKFLOW_BASE_CHECKSUM_MISMATCH' })])
    );
    expect(JSON.parse(await readFile(join(dir, 'workflow.json'), 'utf8')).app.name).toBe(
      'Concurrent edit'
    );
  });

  it('rejects malformed stdin and validation failures without writing', async () => {
    const { dir, invoke } = await createHarness();
    expect(await invoke({ args: ['changeset', 'plan', '--input', '-'], stdin: '{' })).toMatchObject(
      { exitCode: 2 }
    );

    const before = await readFile(join(dir, 'workflow.json'), 'utf8');
    const baseChecksum = (await inspect(invoke)).stdout.checksum as string;
    const invalidChangeSet = {
      schemaVersion: 'fastgpt-workflow-changeset/v1',
      baseChecksum,
      commands: [
        {
          type: 'node.add',
          nodeId: 'unreachable-answer',
          template: { kind: 'builtin', templateId: 'assigned-answer' }
        }
      ]
    };
    const planned = await invoke({
      args: ['changeset', 'plan', '--input', '-'],
      stdin: JSON.stringify(invalidChangeSet)
    });
    expect(planned.exitCode).toBe(0);
    expect(planned.stdout.result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: 'error' })])
    );
    const applied = await invoke({
      args: [
        'changeset',
        'apply',
        '--plan',
        '-',
        '--confirm',
        planned.stdout.result.targetChecksum
      ],
      stdin: JSON.stringify(planned.stdout.result)
    });
    expect(applied.exitCode).toBe(4);
    expect(await readFile(join(dir, 'workflow.json'), 'utf8')).toBe(before);
  });
});
