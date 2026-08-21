import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { describe, expect, it } from 'vitest';
import {
  getSandboxTargetId,
  resolveSandboxTarget,
  tryResolveSandboxTarget
} from '@/pageComponents/chat/SandboxEditor/types';

describe('SandboxEditor target normalization', () => {
  it('preserves the Workflow Builder source identity', () => {
    const target = {
      appId: 'app-1',
      sourceType: ChatSourceTypeEnum.workflowBuilder
    } as const;

    expect(resolveSandboxTarget({ chatTarget: target })).toEqual(target);
    expect(tryResolveSandboxTarget({ chatTarget: target })).toEqual(target);
    expect(getSandboxTargetId(target)).toBe(`${ChatSourceTypeEnum.workflowBuilder}:app-1`);
  });

  it('preserves another explicit app source identity', () => {
    const target = {
      appId: 'app-1',
      sourceType: ChatSourceTypeEnum.chatAgentHelper
    } as const;

    expect(resolveSandboxTarget({ chatTarget: target })).toEqual(target);
  });

  it('keeps ordinary app and skill targets unchanged', () => {
    expect(resolveSandboxTarget({ chatTarget: { appId: 'app-1' } })).toEqual({ appId: 'app-1' });
    expect(resolveSandboxTarget({ chatTarget: { skillId: 'skill-1' } })).toEqual({
      skillId: 'skill-1'
    });
  });

  it('falls back to the legacy appId input when no chat target is available', () => {
    expect(resolveSandboxTarget({ appId: 'app-1' })).toEqual({ appId: 'app-1' });
    expect(tryResolveSandboxTarget({ appId: 'app-1' })).toEqual({ appId: 'app-1' });
  });

  it('keeps the optional resolver empty and rejects a missing required target', () => {
    expect(tryResolveSandboxTarget({})).toBeUndefined();
    expect(() => resolveSandboxTarget({})).toThrow('Sandbox target is required');
  });
});
