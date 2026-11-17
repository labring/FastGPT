import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { decryptDomainSecrets } from '@fastgpt/service/common/system/systemInstanceConfig/secrets';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { ProEnvConfigSchema } from '@fastgpt/global/common/system/config/proEnv';
import { SYSTEM_INSTANCE_CONFIG_DOMAINS } from '@fastgpt/global/common/system/config/schema';
import * as defaultConfig from '@/migration/tasks/4180/20261116_migrate_system_configs/defaultConfig';
import { readLegacyInstanceConfigEnv } from '@/migration/tasks/4180/20261116_migrate_system_configs/env';
import {
  applyInstanceConfigMigration,
  buildSparseLegacyMigrationPlan,
  inspectInstanceConfigMigration
} from '@/migration/tasks/4180/20261116_migrate_system_configs/service';

// 原子初始化必须使用远端测试库的真实事务，不能沿用全局的无事务替身。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');

afterEach(() => vi.restoreAllMocks());

describe('readDefaultInstanceConfig', () => {
  let directory: string;
  let filePath: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fastgpt-default-config-'));
    filePath = path.join(directory, 'defaultConfig.json');
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('treats an absent optional file as no deployment overrides', async () => {
    await expect(defaultConfig.readDefaultInstanceConfig(filePath)).resolves.toEqual({});
  });

  it('reads current domain fields and preserves explicit empty and default values', async () => {
    const input = {
      site: { name: 'Custom', description: '', navbarItems: [] },
      security: { checkExternalFile: false },
      providers: { documentParse: { customPdf: { price: 0 } } }
    };
    await fs.writeFile(filePath, JSON.stringify(input));
    await expect(defaultConfig.readDefaultInstanceConfig(filePath)).resolves.toEqual(input);
  });

  it.each([
    '{invalid-json: secret-value}',
    '[]',
    '{"feConfigs":{"systemTitle":"secret-value"}}',
    '{"proEnv":{"teamMode":"multi"}}',
    '{"providers":{"documentParse":{"customPdf":{"price":-1,"key":"secret-value"}}}}',
    '{"performance":{"workflow":{"parallelMaxConcurrency":10000}}}'
  ])(
    'rejects malformed or invalid configuration without exposing its contents',
    async (content) => {
      await fs.writeFile(filePath, content);
      const error = await defaultConfig.readDefaultInstanceConfig(filePath).catch((error) => error);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Invalid defaultConfig.json');
      expect(error.message).not.toContain('secret-value');
    }
  );

  it('does not silently ignore a file read failure', async () => {
    vi.spyOn(fs, 'readFile').mockRejectedValueOnce({ code: 'EACCES' });
    await expect(defaultConfig.readDefaultInstanceConfig(filePath)).rejects.toThrow(
      'Unable to read defaultConfig.json'
    );
  });
});

