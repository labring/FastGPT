import { CliArgumentError } from '../../../shared/errors';
import type { LoginStrategy } from './login-strategy';

/**
 * Session Token 注入策略（支持 `--token`、`--token-stdin` 与交互输入，作为 SSO 登录兜底）。
 */
export function createTokenLoginStrategy(): LoginStrategy {
  return {
    method: 'token',
    authenticate: async ({ input, prompter, readStdin }) => {
      const secret = await (async () => {
        if (input.tokenFlag) {
          return input.tokenFlag.trim();
        }
        if (input.tokenStdin) {
          return (await readStdin()).trim();
        }
        return prompter.secret({ message: 'Enter FastGPT Session Token' });
      })();

      if (!secret) {
        throw new CliArgumentError('Session token cannot be empty.');
      }

      return {
        authType: 'token',
        secret
      };
    }
  };
}
