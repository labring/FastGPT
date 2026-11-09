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

    expect(getDomainDefaultConfig('resource').datasetArchive).toEqual({
      maxFiles: 2000,
      maxSourceSizeMiB: 2048,
      maxConcurrency: 4,
      prepareTimeoutSeconds: 300
    });

    const vectorConfig = getDomainDefaultConfig('vector');
    expect(vectorConfig.hnswEfSearch).toBe(200);
    expect(vectorConfig).not.toHaveProperty('hnswMaxScanTuples');
  });

  it('validates sparse overrides and rejects unknown fields in root and nested objects', () => {
    // Valid sparse override
    const parsed = parseDomainOverrides({ domain: 'site', overrides: { name: 'Custom Site' } });
    expect(parsed.name).toBe('Custom Site');
    expect(parsed.description).toBeUndefined();

    // Rejects unknown field on top level of domain
    expect(() =>
      parseDomainOverrides({ domain: 'site', overrides: { unknownKey: true } })
    ).toThrow();

    // Rejects unknown field in deep nested object
    expect(() =>
      parseDomainOverrides({
        domain: 'performance',
        overrides: {
          workflow: {
            unknownWorkflowKey: 123
          }
        }
      })
    ).toThrow();

    expect(() =>
      parseDomainOverrides({
        domain: 'providers',
        overrides: {
          documentParse: {
            customPdf: {
              unknownPdfKey: 'foo'
            }
          }
        }
      })
    ).toThrow();
  });

  it('strips unknown fields in lenient mode (strict: false) to prevent startup deadlocks', () => {
    // 模拟数据库中包含废弃字段时（清理迁移前），lenient 模式剥离未知字段并安全解析
    const parsed = parseDomainOverrides({
      domain: 'site',
      overrides: { name: 'Custom Site', legacyDeprecatedField: 'ignored' },
      options: { strict: false }
    });
    expect(parsed.name).toBe('Custom Site');
    expect((parsed as any).legacyDeprecatedField).toBeUndefined();

    const effective = resolveDomainEffectiveConfig({
      domain: 'site',
      overrides: { name: 'Custom Site', legacyDeprecatedField: 'ignored' },
      options: { strict: false }
    });
    expect(effective.name).toBe('Custom Site');

    // 递归支持：数组元素内的废弃字段同样在 lenient 模式下被安全剥离（如 navbarItems）
    const parsedArray = parseDomainOverrides({
      domain: 'site',
      overrides: {
        navbarItems: [
          { id: 'nav1', name: 'Nav', avatar: '', url: 'https://nav.com', legacyKey: 'drop_me' }
        ]
      },
      options: { strict: false }
    });
    expect(parsedArray.navbarItems?.[0]).toEqual({
      id: 'nav1',
      name: 'Nav',
      avatar: '',
      url: 'https://nav.com'
    });

    // 默认 strict 模式下，数组元素内的未知字段依然被严格拒绝
    expect(() =>
      parseDomainOverrides({
        domain: 'site',
        overrides: {
          navbarItems: [{ id: 'nav1', name: 'Nav', avatar: '', url: 'https://nav.com', badKey: 1 }]
        }
      })
    ).toThrow();
  });
});

