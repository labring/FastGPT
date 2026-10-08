import { describe, expect, it } from 'vitest';
import {
  getDomainDefaultConfig,
  parseDomainOverrides,
  resolveDomainEffectiveConfig,
  resolveSystemInstanceConfig,
  parseSystemInstanceConfig,
  parseSystemInstanceDomainDocument
} from '@fastgpt/global/common/system/config/schema';
import { deepMergeConfig, pruneDefaultOverrides } from '@fastgpt/global/common/system/config/merge';
import {
  getSystemInstanceConfigRegistry,
  systemInstanceConfigRegistry
} from '@fastgpt/global/common/system/config/registry';

describe('Domain default config and overrides validation', () => {
  it('returns complete default config for any domain', () => {
    const siteConfig = getDomainDefaultConfig('site');
    expect(siteConfig.name).toBe('AI');
    expect(siteConfig.docUrl).toBe('https://doc.fastgpt.io');

    const performanceConfig = getDomainDefaultConfig('performance');
    expect(performanceConfig.workflow.parallelMaxConcurrency).toBe(10);
    expect(performanceConfig.dataset.retrievalResultsLimit).toBe(0);
  });

  it('validates sparse overrides and rejects unknown fields in root and nested objects', () => {
    // Valid sparse override
    const parsed = parseDomainOverrides('site', { name: 'Custom Site' });
    expect(parsed.name).toBe('Custom Site');
    expect(parsed.description).toBeUndefined();

    // Rejects unknown field on top level of domain
    expect(() => parseDomainOverrides('site', { unknownKey: true })).toThrow();

    // Rejects unknown field in deep nested object
    expect(() =>
      parseDomainOverrides('performance', {
        workflow: {
          unknownWorkflowKey: 123
        }
      })
    ).toThrow();

    expect(() =>
      parseDomainOverrides('providers', {
        documentParse: {
          customPdf: {
            unknownPdfKey: 'foo'
          }
        }
      })
    ).toThrow();
  });
});

describe('resolveDomainEffectiveConfig (Two-Phase Validation & Merge)', () => {
  it('merges overrides with defaults while preserving untouched default fields', () => {
    const effective = resolveDomainEffectiveConfig('site', {
      name: 'Custom FastGPT',
      description: 'Modified description'
    });

    expect(effective.name).toBe('Custom FastGPT');
    expect(effective.description).toBe('Modified description');
    // untouched fields retain code defaults
    expect(effective.docUrl).toBe('https://doc.fastgpt.io');
    expect(effective.name).toBe('Custom FastGPT');
  });

  it('enforces cross-field superRefine constraints on merged result', () => {
    // parallelMaxConcurrency (default 10) > maxLoopTimes (override to 5) -> must fail!
    expect(() =>
      resolveDomainEffectiveConfig('performance', {
        workflow: {
          maxLoopTimes: 5
        }
      })
    ).toThrowError(/parallelMaxConcurrency cannot exceed maxLoopTimes/);

    // Both updated compatibly -> must succeed
    const valid = resolveDomainEffectiveConfig('performance', {
      workflow: {
        maxLoopTimes: 5,
        parallelMaxConcurrency: 5
      }
    });
    expect(valid.workflow.maxLoopTimes).toBe(5);
    expect(valid.workflow.parallelMaxConcurrency).toBe(5);
  });

  it('validates documentParse providers and constraints', () => {
    // somark does not require customPdf.url
    const somarkConfig = resolveDomainEffectiveConfig('providers', {
      documentParse: {
        provider: 'somark',
        customPdf: {
          somarkApiKey: 'sk-somark-xxx'
        }
      }
    });
    expect(somarkConfig.documentParse.provider).toBe('somark');
    expect(somarkConfig.documentParse.customPdf.somarkApiKey).toBe('sk-somark-xxx');

    // doc2x does not require customPdf.url
    const doc2xConfig = resolveDomainEffectiveConfig('providers', {
      documentParse: {
        provider: 'doc2x',
        customPdf: {
          doc2xKey: 'doc2x-xxx'
        }
      }
    });
    expect(doc2xConfig.documentParse.provider).toBe('doc2x');

    // textln & textin are supported
    const textlnConfig = resolveDomainEffectiveConfig('providers', {
      documentParse: {
        provider: 'textln',
        customPdf: {
          textinAppId: 'app-id',
          textinSecretCode: 'secret-code'
        }
      }
    });
    expect(textlnConfig.documentParse.provider).toBe('textln');

    // customPdf requires url
    expect(() =>
      resolveDomainEffectiveConfig('providers', {
        documentParse: {
          provider: 'customPdf',
          customPdf: {
            url: ''
          }
        }
      })
    ).toThrow();

    // custom requires url
    expect(() =>
      resolveDomainEffectiveConfig('providers', {
        documentParse: {
          provider: 'custom',
          customPdf: {
            url: ''
          }
        }
      })
    ).toThrow();

    // valid customPdf
    const customConfig = resolveDomainEffectiveConfig('providers', {
      documentParse: {
        provider: 'customPdf',
        customPdf: {
          url: 'https://pdf.example.com',
          key: 'key-123'
        }
      }
    });
    expect(customConfig.documentParse.provider).toBe('customPdf');
    expect(customConfig.documentParse.customPdf.url).toBe('https://pdf.example.com');
  });
});

