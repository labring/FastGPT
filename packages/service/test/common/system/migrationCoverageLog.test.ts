import { afterEach, describe, expect, it } from 'vitest';
import { buildInstanceConfigCoverageFields } from '@fastgpt/service/common/system/migrationCoverageLog';

describe('buildInstanceConfigCoverageFields', () => {
  const originalIncludeValues = process.env.MIGRATION_VERIFY_INCLUDE_VALUES;

  const restoreIncludeValues = () => {
    if (originalIncludeValues === undefined) {
      delete process.env.MIGRATION_VERIFY_INCLUDE_VALUES;
    } else {
      process.env.MIGRATION_VERIFY_INCLUDE_VALUES = originalIncludeValues;
    }
  };

  afterEach(() => {
    restoreIncludeValues();
  });

  it('returns callsite field state without carrying config values', () => {
    delete process.env.MIGRATION_VERIFY_INCLUDE_VALUES;
    const fields = buildInstanceConfigCoverageFields({
      fields: [
        {
          path: 'auth.loginProviders.email.user',
          value: 'admin@example.com'
        },
        {
          path: 'feature.disableCache',
          value: undefined
        }
      ]
    });

    expect(fields).toEqual([
      {
        path: 'auth.loginProviders.email.user',
        source: 'instance-config',
        state: 'set'
      },
      {
        path: 'feature.disableCache',
        source: 'instance-config',
        state: 'unset'
      }
    ]);
  });

  it('masks registry-declared secrets when value logging is explicitly enabled', () => {
    process.env.MIGRATION_VERIFY_INCLUDE_VALUES = 'true';

    const fields = buildInstanceConfigCoverageFields({
      fields: [
        {
          path: 'auth.loginProviders.email.pass',
          value: 'super-secret'
        }
      ]
    });

    expect(fields[0]).toMatchObject({
      path: 'auth.loginProviders.email.pass',
      state: 'set',
      value: '******'
    });
  });
});