describe('resolveDomainEffectiveConfig (Two-Phase Validation & Merge)', () => {
  it.each(['maxFiles', 'maxSourceSizeMiB', 'maxConcurrency', 'prepareTimeoutSeconds'])(
    '归档参数 %s 允许稀疏保存且必须为正整数',
    (field) => {
      const config = resolveDomainEffectiveConfig({
        domain: 'resource',
        overrides: { datasetArchive: { [field]: 1 } }
      });
      expect(config.datasetArchive).toEqual({
        ...getDomainDefaultConfig('resource').datasetArchive,
        [field]: 1
      });
      for (const value of [0, 1.5]) {
        expect(() =>
          parseDomainOverrides({
            domain: 'resource',
            overrides: { datasetArchive: { [field]: value } }
          })
        ).toThrow();
      }
    }
  );

  it('merges overrides with defaults while preserving untouched default fields', () => {
    const effective = resolveDomainEffectiveConfig({
      domain: 'site',
      overrides: {
        name: 'Custom FastGPT',
        description: 'Modified description'
      }
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
      resolveDomainEffectiveConfig({
        domain: 'performance',
        overrides: {
          workflow: {
            maxLoopTimes: 5
          }
        }
      })
    ).toThrowError(/parallelMaxConcurrency cannot exceed maxLoopTimes/);

    // Both updated compatibly -> must succeed
    const valid = resolveDomainEffectiveConfig({
      domain: 'performance',
      overrides: {
        workflow: {
          maxLoopTimes: 5,
          parallelMaxConcurrency: 5
        }
      }
    });
    expect(valid.workflow.maxLoopTimes).toBe(5);
    expect(valid.workflow.parallelMaxConcurrency).toBe(5);
  });

  it('accepts legacy zero values that mean disable/unlimited at the consumer', () => {
    // 旧 env IntSchema 允许 0，且这些字段的消费点对 0 有明确"禁用/不限"语义
    // （maxRunTimes<=0 停止工作流、maxLoopTimes=0 拒绝循环输入、!qpm 放行限流），
    // 迁移必须原样保留 0，否则会把客户的禁用配置静默改回默认启用值。
    const zeroed = resolveDomainEffectiveConfig({
      domain: 'performance',
      overrides: {
        workflow: { maxRunTimes: 0, maxLoopTimes: 0 },
        chat: { maxQpm: 0 },
        parse: { maxHtmlTransformChars: 0 }
      }
    });
    expect(zeroed.workflow.maxRunTimes).toBe(0);
    expect(zeroed.workflow.maxLoopTimes).toBe(0);
    expect(zeroed.chat.maxQpm).toBe(0);
    expect(zeroed.parse.maxHtmlTransformChars).toBe(0);

    // maxLoopTimes=0 表示禁用循环，并行约束此时无意义，不得连带拒绝整个 performance 域
    expect(() =>
      resolveDomainEffectiveConfig({
        domain: 'performance',
        overrides: {
          workflow: { maxLoopTimes: 0 }
        }
      })
    ).not.toThrow();
  });

  it('still rejects negative values for zero-tolerant fields', () => {
    expect(() =>
      parseDomainOverrides({ domain: 'performance', overrides: { workflow: { maxRunTimes: -1 } } })
    ).toThrowError();
    expect(() =>
      parseDomainOverrides({ domain: 'performance', overrides: { chat: { maxQpm: -5 } } })
    ).toThrowError();
  });

  it('validates documentParse providers and constraints', () => {
    // somark does not require customPdf.url
    const somarkConfig = resolveDomainEffectiveConfig({
      domain: 'providers',
      overrides: {
        documentParse: {
          provider: 'somark',
          customPdf: {
            somarkApiKey: 'sk-somark-xxx'
          }
        }
      }
    });
    expect(somarkConfig.documentParse.provider).toBe('somark');
    expect(somarkConfig.documentParse.customPdf.somarkApiKey).toBe('sk-somark-xxx');

    // doc2x does not require customPdf.url
    const doc2xConfig = resolveDomainEffectiveConfig({
      domain: 'providers',
      overrides: {
        documentParse: {
          provider: 'doc2x',
          customPdf: {
            doc2xKey: 'doc2x-xxx'
          }
        }
      }
    });
    expect(doc2xConfig.documentParse.provider).toBe('doc2x');

    // textln & textin are supported
    const textlnConfig = resolveDomainEffectiveConfig({
      domain: 'providers',
      overrides: {
        documentParse: {
          provider: 'textln',
          customPdf: {
            textinAppId: 'app-id',
            textinSecretCode: 'secret-code'
          }
        }
      }
    });
    expect(textlnConfig.documentParse.provider).toBe('textln');

    // customPdf requires url
    expect(() =>
      resolveDomainEffectiveConfig({
        domain: 'providers',
        overrides: {
          documentParse: {
            provider: 'customPdf',
            customPdf: {
              url: ''
            }
          }
        }
      })
    ).toThrow();

    // custom requires url
    expect(() =>
      resolveDomainEffectiveConfig({
        domain: 'providers',
        overrides: {
          documentParse: {
            provider: 'custom',
            customPdf: {
              url: ''
            }
          }
        }
      })
    ).toThrow();

    // valid customPdf
    const customConfig = resolveDomainEffectiveConfig({
      domain: 'providers',
      overrides: {
        documentParse: {
          provider: 'customPdf',
          customPdf: {
            url: 'https://pdf.example.com',
            key: 'key-123'
          }
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
      domain: 'site',
      overrides: { name: 'Custom Name' }
    });

    expect(doc.domain).toBe('site');
    expect(doc.schemaVersion).toBe(1);
    expect(doc.revision).toBe(0);
    expect(doc.overrides).toEqual({ name: 'Custom Name' });
    expect(doc.createdAt).toBeInstanceOf(Date);
  });

  it('rejects an invalid domain key', () => {
    expect(() =>
      parseSystemInstanceDomainDocument({
        domain: 'non-existing-domain',
        overrides: {}
      })
    ).toThrow();
  });

  it('rejects a document missing the domain field', () => {
    // _id 由 MongoDB 自动生成，domain 是唯一寻址键，缺失必须拒绝
    expect(() =>
      parseSystemInstanceDomainDocument({
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
        key: 'subservice.agentSandbox.opensandbox.apiKey',
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
    expect(() =>
      parseDomainOverrides({ domain: 'feature', overrides: { datasetSynonymEnabled: true } })
    ).toThrow();
  });

  it('filters commercial fields by edition and SaaS boundary', () => {
    const communityKeys = getSystemInstanceConfigRegistry('community').map((item) => item.key);
    // 私有化 Pro 不展示 SaaS 运营专用字段，需 ENABLE_SAAS_ADMIN_CONFIG 才进入表单
    const proKeys = getSystemInstanceConfigRegistry('pro').map((item) => item.key);
    const saasProKeys = getSystemInstanceConfigRegistry('pro', {
      enableSaasAdminConfig: true
    }).map((item) => item.key);

    expect(communityKeys).toContain('site.name');
    expect(communityKeys).not.toContain('commercial.showCoupon');
    expect(proKeys).not.toContain('commercial.showCoupon');
    expect(saasProKeys).toContain('commercial.showCoupon');
  });
  it('checks subservice resolveDomainEffectiveConfig errors', () => {
    try {
      resolveDomainEffectiveConfig({
        domain: 'subservice',
        overrides: {
          agentSandbox: {
            provider: 'sealosdevbox',
            sealosdevbox: { baseUrl: '', token: '', image: '' }
          }
        }
      });
    } catch (e: any) {
      console.error('SEALOS_FAIL:', e.message);
    }

    try {
      resolveDomainEffectiveConfig({
        domain: 'subservice',
        overrides: {
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
    const config = resolveDomainEffectiveConfig({
      domain: 'subservice',
      overrides: withPrefix('fastgpt-session')
    });
    expect(config.agentSandbox.opensandbox.volumeNamePrefix).toBe('fastgpt-session');
  });

  it('rejects prefixes with uppercase, underscore, or dot (must match runtime volume name rules)', () => {
    // 运行时 createSessionVolumeName 会对 `${prefix}-${id}` 做 DNS label 校验，
    // 管理端必须提前拒绝非法前缀，否则保存成功但沙箱启动才报错。
    expect(() =>
      resolveDomainEffectiveConfig({ domain: 'subservice', overrides: withPrefix('FastGPT') })
    ).toThrow();
    expect(() =>
      resolveDomainEffectiveConfig({ domain: 'subservice', overrides: withPrefix('fast_gpt') })
    ).toThrow();
    expect(() =>
      resolveDomainEffectiveConfig({ domain: 'subservice', overrides: withPrefix('fast.gpt') })
    ).toThrow();
  });

  it('rejects a prefix that does not end with an alphanumeric character', () => {
    expect(() =>
      resolveDomainEffectiveConfig({ domain: 'subservice', overrides: withPrefix('fastgpt-') })
    ).toThrow();
  });
});
