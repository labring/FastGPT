import { listPluginTools } from '../../domain/plugin/plugin-tool-service';
import { parseIdListOption } from '../../shared/input';
import type { CliCommandSpec } from '../pipeline';
import { requireActiveClient } from './dataset/shared';

/** 注册画布可用插件工具与子工具的查询命令。 */
export function createPluginToolListCommandSpec(): CliCommandSpec {
  return {
    path: ['plugin', 'tool', 'list'],
    summary: 'List plugin-backed system tools available to the current user',
    risk: 'read',
    authModes: ['token', 'personalKey'],
    options: [
      {
        name: 'search',
        flags: '--search <keyword>',
        takesValue: true,
        description: 'Search tool names, descriptions, and tags'
      },
      {
        name: 'tags',
        flags: '--tags <tags>',
        takesValue: true,
        description: 'Filter by comma-separated tool tags'
      },
      {
        name: 'parentId',
        flags: '--parent-id <toolId>',
        takesValue: true,
        description: 'List child tools of a plugin toolset'
      },
      {
        name: 'source',
        flags: '--source <source>',
        takesValue: true,
        description: 'Source returned for the parent toolset'
      }
    ],
    examples: [
      { description: 'List available system tools', args: ['plugin', 'tool', 'list'] },
      {
        description: 'Search for weather tools',
        args: ['plugin', 'tool', 'list', '--search', 'weather']
      }
    ],
    execute: ({ options, client }) =>
      listPluginTools({
        client: requireActiveClient(client, 'plugin tool list'),
        input: {
          searchKey: options.search,
          tags: parseIdListOption(options.tags),
          parentId: options.parentId,
          source: options.source
        }
      })
  };
}
