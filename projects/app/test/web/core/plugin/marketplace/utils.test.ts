import { describe, expect, it } from 'vitest';
import { getBatchUpdateFailures } from '@/web/core/plugin/marketplace/utils';

describe('getBatchUpdateFailures', () => {
  it('maps partial failures from download URLs back to tool IDs', () => {
    expect(
      getBatchUpdateFailures({
        toolIds: ['tool-1', 'tool-2', 'tool-3'],
        downloadUrls: ['url-1', 'url-2', 'url-3'],
        installResult: {
          failed: [
            {
              url: 'url-2',
              reason: { en: 'Install failed', 'zh-CN': '安装失败' }
            }
          ]
        },
        language: 'zh-CN'
      })
    ).toEqual([{ toolId: 'tool-2', reason: '安装失败' }]);
  });

  it('returns an empty list when every plugin succeeds', () => {
    expect(
      getBatchUpdateFailures({
        toolIds: ['tool-1'],
        downloadUrls: ['url-1'],
        installResult: {},
        language: 'en'
      })
    ).toEqual([]);
  });

  it('falls back to the English reason for an unsupported locale', () => {
    expect(
      getBatchUpdateFailures({
        toolIds: ['tool-1'],
        downloadUrls: ['url-1'],
        installResult: {
          failed: [{ url: 'url-1', reason: { en: 'Install failed' } }]
        },
        language: 'ja'
      })
    ).toEqual([{ toolId: 'tool-1', reason: 'Install failed' }]);
  });

  it('ignores failure URLs that are not part of this request', () => {
    expect(
      getBatchUpdateFailures({
        toolIds: ['tool-1'],
        downloadUrls: ['url-1'],
        installResult: {
          failed: [{ url: 'other-url', reason: { en: 'Install failed' } }]
        },
        language: 'en'
      })
    ).toEqual([]);
  });
});
