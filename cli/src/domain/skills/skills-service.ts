import {
  evaluateSkillInstallPlan,
  evaluateSkillUninstallPlan,
  type InstallSkillOutcome,
  type InstalledSkillEntry,
  type SkillInstaller,
  type UninstallSkillOutcome
} from '../../infra/fs/skill-installer';
import type { CliSkillBundleItem } from '../../infra/skills/cli-skill-catalog';
import type { Prompter } from '../../infra/ui/prompter';
import { CliArgumentError } from '../../shared/errors';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliFormat, CliResult } from '../../shared/types';

export type SkillsServiceDeps = {
  loadSkills: () => Promise<readonly CliSkillBundleItem[]>;
  installer: SkillInstaller;
  prompter: Prompter;
  cliVersion: string;
};

export type SkillsTargetInput = {
  target?: string;
  scope?: string;
  customDir?: string;
};

export type SkillUpdateOutcome =
  | InstallSkillOutcome
  | {
      name: string;
      status: 'skipped_modified';
      skillDir: string;
      checksum?: string;
    };

export type SkillsService = {
  catalog: () => Promise<CliResult>;
  install: (
    params: SkillsTargetInput & {
      names?: readonly string[];
      all?: boolean;
      force?: boolean;
      dryRun?: boolean;
    }
  ) => Promise<CliResult>;
  uninstall: (
    params: SkillsTargetInput & {
      names?: readonly string[];
      all?: boolean;
      yes?: boolean;
      dryRun?: boolean;
      format?: CliFormat;
    }
  ) => Promise<CliResult>;
  update: (
    params: SkillsTargetInput & {
      force?: boolean;
      dryRun?: boolean;
    }
  ) => Promise<CliResult>;
  doctor: (params: SkillsTargetInput) => Promise<CliResult>;
};

function dedupeNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function resolveTargetLabels({ target, scope, customDir }: SkillsTargetInput): {
  target: string;
  scope: string;
} {
  if (customDir !== undefined) {
    return { target: 'custom', scope: 'custom' };
  }
  return {
    target: (target ?? 'agents').trim(),
    scope: (scope ?? 'project').trim()
  };
}

function selectBundledSkills({
  bundled,
  names,
  all
}: {
  bundled: readonly CliSkillBundleItem[];
  names?: readonly string[];
  all?: boolean;
}): CliSkillBundleItem[] {
  const requested = dedupeNames(names ?? []);
  if (all === true && requested.length > 0) {
    throw new CliArgumentError('Provide either skill names or --all, not both.');
  }
  if (requested.length === 0) {
    return [...bundled];
  }

  const byName = new Map(bundled.map((skill) => [skill.name, skill]));
  const selected: CliSkillBundleItem[] = [];
  for (const name of requested) {
    const skill = byName.get(name);
    if (!skill) {
      throw new CliArgumentError(
        `Unknown bundled skill "${name}".`,
        { availableSkills: bundled.map((item) => item.name) },
        `Available skills: ${bundled.map((item) => item.name).join(', ')}`
      );
    }
    selected.push(skill);
  }
  return selected;
}

/**
 * 构建内置 Agent Skill 管理领域服务：支持目录查询、多目标安装/更新/健康检查与受管卸载。
 */
