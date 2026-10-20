import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { getDatasetCiteData } from '@fastgpt/service/core/workflow/dispatch/ai/chat/datasetCite';

const tokenMocks = vi.hoisted(() => ({
  countPromptTokens: vi.fn(async (text: string) => text.length),
  countPromptTokensBatch: vi.fn(async (texts: string[]) => texts.map((text) => text.length))
}));
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => tokenMocks);

beforeEach(() => {
  vi.clearAllMocks();
  tokenMocks.countPromptTokens.mockImplementation(async (text: string) => text.length);
  tokenMocks.countPromptTokensBatch.mockImplementation(async (texts: string[]) =>
    texts.map((text) => text.length)
  );
});
const item: SearchDataResponseItemType = {
  id: 'id',
  datasetId: 'dataset',
  collectionId: 'collection',
  sourceName: 'source',
  chunkIndex: 0,
  q: 'alias',
  a: '',
  updateTime: new Date(),
  score: [],
  synonymMappings: { alias: 'standard' }
};
const run = (overrides: Partial<Parameters<typeof getDatasetCiteData>[0]> = {}) =>
  getDatasetCiteData({
    quoteQA: [item],
    model: { config: { quoteMaxToken: 1000 } } as LLMModelDataType,
    quoteTemplate: '{{q}} {{synonymMappings}}',
    datasetQuotePrompt: '{{quote}} Question: {{question}}',
    aiChatQuoteRole: 'user',
    userChatInput: 'question',
    useDatasetQuote: true,
    ...overrides
  });

describe('dataset citation synonym compatibility', () => {
  it('renders each map once, including missing and empty maps', async () => {
    expect((await run()).userInput).toBe('alias {"alias":"standard"} Question: question');
    expect((await run({ quoteQA: [{ ...item, synonymMappings: undefined }] })).userInput).toContain(
      'alias {}'
    );
    expect((await run({ quoteQA: [{ ...item, synonymMappings: {} }] })).userInput).toContain(
      'alias {}'
    );
  });
  it('keeps custom legacy templates unchanged', async () => {
    expect((await run({ quoteTemplate: '{{q}}' })).userInput).toBe('alias Question: question');
  });
  it('counts rendered mappings and allows no references instead of exceeding the budget', async () => {
    expect(
      (await run({ model: { config: { quoteMaxToken: 5 } } as LLMModelDataType })).userInput
    ).toBe(' Question: question');
  });
  it('includes separators in the strict budget', async () => {
    expect(
      (
        await run({
          quoteQA: [item, item],
          quoteTemplate: '{{q}}',
          model: { config: { quoteMaxToken: 10 } } as LLMModelDataType
        })
      ).userInput
    ).toBe('alias Question: question');
  });
  it('rolls back whole chunks when joined tokenization exceeds the per-chunk sum', async () => {
    // BPE merges across chunk boundaries: the joined text counts 6 tokens more than the
    // per-chunk sum, which must trigger the batch rollback instead of a per-item recount.
    tokenMocks.countPromptTokens.mockImplementation(async (text: string) => text.length + 6);

    const result = await run({
      quoteQA: [item, item, item],
      quoteTemplate: '{{q}}',
      model: { config: { quoteMaxToken: 19 } } as LLMModelDataType
    });

    // Two chunks fit the per-chunk budget; the joined recount overflows, so the last one is dropped.
    expect(result.userInput).toBe('alias Question: question');
    expect(tokenMocks.countPromptTokensBatch).toHaveBeenCalledTimes(1);
    expect(tokenMocks.countPromptTokens).toHaveBeenCalledTimes(2);
  });
  it('does not recursively expand placeholders within retrieved content or mappings', async () => {
    const result = await run({
      quoteQA: [{ ...item, q: '{{question}}', synonymMappings: { '{{q}}': '{{question}}' } }]
    });
    expect(result.userInput).toBe('{{question}} {"{{q}}":"{{question}}"} Question: question');
  });
  it('renders mappings in the system role without duplicating them into the user question', async () => {
    const result = await run({ aiChatQuoteRole: 'system', datasetQuotePrompt: '{{quote}}' });
    expect(result.systemPrompt).toBe('alias {"alias":"standard"}');
    expect(result.userInput).toBe('question');
  });
});
