import z from 'zod';
import type { CliCommandSpec } from '../pipeline';

const LoginOptionsSchema = z.object({
  apiKeyStdin: z.literal(true).optional(),
  tokenStdin: z.literal(true).optional(),
  username: z.string().trim().min(1).optional(),
  passwordStdin: z.literal(true).optional(),
  language: z.enum(['zh-CN', 'en', 'zh-Hant']).default('zh-CN'),
  noSwitch: z.literal(true).optional()
});

export function createLoginCommandSpec(): CliCommandSpec {
  return {
    path: ['login'],
    summary: 'Authenticate FastGPT CLI via API Key, session token, or username/password (with 2FA)',
    risk: 'write',
    authModes: ['none'],
    options: [
      {
        name: 'apiKeyStdin',
        flags: '--api-key-stdin',
        takesValue: false,
        description: 'Read API Key from stdin'
      },
      {
        name: 'tokenStdin',
        flags: '--token-stdin',
        takesValue: false,
        description: 'Read session token from stdin (useful for SSO fallback)'
      },
      {
        name: 'username',
        flags: '--username <username>',
        takesValue: true,
        description: 'Username, email, or phone for password login'
      },
      {
        name: 'passwordStdin',
        flags: '--password-stdin',
        takesValue: false,
        description: 'Read account password from stdin'
      },
      {
        name: 'language',
        flags: '--language <lang>',
        takesValue: true,
        description: 'Preferred login language: zh-CN, en, or zh-Hant'
      },
      {
        name: 'noSwitch',
        flags: '--no-switch',
        takesValue: false,
        description: 'Save profile without switching currentProfile to it'
      }
    ],
    examples: [
      {
        description: 'Interactive login (select preset or custom Base URL)',
        args: ['login']
      },
      {
        description: 'Non-interactive API Key login via stdin',
        args: ['login', '--base-url', 'https://cloud.fastgpt.cn', '--api-key-stdin']
      },
      { description: 'SSO session token paste via stdin', args: ['login', '--token-stdin'] }
    ],
    execute: async ({ global, options, container }) => {
      const parsed = LoginOptionsSchema.parse({
        ...(options.apiKeyStdin === true ? { apiKeyStdin: true } : {}),
        ...(options.tokenStdin === true ? { tokenStdin: true } : {}),
        ...(typeof options.username === 'string' ? { username: options.username } : {}),
        ...(options.passwordStdin === true ? { passwordStdin: true } : {}),
        ...(typeof options.language === 'string' ? { language: options.language } : {}),
        ...(options.switch === false ? { noSwitch: true } : {})
      });

      return container.authService.login({
        global,
        input: {
          apiKeyFlag: global.apiKey,
          tokenFlag: global.token,
          ...parsed
        }
      });
    }
  };
}
