import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSkillsService } from '../../src/domain/skills/skills-service';
import {
  createNodeSkillInstaller,
  SKILL_MANAGED_BY,
  SKILL_METADATA_FILE
} from '../../src/infra/fs/skill-installer';
import {
  parseSkillFrontmatter,
  readCliSkillsSource,
  type CliSkillBundleItem
} from '../../src/infra/skills/cli-skill-catalog';
import { createNonTtyPrompter, type Prompter } from '../../src/infra/ui/prompter';
import { CliArgumentError } from '../../src/shared/errors';

const tempDirs: string[] = [];

async function makeTempDir(prefix = 'fastgpt-skills-domain-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('CLI bundled skills catalog & installer', () => {
  it('reads the 5 official bundled skills sorted by name with valid frontmatter and SHA-256 checksums', async () => {
    const skills = await readCliSkillsSource();
    expect(skills.map((item) => item.name)).toEqual([
      'fastgpt-app',
      'fastgpt-chat',
      'fastgpt-cli',
      'fastgpt-knowledge',
      'fastgpt-workflow'
    ]);

    for (const skill of skills) {
      expect(skill.description.length).toBeGreaterThan(10);
      expect(skill.checksum).toBe(
        createHash('sha256').update(skill.markdown, 'utf8').digest('hex')
      );
      expect(parseSkillFrontmatter({ markdown: skill.markdown, expectedName: skill.name })).toEqual(
        {
          name: skill.name,
          description: skill.description
        }
      );
    }
  });

  it('resolves project, user, and custom target directories accurately', () => {
    const installer = createNodeSkillInstaller({
      cwd: '/workspace/project',
      homedir: '/Users/tester'
    });

    expect(installer.resolveTargetDir({ target: 'claude', scope: 'project' })).toBe(
      '/workspace/project/.claude/skills'
    );
    expect(installer.resolveTargetDir({ target: 'codex', scope: 'project' })).toBe(
      '/workspace/project/.agents/skills'
    );
    expect(installer.resolveTargetDir({ target: 'cursor', scope: 'project' })).toBe(
      '/workspace/project/.cursor/skills'
    );
    expect(installer.resolveTargetDir({ target: 'agents', scope: 'project' })).toBe(
      '/workspace/project/.agents/skills'
    );

    expect(installer.resolveTargetDir({ target: 'claude', scope: 'user' })).toBe(
      '/Users/tester/.claude/skills'
    );
    expect(installer.resolveTargetDir({ target: 'codex', scope: 'user' })).toBe(
      '/Users/tester/.codex/skills'
    );
    expect(installer.resolveTargetDir({ target: 'cursor', scope: 'user' })).toBe(
      '/Users/tester/.cursor/skills'
    );
    expect(installer.resolveTargetDir({ target: 'agents', scope: 'user' })).toBe(
      '/Users/tester/.agents/skills'
    );

    expect(installer.resolveTargetDir({ customDir: './custom-skills' })).toBe(
      '/workspace/project/custom-skills'
    );
    expect(installer.resolveTargetDir({ customDir: '~/my-skills' })).toBe(
      '/Users/tester/my-skills'
    );

    expect(() => installer.resolveTargetDir({ target: 'unknown' })).toThrow(CliArgumentError);
    expect(() => installer.resolveTargetDir({ scope: 'global' })).toThrow(CliArgumentError);
    expect(() => installer.resolveTargetDir({ customDir: '   ' })).toThrow(CliArgumentError);
  });

  it('enforces overwrite protection on install and safety guard on uninstall', async () => {
    const root = await makeTempDir();
    const targetDir = join(root, 'skills');
    const installer = createNodeSkillInstaller({ cwd: root, homedir: root });

    const sampleMarkdown = '---\nname: fastgpt-cli\ndescription: Core CLI skill\n---\n\n# Core\n';
    const sampleSkill: CliSkillBundleItem = {
      name: 'fastgpt-cli',
      description: 'Core CLI skill',
      markdown: sampleMarkdown,
      checksum: createHash('sha256').update(sampleMarkdown, 'utf8').digest('hex')
    };

    const first = await installer.installSkill({
      targetDir,
      skill: sampleSkill,
      cliVersion: '0.1.0-beta.5'
    });
    expect(first.status).toBe('installed');

    const second = await installer.installSkill({
      targetDir,
      skill: sampleSkill,
      cliVersion: '0.1.0-beta.5'
    });
    expect(second.status).toBe('unchanged');

    const meta = JSON.parse(
      await readFile(join(targetDir, 'fastgpt-cli', SKILL_METADATA_FILE), 'utf8')
    );
    expect(meta.managedBy).toBe(SKILL_MANAGED_BY);
    expect(meta.checksum).toBe(sampleSkill.checksum);

    // 本地篡改后不传 --force 拒绝覆盖，传 --force 才允许更新。
    await writeFile(join(targetDir, 'fastgpt-cli', 'SKILL.md'), '# modified\n', 'utf8');
    await expect(
      installer.installSkill({ targetDir, skill: sampleSkill, cliVersion: '0.1.0-beta.5' })
    ).rejects.toBeInstanceOf(CliArgumentError);

    const forced = await installer.installSkill({
      targetDir,
      skill: sampleSkill,
      cliVersion: '0.1.0-beta.5',
      force: true
    });
    expect(forced.status).toBe('updated');

    // 未受管且内容不匹配的目录严禁卸载删除。
    const unmanagedDir = join(targetDir, 'custom-skill');
    await mkdir(unmanagedDir, { recursive: true });
    await writeFile(join(unmanagedDir, 'SKILL.md'), '# user owned\n', 'utf8');
    await expect(
      installer.uninstallSkill({ targetDir, name: 'custom-skill' })
    ).rejects.toBeInstanceOf(CliArgumentError);
    expect((await stat(unmanagedDir)).isDirectory()).toBe(true);

    // 无元数据但内容与内置包完全一致的目录允许卸载。
    const copiedDir = join(targetDir, 'copied-bundled');
    await mkdir(copiedDir, { recursive: true });
    await writeFile(join(copiedDir, 'SKILL.md'), sampleMarkdown, 'utf8');
    const removedCopied = await installer.uninstallSkill({
      targetDir,
      name: 'copied-bundled',
      builtinChecksum: sampleSkill.checksum
    });
    expect(removedCopied.status).toBe('removed');

    // 含非法路径字符的名称必须被拒绝。
    await expect(
      installer.uninstallSkill({ targetDir, name: '../outside' })
    ).rejects.toBeInstanceOf(CliArgumentError);
  });

  it('orchestrates catalog, install, doctor, update, and uninstall cleanly in domain service', async () => {
    const root = await makeTempDir();
    const targetDir = join(root, '.agents', 'skills');
    const installer = createNodeSkillInstaller({ cwd: root, homedir: root });
    const bundled = await readCliSkillsSource();

    const confirmMock = vi.fn(async () => true);
    const interactivePrompter: Prompter = {
      ...createNonTtyPrompter(),
      isInteractive: true,
      confirm: confirmMock
    };

    const service = createSkillsService({
      loadSkills: async () => bundled,
      installer,
      prompter: interactivePrompter,
      cliVersion: '0.1.0-beta.5'
    });

    const catalogRes = await service.catalog();
    expect(catalogRes.changed).toBe(false);
    expect((catalogRes.data as { skills: unknown[] }).skills).toHaveLength(5);

    const initialDoctor = await service.doctor({ customDir: targetDir });
    expect((initialDoctor.data as { healthy: boolean }).healthy).toBe(false);
    expect((initialDoctor.data as { summary: { missing: number } }).summary.missing).toBe(5);

    const installRes = await service.install({ customDir: targetDir, all: true });
    expect(installRes.changed).toBe(true);

    const healthyDoctor = await service.doctor({ customDir: targetDir });
    expect((healthyDoctor.data as { healthy: boolean }).healthy).toBe(true);

    // 在目录中放入一个不受管技能后，update 应跳过并附带警告，uninstall --all 应保留不受管技能。
    await mkdir(join(targetDir, 'user-custom'), { recursive: true });
    await writeFile(join(targetDir, 'user-custom', 'SKILL.md'), '# keep me\n', 'utf8');

    // 将 fastgpt-cli 的元数据改为旧版本以模拟升级场景。
    const metaPath = join(targetDir, 'fastgpt-cli', SKILL_METADATA_FILE);
    const oldMeta = JSON.parse(await readFile(metaPath, 'utf8'));
    await writeFile(metaPath, JSON.stringify({ ...oldMeta, cliVersion: '0.1.0-beta.1' }), 'utf8');

    const updateRes = await service.update({ customDir: targetDir });
    expect(updateRes.changed).toBe(true);
    expect((updateRes.meta as { updated: number }).updated).toBe(1);

    const uninstallRes = await service.uninstall({
      customDir: targetDir,
      all: true,
      format: 'text'
    });
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(uninstallRes.changed).toBe(true);
    expect((uninstallRes.meta as { removed: number }).removed).toBe(5);
    expect(await readFile(join(targetDir, 'user-custom', 'SKILL.md'), 'utf8')).toBe('# keep me\n');
  });
});
