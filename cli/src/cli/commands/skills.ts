import { parseIdListOption } from '../../shared/input';
import type { CommandOptionMeta } from '../../shared/types';
import type { CliCommandSpec } from '../pipeline';

const TARGET_OPTIONS: readonly CommandOptionMeta[] = [
  {
    name: 'target',
    flags: '--target <target>',
    takesValue: true,
    description: 'Target agent directory preset: claude, codex, cursor, or agents (default agents)'
  },
  {
    name: 'scope',
    flags: '--scope <scope>',
    takesValue: true,
    description: 'Install scope: project or user (default project)'
  },
  {
    name: 'dir',
    flags: '--dir <path>',
    takesValue: true,
    description: 'Custom target skills directory (overrides --target and --scope)'
  }
];

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * 注册内置 Agent Skill 管理命令组：`skills catalog | install | uninstall | update | doctor`（纯本地操作，无需认证）。
 */
export function createSkillsCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['skills', 'catalog'],
      summary: 'List bundled official FastGPT Agent skills',
      risk: 'read',
      authModes: ['none'],
      options: [],
      examples: [
        {
          description: 'List bundled skills as JSON',
          args: ['skills', 'catalog', '--format', 'json']
        }
      ],
      execute: ({ container }) => container.skillsService.catalog()
    },

    {
      path: ['skills', 'install'],
      summary: 'Install bundled FastGPT Agent skills into a project, user, or custom directory',
      risk: 'write',
      authModes: ['none'],
      positionalArgs: [
        {
          name: 'names',
          required: false,
          description: 'Comma-separated skill names (defaults to all bundled skills)'
        }
      ],
      options: [
        {
          name: 'all',
          flags: '--all',
          takesValue: false,
          description: 'Install all bundled skills explicitly'
        },
        ...TARGET_OPTIONS,
        {
          name: 'force',
          flags: '--force',
          takesValue: false,
          description: 'Overwrite existing or locally modified skill directories'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview target path and planned skill actions without writing files'
        }
      ],
      examples: [
        {
          description: 'Preview installing all bundled skills',
          args: ['skills', 'install', '--dry-run', '--format', 'json']
        },
        {
          description: 'Install selected skills for Claude Code at user scope',
          args: [
            'skills',
            'install',
            'fastgpt-cli,fastgpt-knowledge',
            '--target',
            'claude',
            '--scope',
            'user'
          ]
        }
      ],
      execute: ({ positional, options, container }) =>
        container.skillsService.install({
          names: parseIdListOption(positional[0]),
          all: options.all === true,
          target: readOptionalString(options.target),
          scope: readOptionalString(options.scope),
          customDir: readOptionalString(options.dir),
          force: options.force === true,
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['skills', 'uninstall'],
      summary: 'Uninstall CLI-managed FastGPT Agent skills from a target directory',
      risk: 'destructive',
      authModes: ['none'],
      positionalArgs: [
        {
          name: 'names',
          required: false,
          description: 'Comma-separated skill names to remove'
        }
      ],
      options: [
        {
          name: 'all',
          flags: '--all',
          takesValue: false,
          description: 'Remove all CLI-managed FastGPT skills in the target directory'
        },
        ...TARGET_OPTIONS,
        {
          name: 'yes',
          flags: '--yes',
          takesValue: false,
          description: 'Confirm removal in non-interactive or JSON mode'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview which skill directories would be removed without deleting files'
        }
      ],
      examples: [
        {
          description: 'Uninstall a skill non-interactively',
          args: ['skills', 'uninstall', 'fastgpt-cli', '--dir', './.agents/skills', '--yes']
        },
        {
          description: 'Uninstall all CLI-managed skills from project scope',
          args: ['skills', 'uninstall', '--all', '--target', 'agents', '--yes']
        }
      ],
      execute: ({ positional, options, global, container }) =>
        container.skillsService.uninstall({
          names: parseIdListOption(positional[0]),
          all: options.all === true,
          target: readOptionalString(options.target),
          scope: readOptionalString(options.scope),
          customDir: readOptionalString(options.dir),
          yes: options.yes === true,
          dryRun: options.dryRun === true,
          format: global.format
        })
    },

    {
      path: ['skills', 'update'],
      summary: 'Update installed CLI-managed FastGPT Agent skills to match the current CLI version',
      risk: 'write',
      authModes: ['none'],
      options: [
        ...TARGET_OPTIONS,
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview which installed skills would be updated without writing files'
        }
      ],
      examples: [
        {
          description: 'Update managed skills in current project',
          args: ['skills', 'update', '--target', 'agents', '--scope', 'project']
        }
      ],
      execute: ({ options, container }) =>
        container.skillsService.update({
          target: readOptionalString(options.target),
          scope: readOptionalString(options.scope),
          customDir: readOptionalString(options.dir),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['skills', 'doctor'],
      summary: 'Check whether installed FastGPT Agent skills are up to date, missing, or unmanaged',
      risk: 'read',
      authModes: ['none'],
      options: [...TARGET_OPTIONS],
      examples: [
        {
          description: 'Check bundled skill status in current project',
          args: ['skills', 'doctor', '--format', 'json']
        }
      ],
      execute: ({ options, container }) =>
        container.skillsService.doctor({
          target: readOptionalString(options.target),
          scope: readOptionalString(options.scope),
          customDir: readOptionalString(options.dir)
        })
    }
  ];
}
