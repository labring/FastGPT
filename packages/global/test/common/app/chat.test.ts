import { describe, expect, it } from 'vitest';
import { getAppChatConfig } from '@fastgpt/global/common/app/chat';
import {
  WorkflowIOValueTypeEnum,
  VariableInputEnum
} from '@fastgpt/global/core/workflow/constants';
import { defaultTTSConfig, defaultQGConfig } from '@fastgpt/global/core/app/constants';

describe('getAppChatConfig', () => {
  it('should return config with default values when no params provided', () => {
    const result = getAppChatConfig({ isPublicFetch: false });
    expect(result.questionGuide).toEqual(defaultQGConfig);
    expect(result.ttsConfig).toEqual(defaultTTSConfig);
    expect(result.scheduledTriggerConfig).toBeUndefined();
  });

  it('should merge chatConfig with node config', () => {
    const chatConfig = {
      welcomeText: 'Custom Welcome',
      variables: [{ key: 'v1', label: 'V1', type: VariableInputEnum.input, description: '' }]
    };
    const result = getAppChatConfig({ chatConfig, isPublicFetch: false });
    expect(result.welcomeText).toBe('Custom Welcome');
    expect(result.variables).toEqual([
      { ...chatConfig.variables[0], valueType: WorkflowIOValueTypeEnum.string }
    ]);
  });

  it('should prioritize storeVariables over chatConfig variables', () => {
    const storeVariables = [
      { key: 'store1', label: 'Store1', type: VariableInputEnum.input, description: '' }
    ];
    const chatConfig = {
      variables: [{ key: 'chat1', label: 'Chat1', type: VariableInputEnum.input, description: '' }]
    };
    const result = getAppChatConfig({
      chatConfig,
      storeVariables,
      isPublicFetch: false
    });
    expect(result.variables).toEqual([
      { ...storeVariables[0], valueType: WorkflowIOValueTypeEnum.string }
    ]);
  });

  it('rejects malformed stored variables before returning chat config', () => {
    expect(() =>
      getAppChatConfig({
        storeVariables: [{ key: 'broken' }] as any,
        isPublicFetch: false
      })
    ).toThrow();
  });

  it('should prioritize storeWelcomeText over chatConfig welcomeText', () => {
    const chatConfig = { welcomeText: 'Chat Welcome' };
    const result = getAppChatConfig({
      chatConfig,
      storeWelcomeText: 'Store Welcome',
      isPublicFetch: false
    });
    expect(result.welcomeText).toBe('Store Welcome');
  });

  it('should include scheduledTriggerConfig when isPublicFetch is true', () => {
    const result = getAppChatConfig({
      chatConfig: {
        scheduledTriggerConfig: {
          cronString: '0 0 * * *',
          timezone: 'UTC',
          defaultPrompt: 'Run'
        }
      },
      isPublicFetch: true
    });
    expect(result.scheduledTriggerConfig).toBeDefined();
  });

  it('should exclude scheduledTriggerConfig when isPublicFetch is false', () => {
    const result = getAppChatConfig({
      chatConfig: {
        scheduledTriggerConfig: {
          cronString: '0 0 * * *',
          timezone: 'UTC',
          defaultPrompt: 'Run'
        }
      },
      isPublicFetch: false
    });
    expect(result.scheduledTriggerConfig).toBeUndefined();
  });
});
