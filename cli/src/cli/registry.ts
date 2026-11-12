import type { CliAuthModeRequirement, CliRiskLevel, CommandMeta } from '../shared/types';
import { createAuthCommandSpecs } from './commands/auth';
import { createCommandsManifestCommandSpec } from './commands/commands';
import { createConfigCommandSpecs } from './commands/config';
import { createDatasetCommandSpecs } from './commands/dataset';
import { createDoctorCommandSpec } from './commands/doctor';
import { createLoginCommandSpec } from './commands/login';
import { createLogoutCommandSpec } from './commands/logout';
import { createWhoamiCommandSpec } from './commands/whoami';
import type { CliCommandSpec } from './pipeline';

export type CommandRegistry = {
  getAllSpecs: () => readonly CliCommandSpec[];
  getMetas: () => readonly CommandMeta[];
  findByPath: (path: readonly string[]) => CliCommandSpec | undefined;
  filterByRisk: (risks: readonly CliRiskLevel[]) => readonly CliCommandSpec[];
  filterByAuthMode: (mode: CliAuthModeRequirement) => readonly CliCommandSpec[];
};

/**
 * 汇总全部 CLI 命令规范；作为 Commander 命令树、帮助文档与 `commands --json` 的单一事实源。
 */
export function getCliCommandSpecs(): CliCommandSpec[] {
  return [
    createLoginCommandSpec(),
    createLogoutCommandSpec(),
    createWhoamiCommandSpec(),
    ...createAuthCommandSpecs(),
    ...createConfigCommandSpecs(),
    ...createDatasetCommandSpecs(),
    createDoctorCommandSpec(),
    createCommandsManifestCommandSpec()
  ];
}

export function buildCommandMetas(specs: readonly CliCommandSpec[]): CommandMeta[] {
  return specs.map((spec) => ({
    command: spec.path.join(' '),
    path: spec.path,
    aliases: spec.aliases ?? [],
    summary: spec.summary,
    risk: spec.risk,
    authModes: spec.authModes,
    positionalArgs: spec.positionalArgs ?? [],
    options: spec.options,
    examples: spec.examples ?? []
  }));
}

/**
 * 创建高阶命令注册表：支持按路径精确查找、按风险级别过滤（如为 MCP serve 只读沙盒提供支持）、按认证要求检索。
 */
export function createCommandRegistry(
  specs: readonly CliCommandSpec[] = getCliCommandSpecs()
): CommandRegistry {
  const specList = [...specs];
  const metas = buildCommandMetas(specList);
  const byCommand = new Map<string, CliCommandSpec>();
  for (const s of specList) {
    byCommand.set(s.path.join(' '), s);
  }

  return {
    getAllSpecs: () => specList,
    getMetas: () => metas,
    findByPath: (path) => byCommand.get(path.join(' ')),
    filterByRisk: (risks) => specList.filter((s) => risks.includes(s.risk)),
    filterByAuthMode: (mode) => specList.filter((s) => s.authModes.includes(mode))
  };
}
