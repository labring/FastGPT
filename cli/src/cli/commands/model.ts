import { CliArgumentError } from '../../shared/errors';
import type { CliCommandSpec } from '../pipeline';

/** 注册当前成员可用模型查询；不暴露公开模型、展示摘要或模型管理接口。 */
export function createModelCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['model', 'list'],
      summary: 'List models available to the current member, providers, and default model IDs',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'includeSourceMember',
          flags: '--include-source-member',
          takesValue: false,
          description: 'Include creator information for team models'
        },
        {
          name: 'orderBy',
          flags: '--order-by <order>',
          takesValue: true,
          description: 'Use custom to apply member model display order; omit for runtime order'
        }
      ],
      examples: [
        {
          description: 'List the current member model catalog as JSON',
          args: ['model', 'list', '--format', 'json']
        },
        {
          description: 'Include creators and use custom display order',
          args: ['model', 'list', '--include-source-member', '--order-by', 'custom']
        }
      ],
      execute: async ({ options, client, container }) => {
        if (!client) {
          throw new CliArgumentError('Active HTTP client required for model list.');
        }

        return container.modelService.list({
          client,
          input: {
            includeSourceMember: options.includeSourceMember,
            orderBy: options.orderBy
          }
        });
      }
    }
  ];
}
