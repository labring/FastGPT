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

  it('uses an empty success response contract', () => {
    expect(UpdateConfigResponseSchema.parse(undefined)).toBeUndefined();
  });

  it('declares open object schemas for dynamic system configurations', () => {
    const parsed = GetConfigResponseSchema.parse({
      fastgpt: { feConfigs: { isPlus: true } },
      fastgptPro: { someProKey: 'val' }
    });
    expect(parsed.fastgpt).toEqual({ feConfigs: { isPlus: true } });
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
