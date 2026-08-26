import { describe, expect, it } from 'vitest';
import { getAccountModelTabs } from '@/pageComponents/account/model/tabUtils';

describe('getAccountModelTabs', () => {
  it('returns all model management tabs when AI Proxy is enabled', () => {
    expect(getAccountModelTabs(true)).toEqual([
      { labelKey: 'config_model:active_model', value: 'model' },
      { labelKey: 'config_model:config_model', value: 'config' },
      { labelKey: 'config_model:channel', value: 'channel' },
      { labelKey: 'config_model:log', value: 'log' },
      { labelKey: 'config_model:monitoring', value: 'monitor' }
    ]);
  });

  it('hides all AI Proxy dependent tabs when AI Proxy is disabled', () => {
    expect(getAccountModelTabs()).toEqual([
      { labelKey: 'config_model:active_model', value: 'model' },
      { labelKey: 'config_model:config_model', value: 'config' }
    ]);
  });
});
