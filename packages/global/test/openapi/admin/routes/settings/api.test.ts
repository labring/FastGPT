import { describe, expect, it } from 'vitest';
import { UpdateConfigBodySchema } from '../../../../../openapi/admin/routes/settings/api';

const createConfig = () => ({
  fastgpt: {
    feConfigs: {
      uploadFileMaxAmount: 10,
      uploadFileMaxSize: 100,
      sso: {
        url: 'https://sso.example.com',
        disablePasswordForSsoUsers: true
      }
    },
    systemEnv: {}
  },
  fastgptPro: {
    teamMode: 'multi',
    auth: {
      email: {
        enabled: true,
        register: false,
        notification: true,
        smtp: 'smtp.example.com',
        user: 'mailer',
        pass: 'secret'
      }
    }
  }
});

describe('UpdateConfigBodySchema', () => {
  it('accepts the account configuration contract', () => {
    expect(UpdateConfigBodySchema.safeParse(createConfig()).success).toBe(true);
  });
});
