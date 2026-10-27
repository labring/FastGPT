import { describe, expect, it } from 'vitest';
import { createDocument } from 'zod-openapi';
import {
  GetConfigResponseSchema,
  UpdateConfigBodySchema,
  UpdateConfigResponseSchema
} from '../../../openapi/admin/system/api';
import { StandardSubLevelEnum, SubTypeEnum } from '../../../support/wallet/sub/constants';

const createBody = (subPlans: unknown) => ({
  fastgpt: {
    feConfigs: {},
    systemEnv: {},
    subPlans
  },
  fastgptPro: {}
});

describe('UpdateConfigBodySchema', () => {
  it('converts numeric strings and strips unsupported legacy custom plan fields', () => {
    const result = UpdateConfigBodySchema.parse(
      createBody({
        standard: {
          [StandardSubLevelEnum.custom]: {
            priceDesc: '定制化计费',
            customDescriptions: ['专属客户经理'],
            customFormUrl: 'https://example.com/contact'
          }
        },
        [SubTypeEnum.extraDatasetSize]: { price: '4' },
        activityExpirationTime: '2026-08-31T16:00:00.000Z'
      })
    );

    expect(result.fastgpt.subPlans).toEqual({
      standard: {
        [StandardSubLevelEnum.custom]: {
          customDescriptions: ['专属客户经理'],
          customFormUrl: 'https://example.com/contact'
        }
      },
      [SubTypeEnum.extraDatasetSize]: { price: 4 },
      activityExpirationTime: new Date('2026-08-31T16:00:00.000Z')
    });
  });

  it('removes an empty activity expiration value before storage', () => {
    const result = UpdateConfigBodySchema.parse(
      createBody({ activityExpirationTime: '', [SubTypeEnum.extraDatasetSize]: { price: '4' } })
    );

    expect(result.fastgpt.subPlans).toEqual({
      [SubTypeEnum.extraDatasetSize]: { price: 4 }
    });
  });

  it('rejects invalid numeric strings and incomplete non-custom plans', () => {
    expect(() =>
      UpdateConfigBodySchema.parse(
        createBody({ [SubTypeEnum.extraDatasetSize]: { price: 'not-a-number' } })
      )
    ).toThrow();

    expect(() =>
      UpdateConfigBodySchema.parse(
        createBody({ standard: { [StandardSubLevelEnum.basic]: { price: '99' } } })
      )
    ).toThrow();
  });

  it('normalizes quota overrides and preserves unrelated dynamic settings', () => {
    const result = UpdateConfigBodySchema.parse({
      fastgpt: {
        feConfigs: {
          customFeature: { enabled: true },
          limit: { customLimit: 7 }
        },
        systemEnv: { agentSandboxMax: '12', agentSandboxMaxPerTeam: null, customSetting: 7 }
      },
      fastgptPro: {}
    });

    expect(result.fastgpt.feConfigs).toEqual({
      customFeature: { enabled: true },
      limit: { customLimit: 7 }
    });
    expect(result.fastgpt.systemEnv).toEqual({
      agentSandboxMax: 12,
      agentSandboxMaxPerTeam: undefined,
      vectorRecallConcurrency: 0,
      customSetting: 7
    });
    // 保存归一化后的配置必须能通过读取接口校验，避免保存成功后配置页打不开。
    expect(GetConfigResponseSchema.parse(result)).toMatchObject(result);
  });

  it('uses an empty success response contract', () => {
    expect(UpdateConfigResponseSchema.parse(undefined)).toBeUndefined();
  });

  it.each([
    { input: undefined, expected: 0 },
    { input: 0, expected: 0 },
    { input: '8', expected: 8 },
    { input: 1000, expected: 1000 }
  ])('normalizes vector recall concurrency from Admin configuration %j', ({ input, expected }) => {
    const body = {
      fastgpt: { feConfigs: {}, systemEnv: { vectorRecallConcurrency: input } },
      fastgptPro: {}
    };
    const result = UpdateConfigBodySchema.parse(body);

    expect(result.fastgpt.systemEnv.vectorRecallConcurrency).toBe(expected);
    expect(GetConfigResponseSchema.parse(result)).toMatchObject(result);
  });

  it.each([-1, 1.5, 1001, 'invalid'])(
    'rejects invalid vector recall concurrency %j before saving Admin configuration',
    (value) => {
      expect(
        UpdateConfigBodySchema.safeParse({
          fastgpt: { feConfigs: {}, systemEnv: { vectorRecallConcurrency: value } },
          fastgptPro: {}
        }).success
      ).toBe(false);
    }
  );

  it.each(['agentSandboxMax', 'agentSandboxMaxPerTeam'])(
    'rejects invalid quota values for %s at the update boundary',
    (field) => {
      for (const value of [0, -1, 1.5, '1.5', '', 'invalid']) {
        const body = {
          fastgpt: { feConfigs: {}, systemEnv: { [field]: value } },
          fastgptPro: {}
        };
        expect(UpdateConfigBodySchema.safeParse(body).success).toBe(false);
      }
    }
  );

  it('declares open object schemas for dynamic system configurations', () => {
    const parsed = GetConfigResponseSchema.parse({
      fastgpt: {
        feConfigs: {
          isPlus: true,
          limit: { uploadFileMaxSize: '500', uploadFileMaxAmount: '15' }
        }
      },
      fastgptPro: { someProKey: 'val' }
    });
    expect(parsed.fastgpt).toEqual({
      feConfigs: {
        isPlus: true,
        limit: { uploadFileMaxSize: 500, uploadFileMaxAmount: 15 }
      }
    });
    expect(parsed.fastgptPro).toEqual({ someProKey: 'val' });

    const doc = createDocument({
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      components: {
        schemas: {
          GetConfigResponse: GetConfigResponseSchema
        }
      }
    });
    const schema = doc.components?.schemas?.GetConfigResponse as any;
    expect(schema.properties.fastgpt.type).toBe('object');
    expect(schema.properties.fastgpt.additionalProperties).toBeTruthy();
    expect(schema.properties.fastgptPro.type).toBe('object');
    expect(schema.properties.fastgptPro.additionalProperties).toBeTruthy();
  });
});