describe('first instance configuration initialization', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  beforeEach(async () => {
    await MongoSystemInstanceConfig.createIndexes();
  });

  it('encrypts file secrets in the atomic initial insert', async () => {
    await defaultConfig.initializeEmptyInstanceConfig({
      overrides: {
        auth: { loginProviders: { github: { secret: 'file-github-secret' } } },
        providers: { documentParse: { customPdf: { key: 'file-pdf-secret' } } }
      }
    });

    const auth = await MongoSystemInstanceConfig.findOne({ domain: 'auth' }).lean();
    const providers = await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean();
    expect(auth?.overrides.loginProviders.github.secret).toEqual({ secret: expect.any(String) });
    expect(providers?.overrides.documentParse.customPdf.key).toEqual({
      secret: expect.any(String)
    });
    expect(decryptDomainSecrets('auth', auth?.overrides).loginProviders.github.secret).toBe(
      'file-github-secret'
    );
    expect(
      decryptDomainSecrets('providers', providers?.overrides).documentParse.customPdf.key
    ).toBe('file-pdf-secret');
  });

  it.each([{ key: 'synthetic-legacy-key' }, { url: 'https://legacy.example.test' }])(
    'does not assemble PDF credentials across the file and legacy sources: %j',
    (legacy) => {
      const plan = buildSparseLegacyMigrationPlan({
        feConfigs: {},
        systemEnv: { customPdfParse: legacy },
        defaults: {
          providers: {
            documentParse: {
              customPdf: { url: 'https://file.example.test', key: 'synthetic-file-key', price: 2 }
            }
          }
        }
      });
      expect(plan.overrides.providers?.documentParse?.customPdf).toEqual({ ...legacy, price: 2 });
    }
  );

  it('merges file defaults below legacy data, prunes defaults and only imports the file once', async () => {
    const readFile = vi.spyOn(defaultConfig, 'readDefaultInstanceConfig').mockResolvedValue({
      site: { name: 'File title', docUrl: 'https://docs.example.test' },
      security: { checkExternalFile: false, fileUrlWhitelist: ['example.test'] },
      providers: { documentParse: { customPdf: { price: 0 } } }
    });
    await MongoSystemConfigs.create({
      type: SystemConfigsTypeEnum.fastgpt,
      value: { feConfigs: { systemTitle: 'Database title' }, systemEnv: {} }
    });

    const inspection = await inspectInstanceConfigMigration();
    expect(inspection.initialization?.overrides.site).toMatchObject({
      name: 'Database title',
      docUrl: 'https://docs.example.test'
    });
    expect(inspection.initialization?.overrides.providers).toBeUndefined();
    expect(inspection.initialization?.explicitDefaultPaths?.providers).toContain(
      'documentParse.customPdf.price'
    );
    await applyInstanceConfigMigration({
      overrides: inspection.overrides,
      explicitDefaultPaths: inspection.explicitDefaultPaths,
      initialization: inspection.initialization,
      logger
    });

    const security = await MongoSystemInstanceConfig.findOne({ domain: 'security' }).lean();
    expect(security?.explicitDefaultPaths).toContain('checkExternalFile');
    expect(await MongoSystemInstanceConfig.countDocuments()).toBe(
      SYSTEM_INSTANCE_CONFIG_DOMAINS.length
    );
    readFile.mockClear().mockRejectedValue(new Error('Must not read an initialized instance'));
    const next = await inspectInstanceConfigMigration();
    expect(next.initialization).toBeUndefined();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('skips the initial file import as soon as any existing domain is present', async () => {
    await MongoSystemInstanceConfig.create({ domain: 'site', overrides: { name: 'Existing' } });
    const created = await defaultConfig.initializeEmptyInstanceConfig({
      overrides: { site: { name: 'File title' }, feature: { enableTeamModel: true } }
    });
    expect(created).toEqual([]);
    expect(await MongoSystemInstanceConfig.countDocuments()).toBe(1);
    const site = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    expect(site?.overrides).toEqual({ name: 'Existing' });
  });

  it('initializes all domains once when multiple App instances start concurrently', async () => {
    const plan = buildSparseLegacyMigrationPlan({
      feConfigs: {},
      systemEnv: {},
      defaults: { site: { name: 'File title' } }
    });
    const results = await Promise.all([
      defaultConfig.initializeEmptyInstanceConfig(plan),
      defaultConfig.initializeEmptyInstanceConfig(plan)
    ]);
    expect(results.flat()).toHaveLength(SYSTEM_INSTANCE_CONFIG_DOMAINS.length);
    expect(await MongoSystemInstanceConfig.countDocuments()).toBe(
      SYSTEM_INSTANCE_CONFIG_DOMAINS.length
    );
  });

  it('imports file defaults atomically when Pro creates its scope before App starts', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'proEnv',
      revision: 7,
      overrides: ProEnvConfigSchema.parse({ teamMode: 'multi' })
    });
    const proBefore = await MongoSystemInstanceConfig.findOne({ domain: 'proEnv' }).lean();
    expect(proBefore).toMatchObject({
      domain: 'proEnv',
      revision: 7,
      updatedAt: expect.any(Date),
      overrides: {
        teamMode: 'multi',
        ssoUrl: '',
        login2faEnabled: false,
        show_workorder: false,
        show_enterprise_auth: false,
        showWecomConfig: false
      }
    });
    const readFile = vi.spyOn(defaultConfig, 'readDefaultInstanceConfig').mockResolvedValue({
      site: { docUrl: 'https://docs.example.test' }
    });
    const legacyPublicUrl = readLegacyInstanceConfigEnv().FE_DOMAIN;
    const expectedSite = {
      docUrl: 'https://docs.example.test',
      ...(legacyPublicUrl ? { publicUrl: legacyPublicUrl } : {})
    };

    const inspection = await inspectInstanceConfigMigration();
    expect(readFile).toHaveBeenCalledOnce();
    expect(inspection.existingDomainCount).toBe(0);
    expect(inspection.missingDomainCount).toBe(SYSTEM_INSTANCE_CONFIG_DOMAINS.length);
    expect(inspection.initialization?.overrides.site).toEqual(expectedSite);
    const plan = inspection.initialization;
    if (!plan) throw new Error('Expected file initialization plan');

    // 多个 App 同时启动时只能提交一套完整业务域，文件默认值也必须保留。
    const results = await Promise.all([
      defaultConfig.initializeEmptyInstanceConfig(plan),
      defaultConfig.initializeEmptyInstanceConfig(plan)
    ]);
    expect(results.flat()).toHaveLength(SYSTEM_INSTANCE_CONFIG_DOMAINS.length);
    expect(results.flat()).toEqual(expect.arrayContaining([...SYSTEM_INSTANCE_CONFIG_DOMAINS]));
    const docs = await MongoSystemInstanceConfig.find().lean();
    expect(docs).toHaveLength(SYSTEM_INSTANCE_CONFIG_DOMAINS.length + 1);
    expect(docs.map((doc) => doc.domain)).toEqual(
      expect.arrayContaining([...SYSTEM_INSTANCE_CONFIG_DOMAINS, 'proEnv'])
    );
    expect(docs.find((doc) => doc.domain === 'site')?.overrides).toEqual(expectedSite);
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'proEnv' }).lean()).toEqual(proBefore);
  });

  it('rolls back a partial insert and succeeds on a fresh retry', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'proEnv',
      revision: 7,
      overrides: ProEnvConfigSchema.parse({ teamMode: 'multi' })
    });
    const proBefore = await MongoSystemInstanceConfig.findOne({ domain: 'proEnv' }).lean();
    const insertMany = MongoSystemInstanceConfig.insertMany.bind(MongoSystemInstanceConfig);
    vi.spyOn(MongoSystemInstanceConfig, 'insertMany').mockImplementationOnce(
      async (docs, options) => {
        await insertMany(docs.slice(0, 1), options);
        throw new Error('Synthetic initialization failure');
      }
    );
    const plan = { overrides: { site: { name: 'File title' } } };
    await expect(defaultConfig.initializeEmptyInstanceConfig(plan)).rejects.toThrow(
      'Synthetic initialization failure'
    );
    // 初始化失败只回滚新增业务域，不影响事务前已有的 Pro 配置。
    expect(await MongoSystemInstanceConfig.countDocuments()).toBe(1);
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'proEnv' }).lean()).toEqual(proBefore);
    await expect(defaultConfig.initializeEmptyInstanceConfig(plan)).resolves.toHaveLength(
      SYSTEM_INSTANCE_CONFIG_DOMAINS.length
    );
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'proEnv' }).lean()).toEqual(proBefore);
  });
});
