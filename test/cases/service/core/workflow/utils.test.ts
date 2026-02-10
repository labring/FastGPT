import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

// Mock countPromptTokens (uses worker threads, not available in test)
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countPromptTokens: vi.fn(async (text: string) => {
    // Simple approximation: 1 token ≈ 1 char for test purposes
    return typeof text === 'string' ? text.length : 0;
  })
}));

// Mock getSystemTools and getSystemToolByIdAndVersionId (need database)
vi.mock('@fastgpt/service/core/app/tool/controller', () => ({
  getSystemTools: vi.fn(),
  getSystemToolByIdAndVersionId: vi.fn()
}));

import {
  filterSearchResultsByMaxChars,
  getSystemToolRunTimeNodeFromSystemToolset
} from '@fastgpt/service/core/workflow/utils';
import { countPromptTokens } from '@fastgpt/service/common/string/tiktoken/index';
import {
  getSystemTools,
  getSystemToolByIdAndVersionId
} from '@fastgpt/service/core/app/tool/controller';

const mockedCountPromptTokens = vi.mocked(countPromptTokens);
const mockedGetSystemTools = vi.mocked(getSystemTools);
const mockedGetSystemToolByIdAndVersionId = vi.mocked(getSystemToolByIdAndVersionId);

function makeSearchItem(q: string, a = ''): SearchDataResponseItemType {
  return {
    id: `id-${q}`,
    q,
    a,
    datasetId: 'ds1',
    collectionId: 'col1',
    sourceName: 'test',
    chunkIndex: 0,
    score: [],
    updateTime: new Date()
  } as SearchDataResponseItemType;
}

describe('filterSearchResultsByMaxChars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all items when total tokens are within maxTokens', async () => {
    const list = [makeSearchItem('hello', 'world'), makeSearchItem('foo', 'bar')];
    // "helloworld" = 10 tokens, "foobar" = 6 tokens, total = 16
    const result = await filterSearchResultsByMaxChars(list, 100);
    expect(result).toHaveLength(2);
    expect(result).toEqual(list);
  });

  it('should stop adding items when totalTokens exceeds maxTokens + 500', async () => {
    // Each item has q+a of length 600
    const longText = 'a'.repeat(600);
    const list = [
      makeSearchItem(longText, ''),
      makeSearchItem(longText, ''),
      makeSearchItem(longText, '')
    ];
    // Item 1: 600 tokens (< 100 + 500 = 600, not > 600, so push and check > 100 → break)
    // Actually: 600 > 100 → push item and break
    const result = await filterSearchResultsByMaxChars(list, 100);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(list[0]);
  });

  it('should break before pushing when totalTokens > maxTokens + 500', async () => {
    // Item 1: 300 tokens, Item 2: 400 tokens
    const list = [makeSearchItem('a'.repeat(300), ''), makeSearchItem('a'.repeat(400), '')];
    // After item 1: totalTokens = 300, not > 800, push, not > 300 → continue
    // After item 2: totalTokens = 700, not > 800, push, 700 > 300 → break
    const result = await filterSearchResultsByMaxChars(list, 300);
    expect(result).toHaveLength(2);
  });

  it('should break without pushing when totalTokens > maxTokens + 500', async () => {
    const list = [makeSearchItem('a'.repeat(200), ''), makeSearchItem('a'.repeat(600), '')];
    // After item 1: totalTokens = 200, not > 700, push, not > 200 → continue
    // After item 2: totalTokens = 800, > 700 (200+500) → break without push
    const result = await filterSearchResultsByMaxChars(list, 200);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(list[0]);
  });

  it('should return first item when no items fit (empty results)', async () => {
    // Single item with 1000 tokens, maxTokens = 0
    // After item 0: totalTokens = 1000, > 500 (0+500) → break without push
    // results.length === 0 → return list.slice(0, 1)
    const list = [makeSearchItem('a'.repeat(1000), '')];
    const result = await filterSearchResultsByMaxChars(list, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(list[0]);
  });

  it('should return first item from list when results are empty with multiple items', async () => {
    const list = [makeSearchItem('a'.repeat(1000), ''), makeSearchItem('b'.repeat(1000), '')];
    // maxTokens = 0, first item: 1000 > 500 → break, results empty → return [list[0]]
    const result = await filterSearchResultsByMaxChars(list, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(list[0]);
  });

  it('should handle empty list', async () => {
    const result = await filterSearchResultsByMaxChars([], 100);
    // results.length === 0 → list.slice(0, 1) → []
    expect(result).toHaveLength(0);
  });

  it('should concatenate q and a for token counting', async () => {
    const list = [makeSearchItem('hello', 'world')];
    await filterSearchResultsByMaxChars(list, 100);
    expect(mockedCountPromptTokens).toHaveBeenCalledWith('helloworld');
  });

  it('should handle items with undefined a field', async () => {
    const item = makeSearchItem('hello');
    item.a = undefined;
    const list = [item];
    await filterSearchResultsByMaxChars(list, 100);
    // q + a = "hello" + undefined = "helloundefined"
    expect(mockedCountPromptTokens).toHaveBeenCalledWith('helloundefined');
  });
});

