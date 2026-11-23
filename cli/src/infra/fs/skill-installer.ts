import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm, rmdir, stat } from 'node:fs/promises';
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
export const MANAGED_SKILL_FILES = ['SKILL.md', SKILL_METADATA_FILE] as const;

const MANAGED_SKILL_FILE_SET = new Set<string>(MANAGED_SKILL_FILES);

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
  unmanagedEntries: readonly string[];
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
  removedFiles?: readonly string[];
  preservedEntries?: readonly string[];
  directoryPreserved?: boolean;
};

export type SkillInstallPlanAction =
  | 'install'
  | 'update'
  | 'unchanged'
  | 'conflict_modified'
  | 'conflict_unmanaged';

export type SkillInstallPlan = {
  action: SkillInstallPlanAction;
  locallyModified: boolean;
  reason?: string;
};

export type SkillUninstallPlan = {
  exists: boolean;
  allowed: boolean;
  managedFiles: readonly string[];
  preservedEntries: readonly string[];
  locallyModified: boolean;
  reason?: string;
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

/**
 * 基于三方状态（当前磁盘 SKILL.md、上次安装校验和、目标包校验和与版本）判定安装或升级动作。
 * 供 install、update、doctor 与 dry-run 共用同一状态转移规则。
 */
export function evaluateSkillInstallPlan({
  existing,
  targetChecksum,
  cliVersion,
  force = false
}: {
  existing?: InstalledSkillEntry;
  targetChecksum: string;
  cliVersion: string;
  force?: boolean;
}): SkillInstallPlan {
  if (!existing) {
    return { action: 'install', locallyModified: false };
  }

  if (!existing.managed) {
    if (force) {
      return { action: 'update', locallyModified: false };
    }
    return {
      action: 'conflict_unmanaged',
      locallyModified: false,
      reason: `Unmanaged directory "${existing.skillDir}" already exists.`
    };
  }

  const locallyModified =
    !existing.hasSkillMarkdown ||
    (existing.metadata?.checksum !== undefined &&
      existing.currentChecksum !== existing.metadata.checksum);

  if (locallyModified) {
    if (force) {
      return { action: 'update', locallyModified: true };
    }
    return {
      action: 'conflict_modified',
      locallyModified: true,
      reason: `Skill "${existing.name}" at "${existing.skillDir}" has local modifications.`
    };
  }

  const upToDate =
    existing.hasSkillMarkdown &&
    existing.currentChecksum === targetChecksum &&
    existing.metadata?.checksum === targetChecksum &&
    existing.metadata?.cliVersion === cliVersion;

  if (upToDate && !force) {
    return { action: 'unchanged', locallyModified: false };
  }

  return { action: 'update', locallyModified: false };
}

/**
 * 基于受管文件清单判定卸载动作：仅清理 CLI 受管文件，严禁删除用户自建参考文档或脚本。
 */
export function evaluateSkillUninstallPlan({
  existing,
  builtinChecksum
}: {
  existing?: InstalledSkillEntry;
  builtinChecksum?: string;
}): SkillUninstallPlan {
  if (!existing) {
    return {
      exists: false,
      allowed: true,
      managedFiles: [],
      preservedEntries: [],
      locallyModified: false
    };
  }

  const isManagedByCli = existing.metadata?.managedBy === SKILL_MANAGED_BY;
  const matchesBundledWithoutForeignOwner =
    existing.metadata === undefined &&
    !existing.invalidMetadata &&
    builtinChecksum !== undefined &&
    existing.hasSkillMarkdown &&
    existing.currentChecksum === builtinChecksum;

  const locallyModified =
    isManagedByCli &&
    (!existing.hasSkillMarkdown ||
      (existing.metadata?.checksum !== undefined &&
        existing.currentChecksum !== existing.metadata.checksum));

  if (!isManagedByCli && !matchesBundledWithoutForeignOwner) {
    return {
      exists: true,
      allowed: false,
      managedFiles: [],
      preservedEntries: [...existing.unmanagedEntries],
      locallyModified: false,
      reason: `Refusing to remove unmanaged skill directory "${existing.skillDir}".`
    };
  }

  const managedFiles = [
    ...(existing.hasSkillMarkdown ? ['SKILL.md'] : []),
    ...(existing.metadata !== undefined || existing.invalidMetadata ? [SKILL_METADATA_FILE] : [])
  ];

  return {
    exists: true,
    allowed: true,
    managedFiles,
    preservedEntries: [...existing.unmanagedEntries],
    locallyModified
  };
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

  const [dirEntries, markdown, rawMeta] = await Promise.all([
    readdir(skillDir, { withFileTypes: true }),
    readFile(skillMdPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }),
    readFile(metadataPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    })
  ]);

  const unmanagedEntries = dirEntries
    .map((entry) => entry.name)
    .filter((entryName) => !MANAGED_SKILL_FILE_SET.has(entryName))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

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
    ...(parsedMeta.invalid ? { invalidMetadata: true } : {}),
    unmanagedEntries
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
      const plan = evaluateSkillInstallPlan({
        existing,
        targetChecksum: skill.checksum,
        cliVersion,
        force
      });

      if (plan.action === 'unchanged') {
        return {
          name: skill.name,
          status: 'unchanged',
          skillDir,
          checksum: skill.checksum
        };
      }

      if (plan.action === 'conflict_modified' || plan.action === 'conflict_unmanaged') {
        throw new CliArgumentError(
          plan.reason ?? `Skill "${skill.name}" cannot be overwritten without --force.`,
          { skillDir, managed: existing?.managed ?? false, locallyModified: plan.locallyModified },
          'Pass --force to overwrite the existing skill files.'
        );
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
        status: plan.action === 'install' ? 'installed' : 'updated',
        skillDir,
        checksum: skill.checksum
      };
    },

    uninstallSkill: async ({ targetDir, name, builtinChecksum }) => {
      const skillDir = resolveChildSkillDir({ targetDir, name });
      const existing = await inspectSkillDirectory({ skillDir, name });
      const plan = evaluateSkillUninstallPlan({ existing, builtinChecksum });

      if (!plan.exists) {
        return {
          name,
          status: 'not_found',
          skillDir
        };
      }

      // 安全护栏：仅允许删除受管文件清单，保留用户自建的参考文档与脚本，非空目录绝不整目录递归删除。
      if (!plan.allowed) {
        throw new CliArgumentError(
          plan.reason ?? `Refusing to remove unmanaged skill directory "${skillDir}".`,
          { skillDir, managed: existing?.managed ?? false },
          `Only directories managed by ${SKILL_MANAGED_BY} (${SKILL_METADATA_FILE}) or matching a bundled skill can be uninstalled.`
        );
      }

      await Promise.all(
        plan.managedFiles.map((fileName) => rm(join(skillDir, fileName), { force: true }))
      );

      const remainingEntries = (await readdir(skillDir)).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0
      );
      if (remainingEntries.length === 0) {
        await rmdir(skillDir);
      }

      return {
        name,
        status: 'removed',
        skillDir,
        removedFiles: plan.managedFiles,
        preservedEntries: remainingEntries,
        directoryPreserved: remainingEntries.length > 0
      };
    }
  };
}
