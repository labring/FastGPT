import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getChatSourceConfig } from '@fastgpt/service/core/chat/config';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

vi.mock('@fastgpt/service/core/app/version/controller', () => ({ getAppLatestVersion: vi.fn() }));
vi.mock('@fastgpt/service/core/app/schema', () => ({ MongoApp: { findById: vi.fn() } }));

describe('getChatSourceConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reuses the authorized App and loads its published configuration once', async () => {
    const app = { _id: 'app-1' } as any;
    const published = { nodes: [], chatConfig: { welcomeText: 'Published welcome' } };
    vi.mocked(getAppLatestVersion).mockResolvedValueOnce(published as any);
    await expect(
      getChatSourceConfig({ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1', app })
    ).resolves.toEqual(published);
    expect(getAppLatestVersion).toHaveBeenCalledExactlyOnceWith('app-1', app);
    expect(MongoApp.findById).not.toHaveBeenCalled();
  });

  it('loads an App when the caller only has its target, and rejects a missing App', async () => {
    vi.mocked(MongoApp.findById).mockReturnValueOnce({
      lean: async () => ({ _id: 'app-1' })
    } as any);
    vi.mocked(getAppLatestVersion).mockResolvedValueOnce({ nodes: [], chatConfig: {} } as any);
    await expect(
      getChatSourceConfig({ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' })
    ).resolves.toMatchObject({ nodes: [] });
    vi.mocked(MongoApp.findById).mockReturnValueOnce({ lean: async () => null } as any);
    await expect(
      getChatSourceConfig({ sourceType: ChatSourceTypeEnum.app, sourceId: 'missing' })
    ).rejects.toBe(AppErrEnum.unExist);
  });

  it.each([
    [ChatSourceTypeEnum.workflowBuilder, true],
    [ChatSourceTypeEnum.chatAgentHelper, true],
    [ChatSourceTypeEnum.skillEdit, false]
  ] as const)(
    'resolves %s independently of the target workflow',
    async (sourceType, canSelectFile) => {
      const result = await getChatSourceConfig({
        sourceType,
        sourceId: 'source-1',
        app: { chatConfig: { welcomeText: 'Target only' } } as any
      });
      expect(result.chatConfig.fileSelectConfig?.canSelectFile).toBe(canSelectFile);
      expect(result.chatConfig.welcomeText).toBeUndefined();
      expect(result.nodes).toEqual([]);
      expect(getAppLatestVersion).not.toHaveBeenCalled();
    }
  );

  it('returns independent helper configuration objects', async () => {
    const target = { sourceType: ChatSourceTypeEnum.chatAgentHelper, sourceId: 'app-1' };
    const first = await getChatSourceConfig(target);
    first.chatConfig.fileSelectConfig!.customFileExtensionList!.push('.private');
    const second = await getChatSourceConfig(target);
    expect(second.chatConfig.fileSelectConfig?.customFileExtensionList).not.toContain('.private');
  });
});
