import { CliArgumentError } from '../../shared/errors';
import { getCliVersion, type CliRiskLevel, type CommandMeta } from '../../shared/types';
import type { CliCommandSpec } from '../pipeline';

function buildUsageSignature(meta: CommandMeta): string {
  const pos = meta.positionalArgs
    .map((p) => (p.required ? `<${p.name}>` : `[${p.name}]`))
    .join(' ');
  const flags = meta.options.map((o) => o.flags.split(',')[0].trim()).join(' ');
  return [`fastgpt ${meta.command}`, pos, flags].filter(Boolean).join(' ');
}

export function createCommandsManifestCommandSpec(): CliCommandSpec {
  return {
    path: ['commands'],
    summary: 'List registered CLI commands and their metadata for agent discovery',
    risk: 'read',
    authModes: ['none'],
    options: [
      {
        name: 'compact',
        flags: '--compact',
        takesValue: false,
        description:
          'Output compact summaries ({ command, summary, risk, authModes, usage }) to save context tokens'
      },
      {
        name: 'command',
        flags: '--command <name>',
        takesValue: true,
        description: 'Return full metadata and examples for one exact command (e.g. "dataset list")'
      },
      {
        name: 'domain',
        flags: '--domain <domain>',
        takesValue: true,
        description: 'Filter commands by domain prefix (e.g. dataset, "dataset collection", auth)'
      },
      {
        name: 'risk',
        flags: '--risk <level>',
        takesValue: true,
        description: 'Filter commands by risk level: read, write, destructive, or admin'
      }
    ],
    examples: [
      {
        description: 'Compact discovery (recommended for AI Agents, ~90% smaller)',
        args: ['commands', '--compact', '--format', 'json']
      },
      {
        description: 'Inspect full options & examples for a single command',
        args: ['commands', '--command', 'dataset collection create-file', '--format', 'json']
      },
      {
        description: 'Filter compact manifest by nested domain',
        args: ['commands', '--domain', 'dataset collection', '--compact', '--format', 'json']
      }
    ],
    execute: async ({ options, commandMetas }) => {
      const cliVersion = getCliVersion();
      const targetCommand =
        typeof options.command === 'string' && options.command.trim().length > 0
          ? options.command.trim().replace(/\s+/g, ' ').toLowerCase()
          : undefined;

      if (targetCommand) {
        const matched = commandMetas.find((meta) => meta.command.toLowerCase() === targetCommand);
        if (!matched) {
          const suggestions = commandMetas
            .filter((meta) => meta.command.toLowerCase().includes(targetCommand))
            .slice(0, 5)
            .map((meta) => meta.command);
          const hint =
            suggestions.length > 0
              ? `Did you mean: ${suggestions.join(', ')}? Or run "fastgpt commands --compact --format json".`
              : 'Run "fastgpt commands --compact --format json" to list all available commands.';
          throw new CliArgumentError(`Unknown command "${targetCommand}".`, undefined, hint);
        }

        return {
          changed: false,
          data: {
            cliVersion,
            command: matched
          }
        };
      }

      const domainFilter =
        typeof options.domain === 'string' && options.domain.trim().length > 0
          ? options.domain.trim().replace(/\s+/g, ' ').toLowerCase()
          : undefined;
      const riskFilter =
        typeof options.risk === 'string' && options.risk.trim().length > 0
          ? (options.risk.trim().toLowerCase() as CliRiskLevel)
          : undefined;

      const filtered = commandMetas.filter((meta) => {
        if (domainFilter) {
          const cmdLower = meta.command.toLowerCase();
          if (cmdLower !== domainFilter && !cmdLower.startsWith(`${domainFilter} `)) {
            return false;
          }
        }
        if (riskFilter && meta.risk !== riskFilter) {
          return false;
        }
        return true;
      });

      if (options.compact === true) {
        return {
          changed: false,
          data: {
            cliVersion,
            commands: filtered.map((meta) => ({
              command: meta.command,
              summary: meta.summary,
              risk: meta.risk,
              authModes: meta.authModes,
              usage: buildUsageSignature(meta)
            }))
          },
          meta: {
            total: filtered.length,
            compact: true
          }
        };
      }

      return {
        changed: false,
        data: {
          cliVersion,
          commands: filtered
        },
        meta: {
          total: filtered.length
        }
      };
    }
  };
}
