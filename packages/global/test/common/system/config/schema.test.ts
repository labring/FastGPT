import { describe, expect, it } from 'vitest';
import {
  SystemInstanceConfigDocumentSchema,
  SystemInstanceConfigSchema,
  parseSystemInstanceConfig,
  parseSystemInstanceConfigDocument
} from '@fastgpt/global/common/system/config/schema';
import {
  getSystemInstanceConfigRegistry,
  systemInstanceConfigRegistry
} from '@fastgpt/global/common/system/config/registry';

describe('SystemInstanceConfigSchema', () => {
  it('creates a complete default configuration from an empty object', () => {
    const config = parseSystemInstanceConfig({});

    expect(config.site.name).toBe('AI');
    expect(config.performance.workflow.parallelMaxConcurrency).toBe(10);
    expect(config.subservice.agentSandbox.provider).toBe('none');
    expect(config.providers.crm.enabled).toBe(false);
  });

  it('rejects unknown fields at every configuration section', () => {
    expect(
      SystemInstanceConfigSchema.safeParse({
        site: { unknownField: true }
      }).success
    ).toBe(false);
  });

  it('validates cross-field concurrency constraints', () => {
    const result = SystemInstanceConfigSchema.safeParse({
      performance: {
        workflow: {
          maxLoopTimes: 10,
          parallelMaxConcurrency: 11
        }
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['performance', 'workflow', 'parallelMaxConcurrency']
        })
      );
    }
  });

  it('validates enabled provider dependencies', () => {
    const result = SystemInstanceConfigSchema.safeParse({
      providers: {
        crm: { enabled: true }
      }
    });

    expect(result.success).toBe(false);
  });
});

describe('SystemInstanceConfigDocumentSchema', () => {
  it('fills the fixed instance identity and document defaults', () => {
    const document = parseSystemInstanceConfigDocument({});

    expect(document._id).toBe('instance');
    expect(document.schemaVersion).toBe(1);
    expect(document.revision).toBe(0);
    expect(document.createdAt).toBeInstanceOf(Date);
    expect(document.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects a document for another instance or schema version', () => {
    expect(SystemInstanceConfigDocumentSchema.safeParse({ _id: 'another-instance' }).success).toBe(
      false
    );
    expect(SystemInstanceConfigDocumentSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
  });
});

describe('systemInstanceConfigRegistry', () => {
  it('keeps keys unique and marks secret fields', () => {
    const keys = systemInstanceConfigRegistry.map((item) => item.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(systemInstanceConfigRegistry).toContainEqual(
      expect.objectContaining({
        key: 'subservice.aiProxy.token',
        secret: true
      })
    );
  });

  it('only registers paths that exist in the default configuration', () => {
    const config = parseSystemInstanceConfig({}) as unknown as Record<string, unknown>;

    for (const item of systemInstanceConfigRegistry) {
      const value = item.key.split('.').reduce<unknown>((current, key) => {
        if (!current || typeof current !== 'object') return undefined;
        return (current as Record<string, unknown>)[key];
      }, config);

      expect(value, item.key).not.toBeUndefined();
    }
  });

  it('filters commercial fields from the community edition', () => {
    const communityKeys = getSystemInstanceConfigRegistry('community').map((item) => item.key);
    const proKeys = getSystemInstanceConfigRegistry('pro').map((item) => item.key);

    expect(communityKeys).toContain('site.name');
    expect(communityKeys).not.toContain('commercial.showCoupon');
    expect(proKeys).toContain('commercial.showCoupon');
  });
});