describe('deepMergeConfig and pruneDefaultOverrides', () => {
  it('deep merges nested objects without altering unmodified fields or concatenating arrays', () => {
    const defaults = {
      nested: { a: 1, b: 2 },
      list: ['orig1', 'orig2'],
      flag: false
    };

    const overrides = {
      nested: { b: 20 },
      list: ['new1'],
      flag: true
    };

    const merged = deepMergeConfig(defaults, overrides);
    expect(merged).toEqual({
      nested: { a: 1, b: 20 },
      list: ['new1'],
      flag: true
    });
  });

  it('prunes redundant overrides that equal defaults', () => {
    const defaults = {
      a: 1,
      nested: { b: 2, c: 3 }
    };

    const overrides = {
      a: 1, // redundant
      nested: {
        b: 2, // redundant
        c: 30 // kept
      }
    };

    const pruned = pruneDefaultOverrides(overrides, defaults);
    expect(pruned).toEqual({
      nested: { c: 30 }
    });
  });
});

describe('resolveSystemInstanceConfig', () => {
  it('aggregates all 11 domains into a complete instance configuration', () => {
    const fullConfig = resolveSystemInstanceConfig({
      site: { name: 'My AI' },
      performance: { workflow: { maxRunTimes: 800 } }
    });

    expect(fullConfig.site.name).toBe('My AI');
    expect(fullConfig.site.openApiPrefix).toBe('fastgpt');
    expect(fullConfig.performance.workflow.maxRunTimes).toBe(800);
    expect(fullConfig.subservice.agentSandbox.provider).toBe('none');
    expect(fullConfig.security.csrfEnabled).toBe(true);
  });
});

describe('SystemInstanceDomainDocumentSchema', () => {
  it('validates a domain document structure', () => {
    const doc = parseSystemInstanceDomainDocument({
      _id: 'site',
      overrides: { name: 'Custom Name' }
    });

    expect(doc._id).toBe('site');
    expect(doc.schemaVersion).toBe(1);
    expect(doc.revision).toBe(0);
    expect(doc.overrides).toEqual({ name: 'Custom Name' });
    expect(doc.createdAt).toBeInstanceOf(Date);
  });

  it('rejects an invalid domain key as _id', () => {
    expect(() =>
      parseSystemInstanceDomainDocument({
        _id: 'non-existing-domain',
        overrides: {}
      })
    ).toThrow();
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

  it('covers all leaf configuration fields in the registry', () => {
    const config = parseSystemInstanceConfig({}) as unknown as Record<string, unknown>;

    const getLeafPaths = (obj: Record<string, unknown>, prefix = ''): string[] => {
      const paths: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          paths.push(...getLeafPaths(value as Record<string, unknown>, currentPath));
        } else {
          paths.push(currentPath);
        }
      }
      return paths;
    };

    const leafPaths = getLeafPaths(config);
    const registryKeys = new Set(systemInstanceConfigRegistry.map((item) => item.key));

    for (const leafPath of leafPaths) {
      expect(registryKeys.has(leafPath), `Missing registry entry for ${leafPath}`).toBe(true);
    }
    expect(registryKeys.size).toBe(leafPaths.length);
  });

  it('filters commercial fields from the community edition', () => {
    const communityKeys = getSystemInstanceConfigRegistry('community').map((item) => item.key);
    const proKeys = getSystemInstanceConfigRegistry('pro').map((item) => item.key);

    expect(communityKeys).toContain('site.name');
    expect(communityKeys).not.toContain('commercial.showCoupon');
    expect(proKeys).toContain('commercial.showCoupon');
  });
  it('checks subservice resolveDomainEffectiveConfig errors', () => {
    try {
      resolveDomainEffectiveConfig('subservice', {
        agentSandbox: {
          provider: 'sealosdevbox',
          sealosdevbox: { baseUrl: '', token: '', image: '' }
        }
      });
    } catch (e: any) {
      console.error('SEALOS_FAIL:', e.message);
    }

    try {
      resolveDomainEffectiveConfig('subservice', {
        agentSandbox: {
          provider: 'opensandbox',
          opensandbox: {
            baseUrl: '',
            apiKey: '',
            image: '',
            volumeManagerToken: '',
            volumeManagerUrl: ''
          }
        }
      });
    } catch (e: any) {
      console.error('OPEN_FAIL:', e.message);
    }
  });
});

describe('agentSandbox.opensandbox.volumeNamePrefix validation', () => {
  const withPrefix = (volumeNamePrefix: string) => ({
    agentSandbox: { opensandbox: { volumeNamePrefix } }
  });

  it('accepts a DNS-label-safe prefix', () => {
    const config = resolveDomainEffectiveConfig('subservice', withPrefix('fastgpt-session'));
    expect(config.agentSandbox.opensandbox.volumeNamePrefix).toBe('fastgpt-session');
  });

  it('rejects prefixes with uppercase, underscore, or dot (must match runtime volume name rules)', () => {
    // 运行时 createSessionVolumeName 会对 `${prefix}-${id}` 做 DNS label 校验，
    // 管理端必须提前拒绝非法前缀，否则保存成功但沙箱启动才报错。
    expect(() => resolveDomainEffectiveConfig('subservice', withPrefix('FastGPT'))).toThrow();
    expect(() => resolveDomainEffectiveConfig('subservice', withPrefix('fast_gpt'))).toThrow();
    expect(() => resolveDomainEffectiveConfig('subservice', withPrefix('fast.gpt'))).toThrow();
  });

  it('rejects a prefix that does not end with an alphanumeric character', () => {
    expect(() => resolveDomainEffectiveConfig('subservice', withPrefix('fastgpt-'))).toThrow();
  });
});
