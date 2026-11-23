import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { homedir as osHomedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { CliArgumentError } from '../../shared/errors';
import type { CliSkillBundleItem } from '../skills/cli-skill-catalog';

export const SKILL_TARGETS = ['claude', 'codex', 'cursor', 'agents'] as const;
export type SkillTarget = (typeof SKILL_TARGETS)[number];

export const SKILL_SCOPES = ['project', 'user'] as const;
export type SkillScope = (typeof SKILL_SCOPES)[number];

export const SKILL_METADATA_FILE = '.fastgpt-skill.json';
export const SKILL_MANAGED_BY = '@fastgpt/cli';

const InstalledSkillMetadataSchema = z.object({
  managedBy: z.string().min(1),
  name: z.string().min(1),
  cliVersion: z.string().min(1),
  checksum: z.string().min(1),
  installedAt: z.string().min(1)
});

export type InstalledSkillMetadata = z.infer<typeof InstalledSkillMetadataSchema>;

export type InstalledSkillEntry = {
  name: string;
  skillDir: string;
  hasSkillMarkdown: boolean;
  managed: boolean;
  metadata?: InstalledSkillMetadata;
  currentChecksum?: string;
  invalidMetadata?: boolean;
};

export type InstallSkillOutcome = {
  name: string;
  status: 'installed' | 'updated' | 'unchanged';
  skillDir: string;
  checksum: string;
};

export type UninstallSkillOutcome = {
  name: string;
  status: 'removed' | 'not_found';
  skillDir: string;
};

export type SkillInstaller = {
  resolveTargetDir: (params: { target?: string; scope?: string; customDir?: string }) => string;
  listInstalled: (params: { targetDir: string }) => Promise<InstalledSkillEntry[]>;
  installSkill: (params: {
    targetDir: string;
    skill: CliSkillBundleItem;
    cliVersion: string;
    force?: boolean;
  }) => Promise<InstallSkillOutcome>;
  uninstallSkill: (params: {
    targetDir: string;
    name: string;
    builtinChecksum?: string;
  }) => Promise<UninstallSkillOutcome>;
};

const TARGET_DIR_MAP: Record<SkillScope, Record<SkillTarget, readonly string[]>> = {
  project: {
    claude: ['.claude', 'skills'],
    codex: ['.agents', 'skills'],
    cursor: ['.cursor', 'skills'],
    agents: ['.agents', 'skills']
  },
  user: {
    claude: ['.claude', 'skills'],
    codex: ['.codex', 'skills'],
    cursor: ['.cursor', 'skills'],
    agents: ['.agents', 'skills']
  }
};

function assertValidSkillName(name: string): string {
  const trimmed = name.trim();
  if (!/^[a-z0-9-]+$/.test(trimmed)) {
    throw new CliArgumentError(
      `Invalid skill name "${name}". Skill names must match /^[a-z0-9-]+$/.`
    );
  }
  return trimmed;
}

function resolveChildSkillDir({ targetDir, name }: { targetDir: string; name: string }): string {
  const safeName = assertValidSkillName(name);
  const root = resolve(targetDir);
  const child = resolve(root, safeName);
  const rel = relative(root, child);
  if (!rel || rel === '..' || rel.startsWith(`..${'/'}`) || isAbsolute(rel)) {
    throw new CliArgumentError(`Unsafe skill path resolved for "${name}".`);
  }
  return child;
}

function hashSkillMarkdown(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function writeTextAtomic(filePath: string, content: string): Promise<void> {
  const directory = dirname(filePath);
  const temporaryPath = join(
    directory,
    `.${basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  );
  await mkdir(directory, { recursive: true });

  const handle = await open(temporaryPath, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    await rename(temporaryPath, filePath);
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function inspectSkillDirectory({
  skillDir,
  name
}: {
  skillDir: string;
  name: string;
}): Promise<InstalledSkillEntry | undefined> {
  let info;
  try {
    info = await stat(skillDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }

  if (!info.isDirectory()) {
    throw new CliArgumentError(`Skill path "${skillDir}" exists and is not a directory.`);
  }

  const skillMdPath = join(skillDir, 'SKILL.md');
  const metadataPath = join(skillDir, SKILL_METADATA_FILE);

  const markdown = await readFile(skillMdPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });

  const rawMeta = await readFile(metadataPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });

  const parsedMeta = (() => {
    if (rawMeta === undefined) {
      return { metadata: undefined, invalid: false };
    }
    try {
      const json = JSON.parse(rawMeta) as unknown;
      const checked = InstalledSkillMetadataSchema.safeParse(json);
      if (!checked.success) {
        return { metadata: undefined, invalid: true };
      }
      return { metadata: checked.data, invalid: false };
    } catch {
      return { metadata: undefined, invalid: true };
    }
  })();

  return {
    name,
    skillDir,
    hasSkillMarkdown: markdown !== undefined,
    managed: parsedMeta.metadata?.managedBy === SKILL_MANAGED_BY,
    ...(parsedMeta.metadata !== undefined ? { metadata: parsedMeta.metadata } : {}),
    ...(markdown !== undefined ? { currentChecksum: hashSkillMarkdown(markdown) } : {}),
    ...(parsedMeta.invalid ? { invalidMetadata: true } : {})
  };
}

/**
 * 创建基于本地文件系统的 Agent Skill 安装适配器，负责路径解析、原子写入与受管目录安全卸载。
 */
export function createNodeSkillInstaller({
  cwd,
  homedir = osHomedir()
}: {
  cwd: string;
  homedir?: string;
}): SkillInstaller {
  return {
    resolveTargetDir: ({ target, scope, customDir }) => {
      if (customDir !== undefined) {
        const trimmed = customDir.trim();
        if (!trimmed) {
          throw new CliArgumentError('--dir cannot be empty.');
        }
        if (trimmed === '~') {
          return resolve(homedir);
        }
        if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
          return resolve(homedir, trimmed.slice(2));
        }
        return resolve(cwd, trimmed);
      }

      const resolvedTarget = (target ?? 'agents').trim();
      if (!SKILL_TARGETS.includes(resolvedTarget as SkillTarget)) {
        throw new CliArgumentError(
          `Invalid --target "${resolvedTarget}".`,
          undefined,
          `Choose one of: ${SKILL_TARGETS.join(', ')}`
        );
      }

      const resolvedScope = (scope ?? 'project').trim();
      if (!SKILL_SCOPES.includes(resolvedScope as SkillScope)) {
        throw new CliArgumentError(
          `Invalid --scope "${resolvedScope}".`,
          undefined,
          `Choose one of: ${SKILL_SCOPES.join(', ')}`
        );
      }

      const baseDir = resolvedScope === 'user' ? homedir : cwd;
      const segments = TARGET_DIR_MAP[resolvedScope as SkillScope][resolvedTarget as SkillTarget];
      return resolve(baseDir, ...segments);
    },

    listInstalled: async ({ targetDir }) => {
      let entries;
      try {
        entries = await readdir(targetDir, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw error;
      }

      const directories = entries
        .filter((entry) => entry.isDirectory() && /^[a-z0-9-]+$/.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

      const inspected = await Promise.all(
        directories.map((name) =>
          inspectSkillDirectory({
            skillDir: resolveChildSkillDir({ targetDir, name }),
            name
          })
        )
      );

      return inspected.filter((item): item is InstalledSkillEntry => item !== undefined);
    },

    installSkill: async ({ targetDir, skill, cliVersion, force = false }) => {
      const skillDir = resolveChildSkillDir({ targetDir, name: skill.name });
      const existing = await inspectSkillDirectory({ skillDir, name: skill.name });

      if (existing) {
        const upToDate =
          existing.managed &&
          existing.hasSkillMarkdown &&
          existing.currentChecksum === skill.checksum &&
          existing.metadata?.checksum === skill.checksum &&
          existing.metadata?.cliVersion === cliVersion;

        if (upToDate && !force) {
          return {
            name: skill.name,
            status: 'unchanged',
            skillDir,
            checksum: skill.checksum
          };
        }

        // 未声明 --force 时，仅当已安装内容仍与目标内置包完全一致（可补充版本元数据）或完全未修改时才允许继续；
        // 遇到未受管目录或本地已修改的 SKILL.md 必须拒绝覆盖，防止误删用户自定义技能。
        const canSkipForce =
          existing.managed &&
          existing.hasSkillMarkdown &&
          existing.currentChecksum === skill.checksum;

        if (!force && !canSkipForce) {
          const reason = existing.managed
            ? `Skill "${skill.name}" already exists at "${skillDir}" with different content.`
            : `Unmanaged directory "${skillDir}" already exists.`;
          throw new CliArgumentError(
            reason,
            { skillDir, managed: existing.managed },
            'Pass --force to overwrite the existing skill directory.'
          );
        }
      }

      const metadata: InstalledSkillMetadata = {
        managedBy: SKILL_MANAGED_BY,
        name: skill.name,
        cliVersion,
        checksum: skill.checksum,
        installedAt: new Date().toISOString()
      };

      await mkdir(skillDir, { recursive: true });
      await writeTextAtomic(join(skillDir, 'SKILL.md'), skill.markdown);
      await writeTextAtomic(
        join(skillDir, SKILL_METADATA_FILE),
        `${JSON.stringify(metadata, null, 2)}\n`
      );

      return {
        name: skill.name,
        status: existing ? 'updated' : 'installed',
        skillDir,
        checksum: skill.checksum
      };
    },

    uninstallSkill: async ({ targetDir, name, builtinChecksum }) => {
      const skillDir = resolveChildSkillDir({ targetDir, name });
      const existing = await inspectSkillDirectory({ skillDir, name });
      if (!existing) {
        return {
          name,
          status: 'not_found',
          skillDir
        };
      }

      const isManagedByCli = existing.metadata?.managedBy === SKILL_MANAGED_BY;
      const matchesBundledWithoutForeignOwner =
        existing.metadata === undefined &&
        !existing.invalidMetadata &&
        builtinChecksum !== undefined &&
        existing.hasSkillMarkdown &&
        existing.currentChecksum === builtinChecksum;

      // 安全护栏：仅允许删除带有 @fastgpt/cli 管理标记或内容与内置包完全一致的目录，严禁误删用户自建 Skill。
      if (!isManagedByCli && !matchesBundledWithoutForeignOwner) {
        throw new CliArgumentError(
          `Refusing to remove unmanaged skill directory "${skillDir}".`,
          { skillDir, managed: existing.managed },
          `Only directories managed by ${SKILL_MANAGED_BY} (${SKILL_METADATA_FILE}) or matching a bundled skill can be uninstalled.`
        );
      }

      await rm(skillDir, { recursive: true, force: true });
      return {
        name,
        status: 'removed',
        skillDir
      };
    }
  };
}
