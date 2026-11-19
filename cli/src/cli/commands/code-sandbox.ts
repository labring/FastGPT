import { listCodeSandboxPackages } from '../../domain/code-sandbox/code-sandbox-service';
import type { CliCommandSpec } from '../pipeline';
import { requireActiveClient } from './dataset/shared';

/** 注册实例级代码沙盒的依赖查询命令。 */
export function createCodeSandboxCommandSpec(): CliCommandSpec {
  return {
    path: ['code-sandbox', 'packages'],
    summary: 'List available JS/Python packages and builtin globals in the FastGPT code sandbox',
    risk: 'read',
    authModes: ['token'],
    options: [],
    examples: [
      {
        description: 'Query supported code sandbox dependencies',
        args: ['code-sandbox', 'packages', '--format', 'json']
      }
    ],
    execute: ({ client }) =>
      listCodeSandboxPackages(requireActiveClient(client, 'code-sandbox packages'))
  };
}
