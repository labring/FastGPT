import { describe, expect, it } from 'vitest';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  channelTypeToScope,
  isSystemModel,
  isTeamModel,
  resolveChannelType,
  scopeToChannelType
} from '@fastgpt/global/core/ai/model';

describe('model scope helpers', () => {
  describe('isSystemModel / isTeamModel', () => {
    it('treats an explicit isSystem flag as the highest priority', () => {
      expect(isSystemModel({ isSystem: true, scope: ModelScopeEnum.team })).toBe(true);
      expect(isSystemModel({ isSystem: false, scope: ModelScopeEnum.system })).toBe(false);
    });

    it('falls back to scope when isSystem is absent', () => {
      expect(isSystemModel({ scope: ModelScopeEnum.system })).toBe(true);
      expect(isSystemModel({ scope: ModelScopeEnum.team })).toBe(false);
      expect(isSystemModel({ scope: 'team', tmbId: 'tmb-123' })).toBe(false);
    });

    it('treats legacy models without scope as system unless they have an owner', () => {
      expect(isSystemModel({})).toBe(true);
      expect(isSystemModel(undefined)).toBe(true);
      expect(isSystemModel({ tmbId: 'tmb-123' })).toBe(false);
    });

    it('isTeamModel is the exact negation of isSystemModel', () => {
      const samples = [
        undefined,
        {},
        { scope: ModelScopeEnum.system },
        { scope: ModelScopeEnum.team },
        { tmbId: 'tmb-1' },
        { isSystem: true }
      ];
      for (const sample of samples) {
        expect(isTeamModel(sample)).toBe(!isSystemModel(sample));
      }
    });
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
