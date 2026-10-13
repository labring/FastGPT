import { describe, expect, it } from 'vitest';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  channelTypeToScope,
  isSystemModel,
  isTeamModel,
  resolveChannelType,
  scopeToChannelType
} from '@fastgpt/global/core/ai/model/utils';

describe('model scope helpers', () => {
  it.each([
    [{ isSystem: true, scope: ModelScopeEnum.team }, true],
    [{ isSystem: false, scope: ModelScopeEnum.system }, false],
    [{ scope: ModelScopeEnum.system }, true],
    [{ scope: ModelScopeEnum.team }, false],
    [{ tmbId: 'tmb-1' }, false],
    [{}, true],
    [undefined, true]
  ] as const)('classifies legacy and scoped models: %j', (model, isSystem) => {
    expect(isSystemModel(model)).toBe(isSystem);
    expect(isTeamModel(model)).toBe(!isSystem);
  });

  describe('channelType <-> scope conversion', () => {
    it('maps channelType to ModelScopeEnum, defaulting to system', () => {
      expect(channelTypeToScope('team')).toBe(ModelScopeEnum.team);
      expect(channelTypeToScope('system')).toBe(ModelScopeEnum.system);
      expect(channelTypeToScope(undefined)).toBe(ModelScopeEnum.system);
    });

    it('maps scope back to channelType, defaulting to system', () => {
      expect(scopeToChannelType(ModelScopeEnum.team)).toBe('team');
      expect(scopeToChannelType(ModelScopeEnum.system)).toBe('system');
      expect(scopeToChannelType(undefined)).toBe('system');
    });

    it('resolveChannelType prefers the explicit channelType over model scope', () => {
      expect(resolveChannelType({ channelType: 'system', scope: ModelScopeEnum.team })).toBe(
        'system'
      );
      expect(resolveChannelType({ channelType: 'team', scope: ModelScopeEnum.system })).toBe(
        'team'
      );
      expect(resolveChannelType({ scope: ModelScopeEnum.team })).toBe('team');
      expect(resolveChannelType({})).toBe('system');
    });
  });
});
