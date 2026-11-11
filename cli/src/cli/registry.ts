import type { CommandMeta } from '../shared/types';
import { createAuthCommandSpecs } from './commands/auth';
import { createCommandsManifestCommandSpec } from './commands/commands';
import { createConfigCommandSpecs } from './commands/config';
import { createDoctorCommandSpec } from './commands/doctor';
import { createLoginCommandSpec } from './commands/login';
import { createLogoutCommandSpec } from './commands/logout';
import { createWhoamiCommandSpec } from './commands/whoami';
import type { CliCommandSpec } from './pipeline';

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