describe('getSystemToolRunTimeNodeFromSystemToolset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeToolSetNode = (
    overrides: Partial<{
      toolId: string;
      toolList: { toolId: string; name: string; description: string }[];
      inputs: any[];
      nodeId: string;
    }> = {}
  ) => ({
    toolConfig: {
      systemToolSet: {
        toolId: overrides.toolId ?? 'toolset-1',
        toolList: overrides.toolList ?? []
      }
    },
    inputs: overrides.inputs ?? [],
    nodeId: overrides.nodeId ?? 'node-1'
  });

  it('should return runtime nodes for active children', async () => {
    const toolSetNode = makeToolSetNode({
      toolId: 'toolset-1',
      toolList: [{ toolId: 'child-1', name: 'Custom Name', description: 'Custom Desc' }]
    });

    mockedGetSystemTools.mockResolvedValue([
      { id: 'child-1', parentId: 'toolset-1', status: 1, name: 'Original' } as any,
      { id: 'child-2', parentId: 'toolset-1', status: 0, name: 'Disabled' } as any
    ]);

    mockedGetSystemToolByIdAndVersionId.mockResolvedValue({
      inputs: [{ key: 'input1', value: 'val1' }],
      outputs: [{ key: 'output1' }],
      name: 'ToolName',
      intro: 'ToolIntro'
    } as any);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result).toHaveLength(1);
    expect(result[0].flowNodeType).toBe(FlowNodeTypeEnum.tool);
    expect(result[0].nodeId).toBe('node-10');
    expect(result[0].name).toBe('Custom Name');
    expect(result[0].intro).toBe('Custom Desc');
    expect(result[0].toolConfig).toEqual({ systemTool: { toolId: 'child-1' } });
  });

  it('should include children with undefined status', async () => {
    const toolSetNode = makeToolSetNode({ toolId: 'ts-1' });

    mockedGetSystemTools.mockResolvedValue([
      { id: 'c-1', parentId: 'ts-1', status: undefined, name: 'Tool1' } as any
    ]);

    mockedGetSystemToolByIdAndVersionId.mockResolvedValue({
      inputs: [],
      outputs: [],
      name: 'Tool1',
      intro: 'Intro1'
    } as any);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result).toHaveLength(1);
  });

  it('should exclude children with status !== 1 and status !== undefined', async () => {
    const toolSetNode = makeToolSetNode({ toolId: 'ts-1' });

    mockedGetSystemTools.mockResolvedValue([
      { id: 'c-1', parentId: 'ts-1', status: 0, name: 'Disabled' } as any,
      { id: 'c-2', parentId: 'ts-1', status: 2, name: 'Other' } as any
    ]);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result).toHaveLength(0);
  });

  it('should use parseI18nString fallback when no custom name/description', async () => {
    const toolSetNode = makeToolSetNode({
      toolId: 'ts-1',
      toolList: [] // No matching toolList entry
    });

    mockedGetSystemTools.mockResolvedValue([
      { id: 'c-1', parentId: 'ts-1', status: 1, name: 'Tool1' } as any
    ]);

    mockedGetSystemToolByIdAndVersionId.mockResolvedValue({
      inputs: [],
      outputs: [],
      name: 'OriginalName',
      intro: 'OriginalIntro'
    } as any);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result).toHaveLength(1);
    // parseI18nString with string returns the string itself
    expect(result[0].name).toBe('OriginalName');
    expect(result[0].intro).toBe('OriginalIntro');
  });

  it('should pass systemInputConfig value to child tool inputs', async () => {
    const toolSetNode = makeToolSetNode({
      toolId: 'ts-1',
      toolList: [{ toolId: 'c-1', name: 'Tool1', description: 'Desc1' }],
      inputs: [{ key: NodeInputKeyEnum.systemInputConfig, value: { apiKey: 'test-key' } }]
    });

    mockedGetSystemTools.mockResolvedValue([
      { id: 'c-1', parentId: 'ts-1', status: 1, name: 'Tool1' } as any
    ]);

    const childInputs = [
      { key: NodeInputKeyEnum.systemInputConfig, value: null },
      { key: 'otherInput', value: 'other' }
    ];
    mockedGetSystemToolByIdAndVersionId.mockResolvedValue({
      inputs: childInputs,
      outputs: [],
      name: 'Tool1',
      intro: 'Intro1'
    } as any);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result).toHaveLength(1);
    // The systemInputConfig input should have the parent's value
    const configInput = result[0].inputs.find(
      (i: any) => i.key === NodeInputKeyEnum.systemInputConfig
    );
    expect(configInput?.value).toEqual({ apiKey: 'test-key' });
  });

  it('should not modify inputs when no systemInputConfig in toolSetNode', async () => {
    const toolSetNode = makeToolSetNode({
      toolId: 'ts-1',
      toolList: [{ toolId: 'c-1', name: 'Tool1', description: 'Desc1' }],
      inputs: [] // No systemInputConfig
    });

    mockedGetSystemTools.mockResolvedValue([
      { id: 'c-1', parentId: 'ts-1', status: 1, name: 'Tool1' } as any
    ]);

    mockedGetSystemToolByIdAndVersionId.mockResolvedValue({
      inputs: [{ key: NodeInputKeyEnum.systemInputConfig, value: 'original' }],
      outputs: [],
      name: 'Tool1',
      intro: 'Intro1'
    } as any);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    // toolsetInputConfig is undefined, so value check is falsy → no modification
    const configInput = result[0].inputs.find(
      (i: any) => i.key === NodeInputKeyEnum.systemInputConfig
    );
    expect(configInput?.value).toBe('original');
  });

  it('should use default lang "en" when not provided', async () => {
    const toolSetNode = makeToolSetNode({
      toolId: 'ts-1',
      toolList: []
    });

    mockedGetSystemTools.mockResolvedValue([
      { id: 'c-1', parentId: 'ts-1', status: 1, name: 'Tool1' } as any
    ]);

    mockedGetSystemToolByIdAndVersionId.mockResolvedValue({
      inputs: [],
      outputs: [],
      name: { en: 'English Name', 'zh-CN': '中文名称' },
      intro: { en: 'English Intro', 'zh-CN': '中文介绍' }
    } as any);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode
    });

    expect(result[0].name).toBe('English Name');
    expect(result[0].intro).toBe('English Intro');
  });

  it('should handle null inputs/outputs from tool', async () => {
    const toolSetNode = makeToolSetNode({
      toolId: 'ts-1',
      toolList: [{ toolId: 'c-1', name: 'Tool1', description: 'Desc1' }]
    });

    mockedGetSystemTools.mockResolvedValue([
      { id: 'c-1', parentId: 'ts-1', status: 1, name: 'Tool1' } as any
    ]);

    mockedGetSystemToolByIdAndVersionId.mockResolvedValue({
      inputs: null,
      outputs: null,
      name: 'Tool1',
      intro: 'Intro1'
    } as any);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result[0].inputs).toEqual([]);
    expect(result[0].outputs).toEqual([]);
  });

  it('should generate correct nodeId with index', async () => {
    const toolSetNode = makeToolSetNode({
      toolId: 'ts-1',
      nodeId: 'parent-node'
    });

    mockedGetSystemTools.mockResolvedValue([
      { id: 'c-1', parentId: 'ts-1', status: 1, name: 'T1' } as any,
      { id: 'c-2', parentId: 'ts-1', status: 1, name: 'T2' } as any
    ]);

    mockedGetSystemToolByIdAndVersionId.mockResolvedValue({
      inputs: [],
      outputs: [],
      name: 'Tool',
      intro: 'Intro'
    } as any);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result).toHaveLength(2);
    expect(result[0].nodeId).toBe('parent-node0');
    expect(result[1].nodeId).toBe('parent-node1');
  });

  it('should only include children matching the toolSetNode parentId', async () => {
    const toolSetNode = makeToolSetNode({ toolId: 'ts-1' });

    mockedGetSystemTools.mockResolvedValue([
      { id: 'c-1', parentId: 'ts-1', status: 1, name: 'Match' } as any,
      { id: 'c-2', parentId: 'ts-other', status: 1, name: 'NoMatch' } as any
    ]);

    mockedGetSystemToolByIdAndVersionId.mockResolvedValue({
      inputs: [],
      outputs: [],
      name: 'Tool',
      intro: 'Intro'
    } as any);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result).toHaveLength(1);
    expect(mockedGetSystemToolByIdAndVersionId).toHaveBeenCalledWith('c-1');
  });
});
