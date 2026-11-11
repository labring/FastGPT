import { afterEach, describe, expect, it } from 'vitest';
import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import {
  assertPluginDebugSourceEnabled,
  assertPluginRemoteDebugEnabled,
  isPluginRemoteDebugEnabled
} from '@fastgpt/service/core/plugin/debug/policy';

const original = getTestInstanceConfig().subservice.plugin.remoteDebug;
afterEach(() => {
  getTestInstanceConfig().subservice.plugin.remoteDebug = original;
});

describe('plugin remote debug policy', () => {
  it('reads current config on each call and restricts only debug sources', () => {
    getTestInstanceConfig().subservice.plugin.remoteDebug = false;
    expect(isPluginRemoteDebugEnabled()).toBe(false);
    expect(() => assertPluginRemoteDebugEnabled()).toThrow('Plugin remote debugging is disabled');
    expect(() => assertPluginDebugSourceEnabled('debug:tmbId:member')).toThrow();
    for (const source of [undefined, 'system', 'teamId:team']) {
      expect(() => assertPluginDebugSourceEnabled(source)).not.toThrow();
    }
    getTestInstanceConfig().subservice.plugin.remoteDebug = true;
    expect(isPluginRemoteDebugEnabled()).toBe(true);
    expect(() => assertPluginRemoteDebugEnabled()).not.toThrow();
    expect(() => assertPluginDebugSourceEnabled('debug:tmbId:member')).not.toThrow();
  });
});
