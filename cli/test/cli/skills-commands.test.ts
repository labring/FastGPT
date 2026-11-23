import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/run';
import { SKILL_METADATA_FILE } from '../../src/infra/fs/skill-installer';
import { createNonTtyPrompter, type Prompter } from '../../src/infra/ui/prompter';

const tempDirs: string[] = [];

async function makeTempDir(prefix = 'fastgpt-skills-cli-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function execCli({
  argv,
  cwd,
  env = {},
  isTTY = false,
  prompter
}: {
  argv: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
  prompter?: Prompter;
}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const fetchFn = vi.fn();
  const exitCode = await runCli({
    argv,
    cwd,
    env: { FASTGPT_CONFIG_DIR: cwd, FASTGPT_SECRET_STORE: 'file', ...env },
    isTTY,
    fetchFn,
    prompter,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line)
  });
  return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n'), fetchFn };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('skills CLI commands', () => {
  it('lists 5 official bundled skills via skills catalog without auth or network', async () => {
    const cwd = await makeTempDir();
    const res = await execCli({ argv: ['skills', 'catalog', '--format', 'json'], cwd });

    expect(res.exitCode).toBe(0);
    expect(res.fetchFn).not.toHaveBeenCalled();
    const parsed = JSON.parse(res.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe('skills catalog');
    expect(parsed.changed).toBe(false);
    expect(parsed.meta.total).toBe(5);
    expect(parsed.data.skills.map((item: { name: string }) => item.name)).toEqual([
      'fastgpt-app',
      'fastgpt-chat',
      'fastgpt-cli',
      'fastgpt-knowledge',
      'fastgpt-workflow'
    ]);
  });

  it('installs skills to --dir, enforces --force on overwrite, checks doctor, and updates stale skills', async () => {
    const cwd = await makeTempDir();
    const targetDir = join(cwd, 'custom-skills');

    const dryInstall = await execCli({
      argv: ['skills', 'install', '--dir', targetDir, '--dry-run', '--format', 'json'],
      cwd
    });
    expect(dryInstall.exitCode).toBe(0);
    const dryJson = JSON.parse(dryInstall.stdout);
    expect(dryJson.changed).toBe(false);
    expect(dryJson.data.dryRun).toBe(true);
    expect(dryJson.data.skills).toHaveLength(5);

    const installRes = await execCli({
      argv: [
        'skills',
        'install',
        'fastgpt-cli,fastgpt-app',
        '--dir',
        targetDir,
        '--format',
        'json'
      ],
      cwd
    });
    expect(installRes.exitCode).toBe(0);
    const installJson = JSON.parse(installRes.stdout);
    expect(installJson.changed).toBe(true);
    expect(installJson.meta.installed).toBe(2);

    const installedMd = await readFile(join(targetDir, 'fastgpt-cli', 'SKILL.md'), 'utf8');
    expect(installedMd).toContain('name: fastgpt-cli');

    // 本地修改后不传 --force 应被拒绝（exit code 2），传 --force 后覆盖恢复。
    await writeFile(join(targetDir, 'fastgpt-cli', 'SKILL.md'), '# locally edited\n', 'utf8');
    const conflictRes = await execCli({
      argv: ['skills', 'install', 'fastgpt-cli', '--dir', targetDir, '--format', 'json'],
      cwd
    });
    expect(conflictRes.exitCode).toBe(2);
    expect(JSON.parse(conflictRes.stderr).error.hint).toContain('--force');

    const doctorOutdated = await execCli({
      argv: ['skills', 'doctor', '--dir', targetDir, '--format', 'json'],
      cwd
    });
    expect(doctorOutdated.exitCode).toBe(0);
    const doctorOutdatedJson = JSON.parse(doctorOutdated.stdout);
    expect(doctorOutdatedJson.data.healthy).toBe(false);
    expect(doctorOutdatedJson.data.summary).toMatchObject({
      totalBundled: 5,
      ok: 1,
      outdated: 1,
      missing: 3,
      unmanaged: 0
    });

    // update 自动修复受管技能到最新版本。
    const updateRes = await execCli({
      argv: ['skills', 'update', '--dir', targetDir, '--format', 'json'],
      cwd
    });
    expect(updateRes.exitCode).toBe(0);
    expect(JSON.parse(updateRes.stdout).changed).toBe(true);
    expect(await readFile(join(targetDir, 'fastgpt-cli', 'SKILL.md'), 'utf8')).toContain(
      'name: fastgpt-cli'
    );

    const forceRes = await execCli({
      argv: ['skills', 'install', 'fastgpt-cli', '--dir', targetDir, '--force', '--format', 'json'],
      cwd
    });
    expect(forceRes.exitCode).toBe(0);
    expect(JSON.parse(forceRes.stdout).data.results[0].status).toBe('updated');
  });

  it('resolves --target and --scope presets when --dir is omitted', async () => {
    const cwd = await makeTempDir();
    const fakeHome = await makeTempDir('fastgpt-skills-home-');

    const projectClaude = await execCli({
      argv: [
        'skills',
        'install',
        'fastgpt-cli',
        '--target',
        'claude',
        '--scope',
        'project',
        '--dry-run',
        '--format',
        'json'
      ],
      cwd,
      env: { HOME: fakeHome }
    });
    expect(projectClaude.exitCode).toBe(0);
    expect(JSON.parse(projectClaude.stdout).data.targetDir).toBe(join(cwd, '.claude', 'skills'));

    const userCodex = await execCli({
      argv: [
        'skills',
        'install',
        'fastgpt-cli',
        '--target',
        'codex',
        '--scope',
        'user',
        '--dry-run',
        '--format',
        'json'
      ],
      cwd,
      env: { HOME: fakeHome }
    });
    expect(userCodex.exitCode).toBe(0);
    expect(JSON.parse(userCodex.stdout).data.targetDir).toBe(join(fakeHome, '.codex', 'skills'));
  });

  it('enforces non-TTY --yes gate, TTY confirmation, and unmanaged directory safety guard on uninstall', async () => {
    const cwd = await makeTempDir();
    const targetDir = join(cwd, '.agents', 'skills');

    await execCli({
      argv: ['skills', 'install', 'fastgpt-cli', '--dir', targetDir, '--format', 'json'],
      cwd
    });

    // 非 TTY 缺少 --yes 必须在管线门禁阶段拦截返回退出码 2。
    const blocked = await execCli({
      argv: ['skills', 'uninstall', 'fastgpt-cli', '--dir', targetDir, '--format', 'json'],
      cwd,
      isTTY: false
    });
    expect(blocked.exitCode).toBe(2);
    expect(JSON.parse(blocked.stderr).error.hint).toContain('--yes');
    expect((await stat(join(targetDir, 'fastgpt-cli', SKILL_METADATA_FILE))).isFile()).toBe(true);

    // 交互式 TTY 下用户拒绝确认时必须中止且保留文件。
    const cancelPrompter: Prompter = {
      ...createNonTtyPrompter(),
      isInteractive: true,
      confirm: vi.fn(async () => false)
    };
    const cancelled = await execCli({
      argv: ['skills', 'uninstall', 'fastgpt-cli', '--dir', targetDir],
      cwd,
      isTTY: true,
      prompter: cancelPrompter
    });
    expect(cancelled.exitCode).toBe(2);
    expect((await stat(join(targetDir, 'fastgpt-cli', 'SKILL.md'))).isFile()).toBe(true);

    // 传入 --yes 后成功移除受管技能目录。
    const removed = await execCli({
      argv: ['skills', 'uninstall', 'fastgpt-cli', '--dir', targetDir, '--yes', '--format', 'json'],
      cwd
    });
    expect(removed.exitCode).toBe(0);
    expect(JSON.parse(removed.stdout).changed).toBe(true);
    await expect(stat(join(targetDir, 'fastgpt-cli'))).rejects.toMatchObject({ code: 'ENOENT' });

    // 未受管目录即使传入 --yes 也必须拒绝删除并保留原内容。
    const unmanagedDir = join(targetDir, 'fastgpt-cli');
    await mkdir(unmanagedDir, { recursive: true });
    await writeFile(join(unmanagedDir, 'SKILL.md'), '# unmanaged custom skill\n', 'utf8');
    const refused = await execCli({
      argv: ['skills', 'uninstall', 'fastgpt-cli', '--dir', targetDir, '--yes', '--format', 'json'],
      cwd
    });
    expect(refused.exitCode).toBe(2);
    expect(await readFile(join(unmanagedDir, 'SKILL.md'), 'utf8')).toBe(
      '# unmanaged custom skill\n'
    );
  });
});
