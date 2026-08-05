import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authOutLinkValid } from '@fastgpt/service/support/permission/publish/authLink';
import { authOutLinkLimit } from '@fastgpt/service/support/outLink/runtime/auth';
import { authOutLinkChatStart } from '@/service/support/permission/auth/outLink';

vi.mock('@fastgpt/service/support/permission/publish/authLink', () => ({
  authOutLinkValid: vi.fn()
}));

vi.mock('@fastgpt/service/support/outLink/runtime/auth', () => ({
  authOutLinkInit: vi.fn(),
  authOutLinkLimit: vi.fn()
}));

const outLinkConfig = {
  _id: 'out-link-id',
  name: 'Public link',
  teamId: 'team-id',
  tmbId: 'member-id',
  showCite: true,
  showRunningStatus: true,
  showSkillReferences: false,
  showFullText: false,
  canDownloadSource: false,
  limit: {
    QPM: 10,
    maxUsagePoints: -1
  }
};

const originalFeConfigs = global.feConfigs;

describe('authOutLinkChatStart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authOutLinkValid).mockResolvedValue({
      outLinkConfig,
      appId: 'app-id'
    } as any);
    vi.mocked(authOutLinkLimit).mockResolvedValue({ uid: 'verified-uid' });
  });

  afterAll(() => {
    global.feConfigs = originalFeConfigs;
  });

  it('商业版在 FastGPT 进程内执行外链校验', async () => {
    global.feConfigs = { ...global.feConfigs, isPlus: true } as any;

    const result = await authOutLinkChatStart({
      shareId: 'share-id',
      outLinkUid: 'raw-uid',
      question: 'hello'
    });

    expect(authOutLinkLimit).toHaveBeenCalledWith({
      outLink: outLinkConfig,
      outLinkUid: 'raw-uid',
      question: 'hello'
    });
    expect(result.uid).toBe('verified-uid');
  });

  it('社区版保持历史行为，不执行商业版外链校验', async () => {
    global.feConfigs = { ...global.feConfigs, isPlus: false } as any;

    const result = await authOutLinkChatStart({
      shareId: 'share-id',
      outLinkUid: 'raw-uid',
      question: 'hello'
    });

    expect(authOutLinkLimit).not.toHaveBeenCalled();
    expect(result.uid).toBe('raw-uid');
  });
});
