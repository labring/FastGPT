import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  saveModerationConfig,
  getAdminModerationPluginList
} from '../../../../core/plugin/moderation/service';
import * as remote from '../../../../thirdProvider/fastgptPlugin/moderation';
import { MongoSystemModerationPlugin } from '../../../../core/plugin/moderation/schema';
import { encryptSecret } from '../../../../common/secret/aes256gcm';
import { ModerationSecretMaskedValue } from '@fastgpt/global/core/plugin/moderation/constants';

const detail = {
  pluginId: 'keyword-config-test',
  source: 'system',
  version: '1.0.0',
  type: 'moderation' as const,
  name: 'Keyword moderation',
  meta: { provider: 'keyword' },
  secretSchema: {
    type: 'object',
    properties: {
      customKeywords: { type: 'string' },
      enableDefaultDict: { type: 'boolean', default: true }
    }
  }
};

describe('moderation configuration save and reload', () => {
  beforeEach(() => {
    vi.spyOn(remote, 'checkModerationContent').mockResolvedValue({
      verdict: 'pass',
      provider: 'keyword',
      hits: [],
      keywords: []
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('does not mark an untouched credential-free plugin as configured', async () => {
    vi.spyOn(remote, 'getModerationPluginDetail').mockResolvedValue(detail);
    vi.spyOn(remote, 'listModerationPlugins').mockResolvedValue([detail]);
    const list = await getAdminModerationPluginList();
    expect(list[0].hasConfiguredSecrets).toBe(false);
  });

  it('reads the same system configuration that was saved when legacy and explicit source records coexist', async () => {
    vi.spyOn(remote, 'getModerationPluginDetail').mockResolvedValue(detail);
    vi.spyOn(remote, 'listModerationPlugins').mockResolvedValue([detail]);
    await MongoSystemModerationPlugin.create([
      { pluginId: detail.pluginId, secretsVal: { enablePolitics: true } },
      { pluginId: detail.pluginId, source: 'system', enabled: false }
    ]);
    const saved = await saveModerationConfig({
      pluginId: detail.pluginId,
      secretsVal: { enableDefaultDict: true }
    });
    expect(saved.hasConfiguredSecrets).toBe(true);
    const list = await getAdminModerationPluginList();
    expect(list[0].hasConfiguredSecrets).toBe(true);
    expect(list[0].secretsVal).toEqual(saved.secretsVal);
  });

  it.each(['block', 'suspected'] as const)(
    'accepts a working provider returning %s and probes before persistence',
    async (verdict) => {
      vi.spyOn(remote, 'getModerationPluginDetail').mockResolvedValue(detail);
      vi.mocked(remote.checkModerationContent).mockImplementation(async (params) => {
        expect(params).toMatchObject({
          pluginId: detail.pluginId,
          source: 'system',
          version: detail.version,
          secrets: { enableDefaultDict: false }
        });
        expect(params.input.content).toBeTruthy();
        expect(
          await MongoSystemModerationPlugin.countDocuments({ pluginId: detail.pluginId })
        ).toBe(0);
        return { verdict, provider: 'keyword', hits: [], keywords: [] };
      });
      await expect(
        saveModerationConfig({
          pluginId: detail.pluginId,
          secretsVal: { enableDefaultDict: false }
        })
      ).resolves.toMatchObject({ hasConfiguredSecrets: true });
      expect(remote.checkModerationContent).toHaveBeenCalledOnce();
    }
  );

  it('probes with decrypted saved credentials when a masked credential is submitted', async () => {
    vi.spyOn(remote, 'getModerationPluginDetail').mockResolvedValue({
      ...detail,
      secretSchema: { type: 'object', properties: { apiKey: { type: 'string', isSecret: true } } }
    });
    await MongoSystemModerationPlugin.create({
      pluginId: detail.pluginId,
      source: 'system',
      secretsVal: { apiKey: { secret: encryptSecret('test-credential') } }
    });
    await saveModerationConfig({
      pluginId: detail.pluginId,
      secretsVal: { apiKey: ModerationSecretMaskedValue }
    });
    expect(remote.checkModerationContent).toHaveBeenCalledWith(
      expect.objectContaining({ secrets: { apiKey: 'test-credential' } })
    );
  });

  it('does not save or enable configuration when the provider reports an error', async () => {
    vi.spyOn(remote, 'getModerationPluginDetail').mockResolvedValue(detail);
    await MongoSystemModerationPlugin.create({
      pluginId: detail.pluginId,
      source: 'system',
      secretsVal: { enableDefaultDict: false },
      enabled: false
    });
    vi.mocked(remote.checkModerationContent).mockResolvedValue({
      verdict: 'error',
      provider: 'keyword',
      errorMessage: 'Invalid credentials',
      hits: [],
      keywords: []
    });
    await expect(
      saveModerationConfig({
        pluginId: detail.pluginId,
        secretsVal: { enableDefaultDict: true },
        enabled: true
      })
    ).rejects.toThrow('Invalid credentials');
    expect(
      await MongoSystemModerationPlugin.findOne({ pluginId: detail.pluginId }).lean()
    ).toMatchObject({ secretsVal: { enableDefaultDict: false }, enabled: false });
  });

  it('rejects an error verdict even when the provider has no error message', async () => {
    vi.spyOn(remote, 'getModerationPluginDetail').mockResolvedValue(detail);
    vi.mocked(remote.checkModerationContent).mockResolvedValue({
      verdict: 'error',
      provider: 'keyword',
      hits: [],
      keywords: []
    });
    await expect(
      saveModerationConfig({ pluginId: detail.pluginId, secretsVal: {} })
    ).rejects.toThrow('内容审核插件配置检测失败');
    expect(await MongoSystemModerationPlugin.countDocuments({ pluginId: detail.pluginId })).toBe(0);
  });

  it('does not persist configuration when the runtime request fails', async () => {
    vi.spyOn(remote, 'getModerationPluginDetail').mockResolvedValue(detail);
    vi.mocked(remote.checkModerationContent).mockRejectedValue(new Error('Runtime unavailable'));
    await expect(
      saveModerationConfig({ pluginId: detail.pluginId, secretsVal: {} })
    ).rejects.toThrow('Runtime unavailable');
    expect(await MongoSystemModerationPlugin.countDocuments({ pluginId: detail.pluginId })).toBe(0);
  });

  it('preserves explicit false values after saving and reloading', async () => {
    vi.spyOn(remote, 'getModerationPluginDetail').mockResolvedValue(detail);
    vi.spyOn(remote, 'listModerationPlugins').mockResolvedValue([detail]);
    await saveModerationConfig({
      pluginId: detail.pluginId,
      secretsVal: { enableDefaultDict: false }
    });
    const list = await getAdminModerationPluginList();
    expect(list[0].hasConfiguredSecrets).toBe(true);
    expect(list[0].secretsVal?.enableDefaultDict).toBe(false);
  });

  it('remains configured after saving an empty optional configuration and reloading the list', async () => {
    vi.spyOn(remote, 'getModerationPluginDetail').mockResolvedValue(detail);
    vi.spyOn(remote, 'listModerationPlugins').mockResolvedValue([detail]);
    const saved = await saveModerationConfig({
      pluginId: detail.pluginId,
      secretsVal: { customKeywords: '' }
    });
    expect(saved.hasConfiguredSecrets).toBe(true);
    const list = await getAdminModerationPluginList();
    expect(list[0].hasConfiguredSecrets).toBe(true);
    expect(list[0].source).toBe('system');
  });
});
