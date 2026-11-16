import { describe, expect, it } from 'vitest';
import { createDocument } from 'zod-openapi';
import { GetConfigResponseSchema } from '../../../openapi/admin/system/api';
import { AdminSettingsPath } from '../../../openapi/admin/system';

describe('system configuration API contracts', () => {
  it('only documents existing legacy read endpoints; writes use the instance config API', () => {
    expect(AdminSettingsPath).toHaveProperty('/proApi/admin/system/getConfig');
    expect(AdminSettingsPath).not.toHaveProperty('/proApi/admin/system/updateConfig');
  });
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