export function createSkillsService({
  loadSkills,
  installer,
  prompter,
  cliVersion
}: SkillsServiceDeps): SkillsService {
  return {
    catalog: async () => {
      const skills = await loadSkills();
      return createSuccessResult({
        data: {
          cliVersion,
          skills: skills.map((skill) => ({
            name: skill.name,
            description: skill.description,
            checksum: skill.checksum
          }))
        },
        meta: { total: skills.length }
      });
    },

    install: async ({ names, all, target, scope, customDir, force = false, dryRun = false }) => {
      const targetDir = installer.resolveTargetDir({ target, scope, customDir });
      const labels = resolveTargetLabels({ target, scope, customDir });
      const bundled = await loadSkills();
      const selected = selectBundledSkills({ bundled, names, all });
      const existingList = await installer.listInstalled({ targetDir });
      const existingByName = new Map<string, InstalledSkillEntry>(
        existingList.map((entry) => [entry.name, entry])
      );

      if (dryRun) {
        const previewSkills = selected.map((skill) => {
          const existing = existingByName.get(skill.name);
          const plan = evaluateSkillInstallPlan({
            existing,
            targetChecksum: skill.checksum,
            cliVersion,
            force
          });
          const action =
            plan.action === 'conflict_modified' || plan.action === 'conflict_unmanaged'
              ? 'conflict'
              : plan.action;
          return {
            name: skill.name,
            action,
            locallyModified: plan.locallyModified,
            ...(plan.reason ? { reason: plan.reason } : {}),
            checksum: skill.checksum
          };
        });

        return createDryRunResult({
          operation: 'skills install',
          risk: 'write',
          preview: {
            targetDir,
            target: labels.target,
            scope: labels.scope,
            force,
            skills: previewSkills
          }
        });
      }

      // 在写入任何文件前先整体预检冲突，避免批量安装时因中途失败留下半成品状态。
      if (!force) {
        for (const skill of selected) {
          const existing = existingByName.get(skill.name);
          const plan = evaluateSkillInstallPlan({
            existing,
            targetChecksum: skill.checksum,
            cliVersion,
            force
          });
          if (plan.action === 'conflict_modified' || plan.action === 'conflict_unmanaged') {
            throw new CliArgumentError(
              plan.reason ?? `Skill "${skill.name}" cannot be overwritten without --force.`,
              {
                skillDir: existing?.skillDir,
                managed: existing?.managed ?? false,
                locallyModified: plan.locallyModified
              },
              'Pass --force to overwrite the existing skill files.'
            );
          }
        }
      }

      const results: InstallSkillOutcome[] = [];
      for (const skill of selected) {
        const outcome = await installer.installSkill({
          targetDir,
          skill,
          cliVersion,
          force
        });
        results.push(outcome);
      }

      const changed = results.some(
        (item) => item.status === 'installed' || item.status === 'updated'
      );
      const installedCount = results.filter((item) => item.status === 'installed').length;
      const updatedCount = results.filter((item) => item.status === 'updated').length;
      const unchangedCount = results.filter((item) => item.status === 'unchanged').length;
      const data = {
        targetDir,
        target: labels.target,
        scope: labels.scope,
        cliVersion,
        results
      };
      const meta = {
        total: results.length,
        installed: installedCount,
        updated: updatedCount,
        unchanged: unchangedCount
      };
      const message = changed
        ? `Installed ${installedCount} and updated ${updatedCount} skill(s) in ${targetDir}.`
        : `All ${unchangedCount} selected skill(s) are already up to date in ${targetDir}.`;

      return changed
        ? createChangedResult({ data, meta, message })
        : createSuccessResult({ data, meta, message });
    },

    uninstall: async ({
      names,
      all = false,
      target,
      scope,
      customDir,
      yes = false,
      dryRun = false,
      format = 'text'
    }) => {
      const requested = dedupeNames(names ?? []);
      if (all && requested.length > 0) {
        throw new CliArgumentError('Provide either skill names or --all, not both.');
      }
      if (!all && requested.length === 0) {
        throw new CliArgumentError(
          'Specify skill names or pass --all to uninstall.',
          undefined,
          'Usage: fastgpt skills uninstall fastgpt-cli --yes or fastgpt skills uninstall --all --yes'
        );
      }

      const targetDir = installer.resolveTargetDir({ target, scope, customDir });
      const labels = resolveTargetLabels({ target, scope, customDir });
      const bundled = await loadSkills();
      const bundledByName = new Map(bundled.map((skill) => [skill.name, skill]));

      const installed = await installer.listInstalled({ targetDir });
      const installedByName = new Map(installed.map((entry) => [entry.name, entry]));

      const targetNames = ((): string[] => {
        if (!all) {
          return requested;
        }
        return installed
          .filter(
            (entry) =>
              evaluateSkillUninstallPlan({
                existing: entry,
                builtinChecksum: bundledByName.get(entry.name)?.checksum
              }).allowed
          )
          .map((entry) => entry.name);
      })();

      if (dryRun) {
        const previewSkills = targetNames.map((name) => {
          const entry = installedByName.get(name);
          const plan = evaluateSkillUninstallPlan({
            existing: entry,
            builtinChecksum: bundledByName.get(name)?.checksum
          });
          return {
            name,
            action: !plan.exists ? 'not_found' : plan.allowed ? 'remove' : 'blocked',
            managedFiles: plan.managedFiles,
            preservedEntries: plan.preservedEntries,
            locallyModified: plan.locallyModified,
            ...(plan.reason ? { reason: plan.reason } : {})
          };
        });

        return createDryRunResult({
          operation: 'skills uninstall',
          risk: 'destructive',
          preview: {
            targetDir,
            target: labels.target,
            scope: labels.scope,
            names: targetNames,
            skills: previewSkills
          }
        });
      }

      if (targetNames.length === 0) {
        return createSuccessResult({
          data: {
            targetDir,
            target: labels.target,
            scope: labels.scope,
            results: []
          },
          meta: { total: 0, removed: 0 },
          message: `No managed FastGPT skills found in ${targetDir}.`
        });
      }

      const isNonInteractive = !prompter.isInteractive || format === 'json';
      if (isNonInteractive && !yes) {
        throw new CliArgumentError(
          'Destructive command "skills uninstall" requires explicit confirmation in non-interactive / JSON mode.',
          undefined,
          'Pass --yes to confirm execution.'
        );
      }
      if (!isNonInteractive && !yes) {
        const confirmed = await prompter.confirm({
          message: `Uninstall ${targetNames.length} skill(s) (${targetNames.join(', ')}) from "${targetDir}"?`,
          initialValue: false
        });
        if (!confirmed) {
          throw new CliArgumentError('Skill uninstall cancelled.');
        }
      }

      const results: UninstallSkillOutcome[] = [];
      const warnings: string[] = [];
      for (const name of targetNames) {
        const outcome = await installer.uninstallSkill({
          targetDir,
          name,
          builtinChecksum: bundledByName.get(name)?.checksum
        });
        results.push(outcome);
        if (outcome.preservedEntries && outcome.preservedEntries.length > 0) {
          warnings.push(
            `Preserved unmanaged file(s) in "${outcome.skillDir}": ${outcome.preservedEntries.join(', ')}.`
          );
        }
      }

      const removedCount = results.filter((item) => item.status === 'removed').length;
      const changed = removedCount > 0;
      const data = {
        targetDir,
        target: labels.target,
        scope: labels.scope,
        results
      };
      const meta = {
        total: results.length,
        removed: removedCount,
        notFound: results.length - removedCount
      };
      const message = changed
        ? `Removed ${removedCount} skill(s) from ${targetDir}.`
        : `No matching skills found in ${targetDir}.`;

      return changed
        ? createChangedResult({
            data,
            meta,
            message,
            ...(warnings.length > 0 ? { warnings } : {})
          })
        : createSuccessResult({
            data,
            meta,
            message,
            ...(warnings.length > 0 ? { warnings } : {})
          });
    },

    update: async ({ target, scope, customDir, force = false, dryRun = false }) => {
      const targetDir = installer.resolveTargetDir({ target, scope, customDir });
      const labels = resolveTargetLabels({ target, scope, customDir });
      const bundled = await loadSkills();
      const bundledByName = new Map(bundled.map((skill) => [skill.name, skill]));
      const installed = await installer.listInstalled({ targetDir });
      const warnings: string[] = [];

      const managedCandidates: { entry: InstalledSkillEntry; skill: CliSkillBundleItem }[] = [];
      for (const entry of installed) {
        const skill = bundledByName.get(entry.name);
        if (!skill) {
          if (entry.managed) {
            warnings.push(
              `Managed skill "${entry.name}" is no longer in the bundled catalog and was left untouched.`
            );
          }
          continue;
        }
        if (!entry.managed) {
          warnings.push(
            `Skipped unmanaged skill "${entry.name}" (run "fastgpt skills install ${entry.name} --force" to overwrite).`
          );
          continue;
        }
        managedCandidates.push({ entry, skill });
      }

      if (dryRun) {
        const previewSkills = managedCandidates.map(({ entry, skill }) => {
          const plan = evaluateSkillInstallPlan({
            existing: entry,
            targetChecksum: skill.checksum,
            cliVersion,
            force
          });
          const action = plan.action === 'conflict_modified' ? 'skip_modified' : plan.action;
          if (action === 'skip_modified') {
            warnings.push(
              `Skipped locally modified skill "${skill.name}" (pass --force to overwrite local edits).`
            );
          }
          return {
            name: skill.name,
            action,
            locallyModified: plan.locallyModified,
            fromVersion: entry.metadata?.cliVersion,
            toVersion: cliVersion,
            checksum: skill.checksum
          };
        });

        return createDryRunResult({
          operation: 'skills update',
          risk: 'write',
          preview: {
            targetDir,
            target: labels.target,
            scope: labels.scope,
            force,
            skills: previewSkills
          },
          ...(warnings.length > 0 ? { warnings } : {})
        });
      }

      const results: SkillUpdateOutcome[] = [];
      for (const { entry, skill } of managedCandidates) {
        const plan = evaluateSkillInstallPlan({
          existing: entry,
          targetChecksum: skill.checksum,
          cliVersion,
          force
        });
        if (plan.action === 'unchanged') {
          results.push({
            name: skill.name,
            status: 'unchanged',
            skillDir: entry.skillDir,
            checksum: skill.checksum
          });
          continue;
        }
        if (plan.action === 'conflict_modified') {
          warnings.push(
            `Skipped locally modified skill "${skill.name}" (pass --force to overwrite local edits).`
          );
          results.push({
            name: skill.name,
            status: 'skipped_modified',
            skillDir: entry.skillDir,
            ...(entry.currentChecksum ? { checksum: entry.currentChecksum } : {})
          });
          continue;
        }

        const updated = await installer.installSkill({
          targetDir,
          skill,
          cliVersion,
          force
        });
        results.push(updated);
      }

      const updatedCount = results.filter((item) => item.status === 'updated').length;
      const unchangedCount = results.filter((item) => item.status === 'unchanged').length;
      const skippedModifiedCount = results.filter(
        (item) => item.status === 'skipped_modified'
      ).length;
      const changed = updatedCount > 0;
      const data = {
        targetDir,
        target: labels.target,
        scope: labels.scope,
        cliVersion,
        force,
        results
      };
      const meta = {
        total: results.length,
        updated: updatedCount,
        unchanged: unchangedCount,
        skippedModified: skippedModifiedCount
      };
      const message =
        results.length === 0
          ? `No managed FastGPT skills installed in ${targetDir}.`
          : changed
            ? `Updated ${updatedCount} skill(s) in ${targetDir}.`
            : skippedModifiedCount > 0
              ? `Kept ${skippedModifiedCount} locally modified skill(s) untouched and ${unchangedCount} up to date in ${targetDir}.`
              : `All ${unchangedCount} installed FastGPT skill(s) are up to date in ${targetDir}.`;

      return changed
        ? createChangedResult({
            data,
            meta,
            message,
            ...(warnings.length > 0 ? { warnings } : {})
          })
        : createSuccessResult({
            data,
            meta,
            message,
            ...(warnings.length > 0 ? { warnings } : {})
          });
    },

    doctor: async ({ target, scope, customDir }) => {
      const targetDir = installer.resolveTargetDir({ target, scope, customDir });
      const labels = resolveTargetLabels({ target, scope, customDir });
      const bundled = await loadSkills();
      const installed = await installer.listInstalled({ targetDir });
      const installedByName = new Map(installed.map((entry) => [entry.name, entry]));

      const skills = bundled.map((skill) => {
        const entry = installedByName.get(skill.name);
        if (!entry) {
          return {
            name: skill.name,
            status: 'missing' as const,
            bundledChecksum: skill.checksum
          };
        }
        if (!entry.managed) {
          return {
            name: skill.name,
            status: 'unmanaged' as const,
            skillDir: entry.skillDir,
            bundledChecksum: skill.checksum,
            ...(entry.currentChecksum ? { installedChecksum: entry.currentChecksum } : {}),
            matchesBundled: entry.currentChecksum === skill.checksum,
            ...(entry.unmanagedEntries.length > 0
              ? { unmanagedEntries: entry.unmanagedEntries }
              : {})
          };
        }

        const plan = evaluateSkillInstallPlan({
          existing: entry,
          targetChecksum: skill.checksum,
          cliVersion,
          force: false
        });

        if (plan.action === 'unchanged') {
          return {
            name: skill.name,
            status: 'ok' as const,
            skillDir: entry.skillDir,
            cliVersion: entry.metadata?.cliVersion,
            checksum: skill.checksum,
            ...(entry.unmanagedEntries.length > 0
              ? { unmanagedEntries: entry.unmanagedEntries }
              : {})
          };
        }

        return {
          name: skill.name,
          status: 'outdated' as const,
          skillDir: entry.skillDir,
          installedVersion: entry.metadata?.cliVersion,
          bundledVersion: cliVersion,
          ...(entry.currentChecksum ? { installedChecksum: entry.currentChecksum } : {}),
          bundledChecksum: skill.checksum,
          locallyModified: plan.locallyModified,
          ...(entry.unmanagedEntries.length > 0 ? { unmanagedEntries: entry.unmanagedEntries } : {})
        };
      });

      const okCount = skills.filter((item) => item.status === 'ok').length;
      const outdatedCount = skills.filter((item) => item.status === 'outdated').length;
      const missingCount = skills.filter((item) => item.status === 'missing').length;
      const unmanagedCount = skills.filter((item) => item.status === 'unmanaged').length;
      const healthy = outdatedCount === 0 && missingCount === 0 && unmanagedCount === 0;

      return createSuccessResult({
        data: {
          targetDir,
          target: labels.target,
          scope: labels.scope,
          cliVersion,
          healthy,
          summary: {
            totalBundled: bundled.length,
            ok: okCount,
            outdated: outdatedCount,
            missing: missingCount,
            unmanaged: unmanagedCount
          },
          skills
        },
        message: healthy
          ? `All ${okCount} bundled skills are installed and up to date in ${targetDir}.`
          : `Skill check in ${targetDir}: ${okCount} ok, ${outdatedCount} outdated, ${missingCount} missing, ${unmanagedCount} unmanaged.`
      });
    }
  };
}
