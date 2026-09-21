import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('next response headers', () => {
  it('only permits the batch-download response in a same-origin iframe', async () => {
    const headerRules = await nextConfig.headers?.();
    const globalRuleIndex = headerRules?.findIndex(
      (rule) => rule.source === '/((?!chat/share$).*)'
    );
    const batchDownloadRuleIndex = headerRules?.findIndex(
      (rule) => rule.source === '/api/core/dataset/collection/batchDownload'
    );

    expect(globalRuleIndex).toBeGreaterThanOrEqual(0);
    expect(headerRules?.[globalRuleIndex ?? -1]?.headers).toContainEqual({
      key: 'X-Frame-Options',
      value: 'DENY'
    });
    expect(batchDownloadRuleIndex).toBeGreaterThan(globalRuleIndex ?? Infinity);
    expect(headerRules?.[batchDownloadRuleIndex ?? -1]?.headers).toEqual([
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' }
    ]);
  });
});
