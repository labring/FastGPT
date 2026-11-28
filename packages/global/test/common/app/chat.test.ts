import { describe, expect, it } from 'vitest';
import { getAppChatConfig, resolveWelcomeText } from '@fastgpt/global/common/app/chat';
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

describe('variable-based welcome text', () => {
  const chatConfig = {
    welcomeText: 'Legacy',
    variables: [{ key: 'v1', label: 'locale', description: '', type: VariableInputEnum.input }],
    welcomeConfig: {
      welcomeText: 'Default',
      byVariable: {
        key: 'v1',
        cases: [
          { value: 'en', text: 'Hello' },
          { value: 'zh', text: '你好' }
        ]
      }
    }
  };
  it('matches the declared variable after sharing or editing the app', () => {
    const config = getAppChatConfig({ chatConfig, isPublicFetch: true });
    expect(resolveWelcomeText(config, { v1: 'en' })).toBe('Hello');
    expect(resolveWelcomeText(config, { v1: 'zh' })).toBe('你好');
  });
  it('falls back for missing, unknown, structured or deleted variables', () => {
    for (const values of [{}, { v1: 'es' }, { v1: ['en'] }]) {
      expect(resolveWelcomeText(chatConfig, values)).toBe('Default');
    }
    expect(resolveWelcomeText({ ...chatConfig, variables: [] }, { v1: 'en' })).toBe('Default');
    expect(resolveWelcomeText({ welcomeText: 'Legacy' }, {})).toBe('Legacy');
  });
  it('uses variable labels and defaults consistently with the share form', () => {
    expect(resolveWelcomeText(chatConfig, { locale: 'en' })).toBe('Hello');
    const config = {
      ...chatConfig,
      variables: [{ ...chatConfig.variables[0], defaultValue: 'zh' }]
    };
    expect(resolveWelcomeText(config, {})).toBe('你好');
    expect(resolveWelcomeText(config, { v1: '', locale: 'en' })).toBe('Default');
    expect(
      resolveWelcomeText(
        {
          ...chatConfig,
          variables: [{ ...chatConfig.variables[0], type: VariableInputEnum.password }]
        },
        { v1: 'en' }
      )
    ).toBe('Default');
  });
  it('preserves an explicit historical snapshot including an empty one', () => {
    for (const storeWelcomeText of ['', 'Snapshot']) {
      const config = getAppChatConfig({ chatConfig, storeWelcomeText, isPublicFetch: true });
      expect(resolveWelcomeText(config, { v1: 'en' })).toBe(storeWelcomeText);
    }
  });
});
