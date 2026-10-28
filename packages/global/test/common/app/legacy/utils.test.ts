import { describe, expect, it } from 'vitest';
import {
  normalizeLegacyAppVariable,
  resolveLegacyWelcomeConfig,
  normalizeLegacyToolSetConfig
} from '@fastgpt/global/common/app/legacy/utils';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/variable/type';
import type { NodeToolConfigType } from '@fastgpt/global/core/workflow/type/node';

describe('resolveLegacyWelcomeConfig', () => {
  it('prefers an explicit empty session snapshot over both application formats', () => {
    const chatConfig = {
      welcomeText: 'old',
      welcomeConfig: { welcomeText: 'current', welcomeQuestions: ['question'] }
    };
    expect(resolveLegacyWelcomeConfig({ chatConfig, storeWelcomeText: '' })).toEqual({
      welcomeText: '',
      welcomeQuestions: ['question']
    });
    expect(resolveLegacyWelcomeConfig({ chatConfig })).toEqual(chatConfig.welcomeConfig);
    expect(resolveLegacyWelcomeConfig({ chatConfig: { welcomeText: 'old' } }).welcomeText).toBe(
      'old'
    );
  });
});

describe('normalizeLegacyAppVariable', () => {
  const variable: VariableItemType = {
    key: 'question',
    label: 'Question',
    description: '',
    type: VariableInputEnum.input,
    valueType: WorkflowIOValueTypeEnum.number,
    enums: [{ label: 'A', value: 'A' }]
  };
  it('normalizes old text types and enum options without mutating storage data', () => {
    const original = structuredClone(variable);
    expect(normalizeLegacyAppVariable(variable)).toEqual({
      ...variable,
      valueType: WorkflowIOValueTypeEnum.string,
      list: variable.enums
    });
    expect(variable).toEqual(original);
  });
  it('preserves current types and an explicitly empty option list', () => {
    const current = { ...variable, type: VariableInputEnum.numberInput, list: [] };
    expect(normalizeLegacyAppVariable(current)).toEqual(current);
    const text = { ...variable, valueType: WorkflowIOValueTypeEnum.string };
    expect(normalizeLegacyAppVariable(text).valueType).toBe(WorkflowIOValueTypeEnum.string);
  });
});

describe('normalizeLegacyToolSetConfig', () => {
  it('accepts an absent tool configuration', () => {
    expect(normalizeLegacyToolSetConfig({ toolSetId: 'app' })).toBeUndefined();
  });
  it.each(['httpToolSet', 'mcpToolSet'] as const)(
    'repairs historical %s IDs while preserving current IDs and source objects',
    (type) => {
      for (const toolId of [undefined, '', 'current']) {
        const toolSet = { toolList: [], ...(toolId === undefined ? {} : { toolId }) };
        const config: NodeToolConfigType =
          type === 'httpToolSet'
            ? { httpToolSet: toolSet }
            : { mcpToolSet: { url: 'https://example.com', ...toolSet } };
        const original = structuredClone(config);
        const result = normalizeLegacyToolSetConfig({ config, toolSetId: 'app' });
        expect(result?.[type]?.toolId).toBe(toolId || 'app');
        expect(result?.[type]?.toolList).toEqual([]);
        expect(config).toEqual(original);
      }
    }
  );
});
