import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/schema';
import { MongoSystemConfigs } from '../../../../common/system/config/schema';
import { systemInstanceConfig } from '../../../../common/system/systemInstanceConfig/service';
import {
  getSystemConfigRuntimeState,
  getSystemInstanceConfig
} from '../../../../common/system/systemInstanceConfig/runtime';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const license = {
  schemaVersion: 2 as const,
  licenseType: 'official' as const,
  company: 'synthetic',
  startTime: '2020-01-01T00:00:00.000Z',
  expiredTime: '2030-01-01T00:00:00.000Z',
  limits: { maxUsers: 0, maxApps: 0, maxDatasets: 0 },
  functions: {
    sso: true,
    pay: true,
    eval: true,
    datasetEnhance: true,
    assistantGenerate: true,
    portal: true,
    sandboxSkills: true
  }
};

beforeEach(() => {
  global.systemInstanceConfig = resolveSystemInstanceConfig();
  getSystemConfigRuntimeState().rejectedLicense = undefined;
  getSystemConfigRuntimeState().frontendContext = { commercialService: true };
});
afterEach(() => vi.restoreAllMocks());

describe('SystemInstanceConfigManager', () => {
  it('keeps stored Pro data inactive in community mode and restores it when a Pro process loads the same scopes', async () => {
    await MongoSystemInstanceConfig.create([
      { domain: 'proEnv', revision: 1, overrides: { teamMode: 'multi' } },
      {
        domain: 'commercial',
        revision: 1,
        overrides: { subPlans: { extraDatasetSize: { price: 7 } } }
      },
      { domain: 'license', revision: 1, overrides: { data: license } },
      {
        domain: 'feature',
        revision: 1,
        overrides: {
          agentEngine: 'piAgent',
          multipleDataToBase64: true,
          hideChatCopyrightSetting: true,
          enableTeamPluginUpload: true,
          enableTeamModel: true,
          showComplianceCopywriting: true,
          showDatasetFeishu: false,
          showDatasetYuque: false,
          showDatasetDingtalk: false,
          showPublishWecom: true,
          showPublishWechat: false
        }
      }
    ]);
    systemInstanceConfig.setFrontendContext({ commercialService: false });
    const community = await systemInstanceConfig.refresh();
    expect(community.proEnv.teamMode).toBe('single');
    expect(community.commercial.subPlans).toBeUndefined();
    expect(community.license.data).toBeUndefined();
    expect(getSystemInstanceConfig().feature).toMatchObject({
      agentEngine: 'piAgent',
      multipleDataToBase64: true,
      hideChatCopyrightSetting: false,
      enableTeamPluginUpload: false,
      enableTeamModel: false,
      showComplianceCopywriting: false,
      showDatasetFeishu: true,
      showDatasetYuque: true,
      showDatasetDingtalk: true,
      showPublishFeishu: false,
      showPublishDingtalk: false,
      showPublishWecom: false,
      showPublishOffiaccount: false,
      showPublishWechat: true
    });
    expect(global.feConfigs.enable_team_plugin_upload).toBe(false);
    expect(global.feConfigs.show_publish_wechat).toBe(true);
    systemInstanceConfig.setFrontendContext({ commercialService: true });
    const pro = await systemInstanceConfig.refresh();
    expect(pro.proEnv.teamMode).toBe('multi');
    expect(pro.commercial.subPlans?.extraDatasetSize?.price).toBe(7);
    expect(pro.license.data).toEqual(license);
    expect(pro.feature.enableTeamPluginUpload).toBe(true);
    expect(pro.feature.enableTeamModel).toBe(true);
    expect(pro.feature.showDatasetFeishu).toBe(false);
    expect(pro.feature.showPublishWechat).toBe(false);
  });
  it('joins an outer write transaction without publishing uncommitted state', async () => {
    const previous = systemInstanceConfig.get();
    await expect(
      mongoSessionRun(async (session) => {
        await systemInstanceConfig.update(
          {
            items: [{ domain: 'site', expectedRevision: 0, overrides: { name: 'uncommitted' } }],
            actor: { actor: 'admin' }
          },
          session
        );
        expect(systemInstanceConfig.get()).toBe(previous);
        expect(
          await MongoSystemInstanceConfig.countDocuments({ domain: 'site' }).session(session)
        ).toBe(1);
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');
    expect(await MongoSystemInstanceConfig.countDocuments({ domain: 'site' })).toBe(0);
    expect(systemInstanceConfig.get()).toBe(previous);
  });
  it('merges consecutive updates from the same outer transaction before publishing', async () => {
    const previous = systemInstanceConfig.get();
    await mongoSessionRun(async (session) => {
      await systemInstanceConfig.update(
        {
          items: [{ domain: 'site', expectedRevision: 0, overrides: { name: 'first' } }],
          actor: { actor: 'admin' }
        },
        session
      );
      await systemInstanceConfig.update(
        {
          items: [
            { domain: 'site', expectedRevision: 1, overrides: { description: 'second' } },
            { domain: 'security', expectedRevision: 0, overrides: { checkExternalFile: true } }
          ],
          actor: { actor: 'admin' }
        },
        session
      );
      expect(systemInstanceConfig.get()).toBe(previous);
    });
    const doc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    expect(doc).toMatchObject({ revision: 2, overrides: { name: 'first', description: 'second' } });
    expect(systemInstanceConfig.get()).toBe(previous);
    const current = await systemInstanceConfig.refresh();
    expect(current.site).toMatchObject({ name: 'first', description: 'second' });
    expect(current.security.checkExternalFile).toBe(true);
  });
  it('loads all scopes with defaults without consulting migration state or importing old snapshots', async () => {
    await MongoSystemConfigs.create({
      type: 'fastgpt',
      value: { feConfigs: { systemTitle: 'old' } }
    });
    await MongoSystemInstanceConfig.create([
      { domain: 'site', revision: 1, overrides: { name: 'new' } },
      {
        domain: 'commercial',
        revision: 1,
        overrides: { subPlans: { extraDatasetSize: { price: 4 } } }
      },
      {
        domain: 'operations',
        revision: 1,
        overrides: { systemMsgModal: { id: '1', content: 'hello' } }
      },
      { domain: 'proEnv', revision: 1, overrides: { teamMode: 'multi' } }
    ]);
    const legacyRead = vi.spyOn(MongoSystemConfigs, 'findOne');
    const config = await systemInstanceConfig.initialize();
    expect(Object.keys(config)).toHaveLength(17);
    expect(config).toBe(global.systemInstanceConfig);
    expect(systemInstanceConfig.get()).toBe(getSystemInstanceConfig());
    expect(config.site.name).toBe('new');
    expect(config.commercial.subPlans?.extraDatasetSize?.price).toBe(4);
    expect(config.operations.systemMsgModal?.content).toBe('hello');
    expect(config.proEnv.teamMode).toBe('multi');
    expect(config.instanceId.instanceId).toBeUndefined();
    expect(config.license.data).toBeUndefined();
    expect(config.performance.dataset.parseMaxProcess).toBe(10);
    expect(global.feConfigs.systemTitle).toBe('new');
    expect(legacyRead).not.toHaveBeenCalled();
    expect(await MongoSystemInstanceConfig.countDocuments()).toBe(4);
  });

  it('publishes invalid stored fields without throwing and accepts the administrator repair', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'site',
      revision: 1,
      overrides: { name: 'valid' }
    });
    await systemInstanceConfig.refresh();
    await MongoSystemInstanceConfig.collection.updateOne(
      { domain: 'site' },
      { $set: { 'overrides.name': 7 }, $inc: { revision: 1 } }
    );
    expect((await systemInstanceConfig.refresh()).site.name).toBe(7);
    expect(global.feConfigs.systemTitle).toBe(7);
    await MongoSystemInstanceConfig.collection.updateOne(
      { domain: 'site' },
      { $set: { 'overrides.name': 'recovered' }, $inc: { revision: 1 } }
    );
    expect((await systemInstanceConfig.refresh()).site.name).toBe('recovered');
  });

  it('drops invalid legacy license cache while preserving its source and other scopes', async () => {
    await MongoSystemInstanceConfig.create([
      { domain: 'site', revision: 1, overrides: { name: 'available' } },
      {
        domain: 'license',
        revision: 1,
        overrides: { license: 'needs-reverification', data: { functions: { pay: 'true' } } }
      }
    ]);
    const snapshot = await systemInstanceConfig.initialize();
    expect(snapshot.site.name).toBe('available');
    expect(snapshot.license.license).toBe('needs-reverification');
    expect(snapshot.license.data).toBeUndefined();
    expect(systemInstanceConfig.isLicenseActive()).toBe(false);
  });

  it('serializes refresh reads so a slow earlier load cannot overwrite a newer publication', async () => {
    const controller = await import('../../../../common/system/systemInstanceConfig/controller');
    let release!: () => void;
    let started!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const load = vi
      .spyOn(controller, 'getSystemInstanceConfigSnapshot')
      .mockImplementationOnce(async () => {
        started();
        await barrier;
        return {
          snapshot: resolveSystemInstanceConfig({ site: { name: 'first' } }),
          versionTag: '1'
        };
      })
      .mockResolvedValueOnce({
        snapshot: resolveSystemInstanceConfig({ site: { name: 'second' } }),
        versionTag: '2'
      });
    const first = systemInstanceConfig.refresh();
    await entered;
    const second = systemInstanceConfig.refresh();
    expect(load).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(systemInstanceConfig.get().site.name).toBe('second');
    expect(global.feConfigs.systemTitle).toBe('second');
  });

  it('exposes only the frontend projection and recomputes license expiry without database changes', async () => {
    systemInstanceConfig.setFrontendContext({ commercialService: true });
    global.systemInstanceConfig = resolveSystemInstanceConfig({
      site: { customDomain: { kc: { aliyun: 'synthetic-kube-secret' } } },
      auth: { loginProviders: { email: { pass: 'synthetic-mail-secret' } } },
      commercial: { payment: { alipay: { appPrivateKey: 'synthetic-pay-secret' } } },
      license: { license: 'synthetic-raw-license', data: license }
    });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2029-01-01T00:00:00Z'));
      const before = systemInstanceConfig.getClientConfig();
      expect(before.feConfigs.isPlus).toBe(true);
      expect(systemInstanceConfig.isLicenseActive()).toBe(true);
      const text = JSON.stringify(before);
      for (const value of [
        'synthetic-kube-secret',
        'synthetic-mail-secret',
        'synthetic-pay-secret',
        'synthetic-raw-license'
      ]) {
        expect(text).not.toContain(value);
      }
      vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
      const after = systemInstanceConfig.getClientConfig();
      expect(after.feConfigs.isPlus).toBe(false);
      expect(systemInstanceConfig.isLicenseActive()).toBe(false);
      expect(systemInstanceConfig.getLicenseStatus()).toBe('expired');
      expect(after.version).not.toBe(before.version);
      expect(systemInstanceConfig.get().license.data).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a failed license source across refreshes without rejecting a newer activation', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'license',
      revision: 1,
      overrides: { license: 'old', data: license }
    });
    await systemInstanceConfig.refresh();
    systemInstanceConfig.invalidateLicense('old');
    expect(systemInstanceConfig.get().license.data).toBeUndefined();
    expect((await systemInstanceConfig.refresh()).license.data).toBeUndefined();
    await MongoSystemInstanceConfig.updateOne(
      { domain: 'license' },
      { $set: { 'overrides.license': 'new' }, $inc: { revision: 1 } }
    );
    expect((await systemInstanceConfig.refresh()).license.data).toEqual(license);
    systemInstanceConfig.invalidateLicense('incoming');
    expect(systemInstanceConfig.get().license.data).toEqual(license);
    await MongoSystemInstanceConfig.updateOne(
      { domain: 'license' },
      { $set: { 'overrides.license': 'incoming' }, $inc: { revision: 1 } }
    );
    expect((await systemInstanceConfig.refresh()).license.data).toBeUndefined();
    systemInstanceConfig.acceptLicense('incoming');
    expect((await systemInstanceConfig.refresh()).license.data).toEqual(license);
  });
});
