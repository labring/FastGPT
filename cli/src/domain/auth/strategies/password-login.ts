import { PuzzleCaptchaChallengeSchema } from '@fastgpt/global/support/user/account/captcha/type';
import type { PuzzleCaptchaChallenge } from '@fastgpt/global/support/user/account/captcha/type';
import { PuzzleCaptchaResultSchema } from '@fastgpt/global/support/user/account/captcha/type';
import {
  LoginByPasswordResponseSchema,
  LoginSuccessResponseSchema,
  PreLoginResponseSchema
} from '@fastgpt/global/openapi/support/user/account/login/api';
import { sha256Hex } from '../../../shared/crypto';
import { CliArgumentError, CliAuthError } from '../../../shared/errors';
import type { LoginStrategy } from './login-strategy';

/**
 * 账号密码登录策略：对齐 FastGPT `preLogin` + 本地 SHA-256 + `loginByPassword` + 可选 2FA 状态机。
 * 浏览器旋转交互委托给注入的 `captchaPreviewer`，领域层不持有本地 HTTP 服务。
 */
export function createPasswordLoginStrategy(): LoginStrategy {
  return {
    method: 'password',
    authenticate: async ({ input, client, prompter, readStdin, captchaPreviewer }) => {
      // 1. 解析用户名与密码（绝不在网络中传输原始明文密码）。
      const username = await (async () => {
        if (input.username) {
          return input.username.trim();
        }
        if (!prompter.isInteractive) {
          throw new CliArgumentError('--username is required in non-interactive password login.');
        }
        return prompter.text({ message: 'Username, email, or phone' });
      })();
      if (!username) {
        throw new CliArgumentError('Username cannot be empty.');
      }

      const rawPassword = await (async () => {
        if (input.passwordStdin) {
          return (await readStdin()).replace(/\r?\n$/, '');
        }
        if (!prompter.isInteractive) {
          throw new CliArgumentError(
            'Password login in non-interactive mode requires --password-stdin.'
          );
        }
        return prompter.secret({ message: 'Password' });
      })();
      if (!rawPassword) {
        throw new CliArgumentError('Password cannot be empty.');
      }

      /** 在本地浏览器将图片转正，所有角度与轨迹均交给 FastGPT 服务端验证。 */
      const solvePuzzle = async ({
        challenge,
        getCaptcha
      }: {
        challenge: PuzzleCaptchaChallenge;
        getCaptcha: () => Promise<PuzzleCaptchaChallenge>;
      }) => {
        if (!prompter.isInteractive || !captchaPreviewer) {
          throw new CliAuthError({
            code: 'AUTH_REQUIRED',
            message: 'This login requires image rotation verification in a browser.',
            hint: 'Run interactive login, or use an API Key / --token-stdin.'
          });
        }
        const preview = await captchaPreviewer({
          challenge,
          getCaptcha,
          prompter,
          verify: async (submission) => {
            const result = await client.request<unknown>({
              method: 'POST',
              path: '/support/user/account/captcha/verify',
              body: { ...submission, purpose: 'login' }
            });
            return PuzzleCaptchaResultSchema.parse(result);
          }
        });
        try {
          if (!preview.solution)
            throw new CliArgumentError('Image rotation browser preview is unavailable.');
          return await preview.solution;
        } finally {
          await preview.cleanup();
        }
      };

      // 2. 拉取 30s 预登录码并提交 SHA-256 密码摘要。
      const spin = prompter.spinner();
      spin.start('Signing in to FastGPT...');
      let loginResult;
      try {
        const preLoginRaw = await client.request<unknown>({
          method: 'GET',
          path: '/support/user/account/preLogin',
          query: { username }
        });
        const { code: preLoginCode } = PreLoginResponseSchema.parse(preLoginRaw);

        const loginRaw = await client.request<unknown>({
          method: 'POST',
          path: '/support/user/account/loginByPassword',
          body: {
            username,
            password: sha256Hex(rawPassword),
            code: preLoginCode,
            language: input.language
          }
        });
        loginResult = LoginByPasswordResponseSchema.parse(loginRaw);
      } finally {
        spin.stop('Login request finished.');
      }

      if (!('status' in loginResult)) {
        return {
          authType: 'token',
          secret: loginResult.token
        };
      }

      // 3. 命中二次验证时，非交互终端直接报错提示改用 API Key 或交互模式。
      if (!prompter.isInteractive) {
        throw new CliAuthError({
          code: 'AUTH_REQUIRED',
          message: `Account "${username}" requires 2FA verification (${loginResult.channel}: ${loginResult.maskedTarget}), which cannot run without an interactive TTY.`,
          hint: 'Run "fastgpt login" in an interactive terminal, or authenticate using an API Key / --token-stdin.'
        });
      }

      // 4. 拉取并交由 UI 预览图片验证码，发送短信/邮件验证码后完成 verify。
      const loginChallenge = loginResult.challenge;
      const getCaptcha = async () =>
        PuzzleCaptchaChallengeSchema.parse(
          await client.request<unknown>({
            method: 'POST',
            path: '/support/user/account/login/verification/captcha',
            body: { challenge: loginChallenge }
          })
        );
      const captcha = await solvePuzzle({ challenge: await getCaptcha(), getCaptcha });
      await client.request<unknown>({
        method: 'POST',
        path: '/support/user/account/login/verification/sendCode',
        body: {
          challenge: loginResult.challenge,
          captcha
        }
      });

      const verificationCode = await prompter.text({
        message: `Enter ${loginResult.channel} verification code sent to ${loginResult.maskedTarget}`
      });
      if (!verificationCode) {
        throw new CliArgumentError('Verification code cannot be empty.');
      }

      const verifiedRaw = await client.request<unknown>({
        method: 'POST',
        path: '/support/user/account/login/verification/verify',
        body: {
          challenge: loginResult.challenge,
          code: verificationCode
        }
      });
      const verified = LoginSuccessResponseSchema.parse(verifiedRaw);

      return {
        authType: 'token',
        secret: verified.token
      };
    }
  };
}
