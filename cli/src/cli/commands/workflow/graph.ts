import { CliArgumentError } from '../../../shared/errors';
import type { CliCommandSpec } from '../../pipeline';
import { parseOptionalBooleanFlag } from '../dataset/shared';
import {
  WORKFLOW_DIR_OPTION,
  WORKFLOW_DRY_RUN_OPTION,
  WORKFLOW_LOCALE_OPTION,
  optionalNonEmptyOption,
  requireNonEmptyOption,
  resolveWorkflowDir,
  resolveWorkflowLocale
} from './shared';

const TEMPLATE_KIND_SET = new Set<string>(['builtin', 'teamApp', 'systemTool', 'tool']);

/**
 * 节点模板、节点、连线与容器查询命令组：template / node / edge / container。
 */
export function createWorkflowGraphCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['workflow', 'template', 'list'],
      summary: 'List available node templates from the active template bundle',
      risk: 'read',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'kind',
          flags: '--kind <kind>',
          takesValue: true,
          description: 'Filter by template kind: builtin, teamApp, systemTool, tool'
        }
      ],
      examples: [
        {
          description: 'List builtin node templates',
          args: ['workflow', 'template', 'list', '--kind', 'builtin']
        }
      ],
      execute: ({ options, container }) => {
        const kind = optionalNonEmptyOption(options, 'kind');
        if (kind !== undefined && !TEMPLATE_KIND_SET.has(kind)) {
          throw new CliArgumentError('--kind must be one of: builtin, teamApp, systemTool, tool.');
        }
        return container.workflowLocalService.templateList({
          locale: resolveWorkflowLocale(options, container.env),
          kind: kind as 'builtin' | 'teamApp' | 'systemTool' | 'tool' | undefined
        });
      }
    },

    {
      path: ['workflow', 'template', 'show'],
      summary: 'Inspect inputs, outputs, and defaults of a node template reference',
      risk: 'read',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'template',
          flags: '--template <ref>',
          takesValue: true,
          description: 'Explicit template reference (e.g. builtin:ai-chat)'
        }
      ],
      examples: [
        {
          description: 'Show ai-chat template descriptor',
          args: ['workflow', 'template', 'show', '--template', 'builtin:ai-chat']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.templateShow({
          locale: resolveWorkflowLocale(options, container.env),
          template: requireNonEmptyOption({
            options,
            key: 'template',
            flagName: '--template'
          })
        })
    },

    {
      path: ['workflow', 'node', 'list'],
      summary: 'List nodes in local workflow.json',
      risk: 'read',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        {
          name: 'type',
          flags: '--type <flowNodeType>',
          takesValue: true,
          description: 'Filter by flowNodeType'
        },
        {
          name: 'parent',
          flags: '--parent <nodeId>',
          takesValue: true,
          description: 'Filter by parent node ID'
        }
      ],
      examples: [{ description: 'List all nodes', args: ['workflow', 'node', 'list'] }],
      execute: ({ options, container }) =>
        container.workflowLocalService.nodeList({
          dir: resolveWorkflowDir(options, container.env),
          type: optionalNonEmptyOption(options, 'type'),
          parent: optionalNonEmptyOption(options, 'parent')
        })
    },

    {
      path: ['workflow', 'node', 'show'],
      summary: 'Show node details, template descriptor, and connected execution edges',
      risk: 'read',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' }
      ],
      examples: [
        { description: 'Show node details', args: ['workflow', 'node', 'show', '--node', 'chat1'] }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.nodeShow({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' })
        })
    },

    {
      path: ['workflow', 'node', 'add'],
      summary: 'Add a node instantiated from a template to local workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'New node ID' },
        {
          name: 'template',
          flags: '--template <ref>',
          takesValue: true,
          description: 'Template reference'
        },
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'Node display name'
        },
        {
          name: 'after',
          flags: '--after <sourcePort>',
          takesValue: true,
          description: 'Connect from a semantic source port'
        },
        {
          name: 'parent',
          flags: '--parent <nodeId>',
          takesValue: true,
          description: 'Create inside a container node'
        },
        {
          name: 'position',
          flags: '--position <x,y>',
          takesValue: true,
          description: 'Canvas position as x,y'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Add an AI chat node after workflowStart',
          args: [
            'workflow',
            'node',
            'add',
            '--node',
            'chat1',
            '--template',
            'builtin:ai-chat',
            '--after',
            'start@next'
          ]
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.nodeAdd({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          template: requireNonEmptyOption({
            options,
            key: 'template',
            flagName: '--template'
          }),
          name: optionalNonEmptyOption(options, 'name'),
          after: optionalNonEmptyOption(options, 'after'),
          parent: optionalNonEmptyOption(options, 'parent'),
          position: optionalNonEmptyOption(options, 'position'),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow', 'node', 'update'],
      summary: 'Update node name, position, or catch-error setting in local workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' },
        { name: 'name', flags: '--name <name>', takesValue: true, description: 'New node name' },
        {
          name: 'position',
          flags: '--position <x,y>',
          takesValue: true,
          description: 'Canvas position as x,y'
        },
        {
          name: 'catchError',
          flags: '--catch-error',
          takesValue: false,
          description: 'Enable catch execution port'
        },
        {
          name: 'noCatchError',
          flags: '--no-catch-error',
          takesValue: false,
          description: 'Disable catch execution port'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Rename a node',
          args: ['workflow', 'node', 'update', '--node', 'chat1', '--name', 'Answer Agent']
        }
      ],
      execute: ({ options, container }) => {
        if (options.catchError === true && options.noCatchError === true) {
          throw new CliArgumentError('--catch-error and --no-catch-error are mutually exclusive.');
        }
        const catchError = parseOptionalBooleanFlag({
          positive: options.catchError,
          negative: options.noCatchError
        });
        const name = optionalNonEmptyOption(options, 'name');
        const position = optionalNonEmptyOption(options, 'position');
        if (name === undefined && position === undefined && catchError === undefined) {
          throw new CliArgumentError(
            'At least one of --name, --position, --catch-error, or --no-catch-error is required.'
          );
        }
        return container.workflowLocalService.nodeUpdate({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          name,
          position,
          catchError,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['workflow', 'node', 'move'],
      summary: 'Move a node position or parent container scope in local workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' },
        {
          name: 'position',
          flags: '--position <x,y>',
          takesValue: true,
          description: 'Canvas position as x,y'
        },
        {
          name: 'parent',
          flags: '--parent <nodeId>',
          takesValue: true,
          description: 'Move into container node'
        },
        {
          name: 'root',
          flags: '--root',
          takesValue: false,
          description: 'Move to root canvas scope'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Move node to root scope at (300, 180)',
          args: ['workflow', 'node', 'move', '--node', 'chat1', '--root', '--position', '300,180']
        }
      ],
      execute: ({ options, container }) => {
        const parent = optionalNonEmptyOption(options, 'parent');
        const root = options.root === true;
        const position = optionalNonEmptyOption(options, 'position');
        if (parent !== undefined && root) {
          throw new CliArgumentError('--parent and --root are mutually exclusive.');
        }
        if (parent === undefined && !root && position === undefined) {
          throw new CliArgumentError(
            'At least one of --position, --parent, or --root is required.'
          );
        }
        return container.workflowLocalService.nodeMove({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          position,
          parent,
          root,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['workflow', 'node', 'insert'],
      summary: 'Insert a new node between two connected execution ports',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'from',
          flags: '--from <sourcePort>',
          takesValue: true,
          description: 'Existing execution source port'
        },
        {
          name: 'to',
          flags: '--to <targetPort>',
          takesValue: true,
          description: 'Existing execution target port'
        },
        {
          name: 'template',
          flags: '--template <ref>',
          takesValue: true,
          description: 'Inserted node template'
        },
        { name: 'id', flags: '--id <nodeId>', takesValue: true, description: 'Inserted node ID' },
        {
          name: 'position',
          flags: '--position <x,y>',
          takesValue: true,
          description: 'Canvas position as x,y'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Insert a node between start and chat1',
          args: [
            'workflow',
            'node',
            'insert',
            '--from',
            'start@next',
            '--to',
            'chat1@target',
            '--template',
            'builtin:classify-question',
            '--id',
            'cls1'
          ]
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.nodeInsert({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          from: requireNonEmptyOption({ options, key: 'from', flagName: '--from' }),
          to: requireNonEmptyOption({ options, key: 'to', flagName: '--to' }),
          template: requireNonEmptyOption({
            options,
            key: 'template',
            flagName: '--template'
          }),
          id: requireNonEmptyOption({ options, key: 'id', flagName: '--id' }),
          position: optionalNonEmptyOption(options, 'position'),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow', 'node', 'clone'],
      summary: 'Clone an existing node with a new ID',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Source node ID' },
        { name: 'id', flags: '--id <newNodeId>', takesValue: true, description: 'Cloned node ID' },
        {
          name: 'position',
          flags: '--position <x,y>',
          takesValue: true,
          description: 'Absolute canvas position as x,y'
        },
        {
          name: 'offset',
          flags: '--offset <x,y>',
          takesValue: true,
          description: 'Offset from source position as x,y'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Clone chat1 to chat2 with offset',
          args: [
            'workflow',
            'node',
            'clone',
            '--node',
            'chat1',
            '--id',
            'chat2',
            '--offset',
            '0,220'
          ]
        }
      ],
      execute: ({ options, container }) => {
        const position = optionalNonEmptyOption(options, 'position');
        const offset = optionalNonEmptyOption(options, 'offset');
        if (position !== undefined && offset !== undefined) {
          throw new CliArgumentError('--position and --offset are mutually exclusive.');
        }
        return container.workflowLocalService.nodeClone({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          sourceNodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          id: requireNonEmptyOption({ options, key: 'id', flagName: '--id' }),
          position,
          offset,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['workflow', 'node', 'remove'],
      summary: 'Remove a node and its incident edges from local workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Remove node chat1',
          args: ['workflow', 'node', 'remove', '--node', 'chat1']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.nodeRemove({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow', 'edge', 'list'],
      summary: 'List execution edges in local workflow.json',
      risk: 'read',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        {
          name: 'node',
          flags: '--node <nodeId>',
          takesValue: true,
          description: 'Filter by node ID'
        },
        {
          name: 'kind',
          flags: '--kind <kind>',
          takesValue: true,
          description: 'Filter by source kind'
        }
      ],
      examples: [{ description: 'List all execution edges', args: ['workflow', 'edge', 'list'] }],
      execute: ({ options, container }) =>
        container.workflowLocalService.edgeList({
          dir: resolveWorkflowDir(options, container.env),
          nodeId: optionalNonEmptyOption(options, 'node'),
          kind: optionalNonEmptyOption(options, 'kind')
        })
    },

    {
      path: ['workflow', 'edge', 'connect'],
      summary: 'Connect two execution ports in local workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'from',
          flags: '--from <sourcePort>',
          takesValue: true,
          description: 'Execution source port'
        },
        {
          name: 'to',
          flags: '--to <targetPort>',
          takesValue: true,
          description: 'Execution target port'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Connect start@next to chat1@target',
          args: ['workflow', 'edge', 'connect', '--from', 'start@next', '--to', 'chat1@target']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.edgeConnect({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          from: requireNonEmptyOption({ options, key: 'from', flagName: '--from' }),
          to: requireNonEmptyOption({ options, key: 'to', flagName: '--to' }),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow', 'edge', 'disconnect'],
      summary: 'Disconnect an execution edge in local workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'from',
          flags: '--from <sourcePort>',
          takesValue: true,
          description: 'Execution source port'
        },
        {
          name: 'to',
          flags: '--to <targetPort>',
          takesValue: true,
          description: 'Execution target port'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Disconnect start@next from chat1@target',
          args: ['workflow', 'edge', 'disconnect', '--from', 'start@next', '--to', 'chat1@target']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.edgeDisconnect({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          from: requireNonEmptyOption({ options, key: 'from', flagName: '--from' }),
          to: requireNonEmptyOption({ options, key: 'to', flagName: '--to' }),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow', 'edge', 'reconnect'],
      summary: 'Redirect an existing execution edge to a new target port',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'from',
          flags: '--from <sourcePort>',
          takesValue: true,
          description: 'Execution source port'
        },
        {
          name: 'oldTo',
          flags: '--old-to <targetPort>',
          takesValue: true,
          description: 'Existing target port'
        },
        {
          name: 'to',
          flags: '--to <targetPort>',
          takesValue: true,
          description: 'Replacement target port'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Reconnect start@next from chat1 to chat2',
          args: [
            'workflow',
            'edge',
            'reconnect',
            '--from',
            'start@next',
            '--old-to',
            'chat1@target',
            '--to',
            'chat2@target'
          ]
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.edgeReconnect({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          from: requireNonEmptyOption({ options, key: 'from', flagName: '--from' }),
          oldTo: requireNonEmptyOption({ options, key: 'oldTo', flagName: '--old-to' }),
          to: requireNonEmptyOption({ options, key: 'to', flagName: '--to' }),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow', 'container', 'children'],
      summary: 'List child nodes inside a container node (e.g. loop)',
      risk: 'read',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        {
          name: 'node',
          flags: '--node <nodeId>',
          takesValue: true,
          description: 'Container node ID'
        }
      ],
      examples: [
        {
          description: 'List children of loop1',
          args: ['workflow', 'container', 'children', '--node', 'loop1']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.containerChildren({
          dir: resolveWorkflowDir(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' })
        })
    }
  ];
}
