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
      options: [],
      examples: [
        {
          description: 'List the current member model catalog as JSON',
          args: ['model', 'list', '--format', 'json']
        }
      ],
      execute: async ({ client, container }) => {
        if (!client) {
          throw new CliArgumentError('Active HTTP client required for model list.');
        }

        return container.modelService.list({
          client,
          input: {}
        });
      }
    }
  ];
}
