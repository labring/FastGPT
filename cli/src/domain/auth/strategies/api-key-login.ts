import { CliArgumentError } from '../../../shared/errors';
import type { LoginStrategy } from './login-strategy';

/**
 * API Key 登录策略：支持 `--api-key`、`--api-key-stdin` 与交互式隐藏输入。
 */
export function createApiKeyLoginStrategy(): LoginStrategy {
  return {
    method: 'apiKey',
    authenticate: async ({ input, prompter, readStdin }) => {
      const secret = await (async () => {
        if (input.apiKeyFlag) {
          return input.apiKeyFlag.trim();
        }
        if (input.apiKeyStdin) {
          return (await readStdin()).trim();
        }
        return prompter.secret({ message: 'Enter FastGPT API Key' });
      })();

      if (!secret) {
        throw new CliArgumentError('API Key cannot be empty.');
      }

      return {
        authType: 'apikey',
        secret
      };
    }
  };
}
