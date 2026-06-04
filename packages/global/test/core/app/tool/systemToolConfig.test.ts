import { describe, expect, it } from 'vitest';
import { SystemToolCodec } from '@fastgpt/global/core/app/tool/systemTool/codec';
import { UpdateSystemToolBodySchema } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import type { SystemPluginToolCollectionType } from '@fastgpt/global/core/plugin/tool/type';

describe('system tool config', () => {
  it('allows null secretsVal to explicitly disable system secret', () => {
    const result = UpdateSystemToolBodySchema.parse({
      id: 'systemTool-github',
      secretsVal: null
    });

    expect(result.secretsVal).toBeNull();
  });

  it('keeps missing secretsVal as no-op for partial update', () => {
    const result = UpdateSystemToolBodySchema.parse({
      id: 'systemTool-github'
    });

    expect(Object.prototype.hasOwnProperty.call(result, 'secretsVal')).toBe(false);
  });

  it('falls back to deprecated inputListVal only when secretsVal is absent', () => {
    const legacyConfig = {
      pluginId: 'systemTool-github',
      inputListVal: {
        token: 'legacy-token'
      }
    } satisfies SystemPluginToolCollectionType;

    const disabledConfig = {
      ...legacyConfig,
      secretsVal: null
    } satisfies SystemPluginToolCollectionType;

    expect(SystemToolCodec.getConfiguredSecretsVal(legacyConfig)).toEqual({
      token: 'legacy-token'
    });
    expect(SystemToolCodec.getConfiguredSecretsVal(disabledConfig)).toBeUndefined();
  });

  it('falls back to deprecated inputListVal when secretsVal is undefined', () => {
    const config = {
      pluginId: 'systemTool-github',
      secretsVal: undefined,
      inputListVal: {
        token: 'legacy-token'
      }
    } satisfies SystemPluginToolCollectionType;

    expect(SystemToolCodec.getConfiguredSecretsVal(config)).toEqual({
      token: 'legacy-token'
    });
  });
});
