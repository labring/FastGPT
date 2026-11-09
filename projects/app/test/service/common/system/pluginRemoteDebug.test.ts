import { describe, expect, it } from 'vitest';
import { resolvePluginRemoteDebug } from '@/service/common/system/pluginRemoteDebug';

describe('resolvePluginRemoteDebug', () => {
  it('requires both the admin switch and Plugin capability', () => {
    expect(resolvePluginRemoteDebug({ adminEnabled: true, pluginAvailable: true })).toBe(true);
    expect(resolvePluginRemoteDebug({ adminEnabled: false, pluginAvailable: true })).toBe(false);
    expect(resolvePluginRemoteDebug({ adminEnabled: true, pluginAvailable: false })).toBe(false);
    expect(resolvePluginRemoteDebug({ adminEnabled: false, pluginAvailable: false })).toBe(false);
  });
});
