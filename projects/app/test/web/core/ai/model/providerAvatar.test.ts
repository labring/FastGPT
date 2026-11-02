import { describe, expect, it } from 'vitest';
import { getProviderAvatarUrls } from '@/web/core/ai/model/providerAvatar';

describe('getProviderAvatarUrls', () => {
  it('用户目录为空时返回空数组，不触发图片预热', () => {
    expect(getProviderAvatarUrls([])).toEqual([]);
    expect(getProviderAvatarUrls()).toEqual([]);
  });

  it('管理配置加载成功后按 Provider 顺序收集有效头像', () => {
    expect(
      getProviderAvatarUrls([
        { avatar: 'fastgpt-public/system/plugin/models/OpenAI/logo' },
        { avatar: '' },
        { avatar: 'fastgpt-public/system/plugin/models/Claude/logo' }
      ])
    ).toEqual([
      'fastgpt-public/system/plugin/models/OpenAI/logo',
      'fastgpt-public/system/plugin/models/Claude/logo'
    ]);
  });
});
