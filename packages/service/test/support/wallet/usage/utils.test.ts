import { describe, expect, it, vi } from 'vitest';
import {
  buildFlowUsageItems,
  formatModelChars2Points
} from '@fastgpt/service/support/wallet/usage/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';

const createModel = (
  data: Pick<SystemModelDataType, 'modelId' | 'name' | 'model'> &
    Partial<
      Pick<SystemModelDataType, 'charsPointsPrice' | 'inputPrice' | 'outputPrice' | 'priceTiers'>
    >
): SystemModelDataType => ({
  ...data,
  type: ModelTypeEnum.llm,
  provider: 'test',
  scope: 'system' as const,
  isActive: true,
  config: { maxContext: 1000, maxResponse: 100, quoteMaxToken: 500 }
});

const mockModels: Record<string, SystemModelDataType> = {
  'gpt-4': createModel({
    modelId: '507f1f77bcf86cd799439021',
    name: 'GPT-4',
    model: 'gpt-4',
    charsPointsPrice: 0,
    inputPrice: 3,
    outputPrice: 6
  }),
  'gpt-3.5': createModel({
    modelId: '507f1f77bcf86cd799439022',
    name: 'GPT-3.5',
    model: 'gpt-3.5',
    charsPointsPrice: 2
  }),
  'tiered-model': createModel({
    modelId: '507f1f77bcf86cd799439023',
    name: 'Tiered',
    model: 'tiered-model',
    priceTiers: [
      { maxInputTokens: 1, inputPrice: 1, outputPrice: 2 },
      { inputPrice: 5, outputPrice: 10 }
    ]
  })
};

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getModelHandle: async () => ({
    findModelData: (reference: { modelId?: string; model?: string }) => {
      if (reference.modelId) {
        return Object.values(mockModels).find((model) => model.modelId === reference.modelId);
      }
      return reference.model ? mockModels[reference.model] : undefined;
    }
  })
}));

describe('formatModelChars2Points', () => {
  it('should calculate points with legacy input/output pricing', () => {
    const result = formatModelChars2Points({
      model: mockModels['gpt-4'],
      inputTokens: 1000,
      outputTokens: 500
    });
    expect(result.modelId).toBe('507f1f77bcf86cd799439021');
    // inputPrice:3 * (1000/1000) + outputPrice:6 * (500/1000) = 3 + 3 = 6
    expect(result.totalPoints).toBe(6);
  });

  it('should calculate points with comprehensive price', () => {
    const result = formatModelChars2Points({
      model: mockModels['gpt-3.5'],
      inputTokens: 2000,
      outputTokens: 1000
    });
    expect(result.modelId).toBe('507f1f77bcf86cd799439022');
    // charsPointsPrice:2 → inputPrice=outputPrice=2
    // 2 * (2000/1000) + 2 * (1000/1000) = 4 + 2 = 6
    expect(result.totalPoints).toBe(6);
  });

  it('should use default 0 tokens when not provided', () => {
    const result = formatModelChars2Points({ model: mockModels['gpt-4'] });
    expect(result.modelId).toBe('507f1f77bcf86cd799439021');
    expect(result.totalPoints).toBe(0);
  });

  it('should support custom multiple parameter', () => {
    const result = formatModelChars2Points({
      model: mockModels['gpt-4'],
      inputTokens: 500,
      outputTokens: 500,
      multiple: 500
    });
    expect(result.modelId).toBe('507f1f77bcf86cd799439021');
    // inputPrice:3 * (500/500) + outputPrice:6 * (500/500) = 3 + 6 = 9
    expect(result.totalPoints).toBe(9);
  });

  it('should calculate points with price tiers', () => {
    const result = formatModelChars2Points({
      model: mockModels['tiered-model'],
      inputTokens: 2000,
      outputTokens: 100
    });
    expect(result.modelId).toBe('507f1f77bcf86cd799439023');
    // inputTokens:200 匹配第二梯度 (inputPrice:5, outputPrice:10)
    // 5 * (2000/1000) + 10 * (100/1000) = 10 + 1 = 11
    expect(result.totalPoints).toBe(11);
  });
});

describe('buildFlowUsageItems', () => {
  it('逐条保留 token，并按前缀区分每次子流程执行', () => {
    const items = buildFlowUsageItems({
      usages: [
        { moduleName: 'chat', totalPoints: 3, inputTokens: 100, outputTokens: 20 },
        { moduleName: 'search', totalPoints: 4, inputTokens: 50, outputTokens: 0 }
      ] as any,
      moduleNamePrefix: 'loop-1'
    });

    expect(items).toEqual([
      { moduleName: 'loop-1-chat', totalPoints: 3, inputTokens: 100, outputTokens: 20 },
      { moduleName: 'loop-1-search', totalPoints: 4, inputTokens: 50, outputTokens: 0 }
    ]);
  });

  it('billable=false 时金额归零但 token 照常保留', () => {
    const items = buildFlowUsageItems({
      usages: [{ moduleName: 'chat', totalPoints: 9, inputTokens: 100, outputTokens: 20 }] as any,
      billable: false,
      moduleNamePrefix: 'tool'
    });

    expect(items).toEqual([
      { moduleName: 'tool-chat', totalPoints: 0, inputTokens: 100, outputTokens: 20 }
    ]);
  });

  it('moduleName 缺失时退回前缀本身，不出现前缀自我重复', () => {
    const items = buildFlowUsageItems({
      usages: [{ totalPoints: 1, inputTokens: 10, outputTokens: 1 }] as any,
      moduleNamePrefix: 'loop-1'
    });

    expect(items[0].moduleName).toBe('loop-1');
  });

  it('无前缀且无 moduleName 时给出兜底名，避免整批 usage item 因缺字段创建失败', () => {
    const items = buildFlowUsageItems({
      usages: [{ totalPoints: 1 }] as any
    });

    expect(items[0].moduleName).toBe('usage');
  });
});
