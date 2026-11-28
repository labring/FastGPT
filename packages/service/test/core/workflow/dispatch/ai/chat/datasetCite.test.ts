import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { AiChatQuoteRole } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { getDatasetCiteData } from '@fastgpt/service/core/workflow/dispatch/ai/chat/datasetCite';
import { serviceEnv } from '@fastgpt/service/env';

const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;
const tokenMocks = vi.hoisted(() => ({
  countPromptTokensBatch: vi.fn(async (texts: string[]) => texts.map((text) => text.length))
}));
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => tokenMocks);

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: true });
  tokenMocks.countPromptTokensBatch.mockImplementation(async (texts: string[]) =>
    texts.map((text) => text.length)
  );
});

afterAll(() => {
  Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: originalDatasetSynonymEnabled });
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
  it('uses filterSearchResultsByMaxChars fallback to keep the first item when over budget', async () => {
    expect(
      (await run({ model: { config: { quoteMaxToken: 1 } } as LLMModelDataType })).userInput
    ).toBe('alias {"alias":"standard"} Question: question');
  });
  it('truncates subsequent items once cumulative q+a tokens exceed quoteMaxToken', async () => {
    const longItem = { ...item, q: 'a'.repeat(600) };
    expect(
      (
        await run({
          quoteQA: [longItem, item],
          quoteTemplate: '{{q}}',
          model: { config: { quoteMaxToken: 100 } } as LLMModelDataType
        })
      ).userInput
    ).toBe(`${'a'.repeat(600)} Question: question`);
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
  it('omits standard template mapping fields when enabled but a chunk has no reliable mapping', async () => {
    const quoteQA = [{ ...item, synonymMappings: undefined }];
    const jsonTemplate = '{\n  "q": "{{q}}",\n  "synonymMappings": {{synonymMappings}}\n}';
    const xmlTemplate =
      '<Question>\n{{q}}\n</Question>\n<SynonymMappings>\n{{synonymMappings}}\n</SynonymMappings>';
    expect(
      (await run({ quoteQA, quoteTemplate: jsonTemplate, datasetQuotePrompt: '{{quote}}' }))
        .userInput
    ).toBe('{\n  "q": "alias"\n}');
    expect(
      (await run({ quoteQA, quoteTemplate: xmlTemplate, datasetQuotePrompt: '{{quote}}' }))
        .userInput
    ).toBe('<Question>\nalias\n</Question>');
  });

  it('defaults quote role to user in template and runtime fallback so system prompt stays cacheable', async () => {
    expect(AiChatQuoteRole.value).toBe('user');

    const result = await getDatasetCiteData({
      quoteQA: [item],
      model: { config: { quoteMaxToken: 1000 } } as LLMModelDataType,
      quoteTemplate: '{{q}}',
      userChatInput: 'question',
      useDatasetQuote: true
    });
    expect(result.systemPrompt).toBe('');
    expect(result.userInput).toContain('alias');
    expect(result.userInput).toContain('question');

    // 非法或空字符串角色同样按统一契约回退默认 user，避免运行时与编辑器行为分叉。
    const emptyRoleResult = await getDatasetCiteData({
      quoteQA: [item],
      model: { config: { quoteMaxToken: 1000 } } as LLMModelDataType,
      quoteTemplate: '{{q}}',
      aiChatQuoteRole: '' as any,
      userChatInput: 'question',
      useDatasetQuote: true
    });
    expect(emptyRoleResult.systemPrompt).toBe('');
    expect(emptyRoleResult.userInput).toContain('alias');
  });

  it('omits built-in default user template when both question and quote are empty, while preserving custom prompts', async () => {
    const emptyDefault = await run({
      quoteQA: [],
      datasetQuotePrompt: '',
      userChatInput: ''
    });
    expect(emptyDefault.userInput).toBe('');

    const quoteOnly = await run({
      quoteQA: [item],
      datasetQuotePrompt: '{{quote}}',
      userChatInput: ''
    });
    expect(quoteOnly.userInput).toContain('alias');

    const systemEmptyQuestion = await run({
      quoteQA: [item],
      aiChatQuoteRole: 'system',
      datasetQuotePrompt: '{{quote}}',
      userChatInput: ''
    });
    expect(systemEmptyQuestion.userInput).toBe('');

    const customExpandedVar = await run({
      quoteQA: [],
      datasetQuotePrompt: '请总结：来自工作流变量的正文\n{{quote}}',
      userChatInput: ''
    });
    expect(customExpandedVar.userInput).toBe('请总结：来自工作流变量的正文\n');
  });
});
