import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import z from 'zod';
import { listApps } from '../../../domain/app/app-service';
import { parseIdListOption, parseParentIdOption } from '../../../shared/input';
import type { CliCommandSpec } from '../../pipeline';
import { parseOptionalNumber, requireActiveClient } from '../dataset/shared';

/** 注册应用与团队工具的只读发现命令。 */
export function createAppListCommandSpec(): CliCommandSpec {
  return {
    path: ['app', 'list'],
    summary: 'List accessible apps, team tools, and folders with pagination and search',
    risk: 'read',
    authModes: ['token', 'personalKey'],
    options: [
      {
        name: 'search',
        flags: '--search <keyword>',
        takesValue: true,
        description: 'Search names and descriptions'
      },
      {
        name: 'type',
        flags: '--type <types>',
        takesValue: true,
        description: 'Comma-separated app types, e.g. simple,chatAgent,advanced,plugin'
      },
      {
        name: 'parentId',
        flags: '--parent-id <id>',
        takesValue: true,
        description: 'Browse a folder or restrict search to its subtree'
      },
      {
        name: 'page',
        flags: '--page <n>',
        takesValue: true,
        description: 'Page number (default 1)'
      },
      {
        name: 'pageSize',
        flags: '--page-size <n>',
        takesValue: true,
        description: 'Items per page (default 20, max 500)'
      }
    ],
    examples: [
      { description: 'List accessible root apps and tools', args: ['app', 'list'] },
      {
        description: 'Search for agents and workflow apps',
        args: ['app', 'list', '--type', 'chatAgent,advanced', '--search', 'support']
      }
    ],
    execute: ({ options, client }) =>
      listApps({
        client: requireActiveClient(client, 'app list'),
        input: {
          searchKey: options.search,
          // 提前拒绝无效类型，避免服务端的旧客户端兼容逻辑将其视为不筛选。
          type: z.array(z.enum(AppTypeEnum)).optional().parse(parseIdListOption(options.type)),
          parentId: parseParentIdOption(options.parentId),
          pageNum: parseOptionalNumber(options.page),
          pageSize: parseOptionalNumber(options.pageSize)
        }
      })
  };
}
