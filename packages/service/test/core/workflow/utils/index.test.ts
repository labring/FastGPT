import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

// Mock token counting (uses worker threads, not available in test)
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countPromptTokensBatch: vi.fn(async (texts: string[]) => {
    // Simple approximation: 1 token ≈ 1 char for test purposes
    return texts.map((text) => (typeof text === 'string' ? text.length : 0));
  })
}));

const mockGetSystemToolDetail = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: () => ({
      getSystemToolDetail: mockGetSystemToolDetail
    })
  }
}));

import {
  filterSearchResultsByMaxChars,
  getSystemToolRunTimeNodeFromSystemToolset
} from '@fastgpt/service/core/workflow/utils';
import { countPromptTokensBatch } from '@fastgpt/service/common/string/tiktoken/index';

const mockedCountPromptTokensBatch = vi.mocked(countPromptTokensBatch);

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
    expect(mockedCountPromptTokensBatch.mock.calls[0][0]).toEqual(['helloworld']);
  });

  it('should handle items with undefined a field', async () => {
    const item = makeSearchItem('hello');
    item.a = undefined;
    const list = [item];
    await filterSearchResultsByMaxChars(list, 100);
    // q + a = "hello" + undefined = "helloundefined"
    expect(mockedCountPromptTokensBatch.mock.calls[0][0]).toEqual(['helloundefined']);
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
      version: string;
    }> = {}
  ) => ({
    toolConfig: {
      systemToolSet: {
        toolId: overrides.toolId ?? 'systemTool-toolset-1',
        toolList: overrides.toolList ?? []
      }
    },
    inputs: overrides.inputs ?? [],
    nodeId: overrides.nodeId ?? 'node-1',
    version: overrides.version
  });

  const mockToolDetail = (
    children: Array<{
      id: string;
      name?: string;
      description?: string;
      toolDescription?: string;
      inputs?: any[] | null;
      outputs?: any[] | null;
    }> = [
      {
        id: 'child-1',
        name: 'Original',
        description: 'Original Desc',
        toolDescription: 'Original Tool Desc',
        inputs: [{ key: 'input1', value: 'val1' }],
        outputs: [{ key: 'output1' }]
      }
    ],
    version = 'v1'
  ) => {
    mockGetSystemToolDetail.mockResolvedValue({
      version,
      children
    });
  };

  it('should return empty nodes when no tools are selected', async () => {
    const toolSetNode = makeToolSetNode();

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result).toEqual([]);
    expect(mockGetSystemToolDetail).not.toHaveBeenCalled();
  });

  it('should return runtime nodes for selected children', async () => {
    const toolSetNode = makeToolSetNode({
      toolId: 'systemTool-toolset-1',
      toolList: [{ toolId: 'child-1', name: 'Custom Name', description: 'Custom Desc' }]
    });

    mockToolDetail([
      {
        id: 'child-1',
        name: 'Original',
        description: 'Original Desc',
        toolDescription: 'Original Tool Desc',
        inputs: [{ key: 'input1', value: 'val1' }],
        outputs: [{ key: 'output1' }]
      },
      {
        id: 'child-2',
        name: 'Not Selected',
        description: 'Not Selected Desc',
        inputs: [],
        outputs: []
      }
    ]);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(mockGetSystemToolDetail).toHaveBeenCalledWith({
      pluginId: 'systemTool-toolset-1',
      lang: 'en',
      source: 'system',
      version: undefined,
      fallbackLatestVersion: true
    });
    expect(result).toHaveLength(1);
    expect(result[0].flowNodeType).toBe(FlowNodeTypeEnum.tool);
    expect(result[0].nodeId).toBe('node-1child-1');
    expect(result[0].name).toBe('Custom Name');
    expect(result[0].intro).toBe('Custom Desc');
    expect(result[0].toolDescription).toBe('Custom Desc');
    expect(result[0].toolConfig).toEqual({
      systemTool: { toolId: 'systemTool-toolset-1/child-1' }
    });
    expect(result[0].pluginId).toBe('systemTool-toolset-1/child-1');
    expect(result[0].inputs).toEqual([{ key: 'input1', value: 'val1' }]);
    expect(result[0].outputs).toEqual([{ key: 'output1' }]);
    expect(result[0].version).toBe('v1');
  });

  it('should use child name and descriptions when selected config is empty', async () => {
    const toolSetNode = makeToolSetNode({
      toolList: [{ toolId: 'child-1', name: '', description: '' }]
    });

    mockToolDetail([
      {
        id: 'child-1',
        name: 'Original Name',
        description: 'Original Intro',
        toolDescription: 'Original Tool Description',
        inputs: [],
        outputs: []
      }
    ]);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Original Name');
    expect(result[0].intro).toBe('Original Intro');
    expect(result[0].toolDescription).toBe('Original Tool Description');
  });

  it('should pass systemInputConfig value to child tool inputs', async () => {
    const toolSetNode = makeToolSetNode({
      toolList: [{ toolId: 'child-1', name: 'Tool1', description: 'Desc1' }],
      inputs: [{ key: NodeInputKeyEnum.systemInputConfig, value: { apiKey: 'test-key' } }]
    });

    const childInputs = [
      { key: NodeInputKeyEnum.systemInputConfig, value: null },
      { key: 'otherInput', value: 'other' }
    ];
    mockToolDetail([
      {
        id: 'child-1',
        name: 'Tool1',
        description: 'Intro1',
        inputs: childInputs,
        outputs: []
      }
    ]);

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
      toolList: [{ toolId: 'child-1', name: 'Tool1', description: 'Desc1' }],
      inputs: [] // No systemInputConfig
    });

    mockToolDetail([
      {
        id: 'child-1',
        name: 'Tool1',
        description: 'Intro1',
        inputs: [{ key: NodeInputKeyEnum.systemInputConfig, value: 'original' }],
        outputs: []
      }
    ]);

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
      toolList: [{ toolId: 'child-1', name: 'Tool1', description: 'Desc1' }]
    });
    mockToolDetail();

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode
    });

    expect(mockGetSystemToolDetail).toHaveBeenCalledWith({
      pluginId: 'systemTool-toolset-1',
      lang: 'en',
      source: 'system',
      version: undefined,
      fallbackLatestVersion: true
    });
    expect(result).toHaveLength(1);
  });

  it('should handle null inputs/outputs from tool', async () => {
    const toolSetNode = makeToolSetNode({
      toolList: [{ toolId: 'child-1', name: 'Tool1', description: 'Desc1' }]
    });

    mockToolDetail([
      {
        id: 'child-1',
        name: 'Tool1',
        description: 'Intro1',
        inputs: null,
        outputs: null
      }
    ]);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result[0].inputs).toEqual([]);
    expect(result[0].outputs).toEqual([]);
  });

  it('should generate nodeId with child id and preserve selected order', async () => {
    const toolSetNode = makeToolSetNode({
      nodeId: 'parent-node',
      toolList: [
        { toolId: 'child-2', name: 'T2', description: 'D2' },
        { toolId: 'child-1', name: 'T1', description: 'D1' }
      ]
    });

    mockToolDetail([
      { id: 'child-1', name: 'Original T1', inputs: [], outputs: [] },
      { id: 'child-2', name: 'Original T2', inputs: [], outputs: [] }
    ]);

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result).toHaveLength(2);
    expect(result[0].nodeId).toBe('parent-nodechild-2');
    expect(result[1].nodeId).toBe('parent-nodechild-1');
  });

  it('should accept full child tool id from selected config', async () => {
    const toolSetNode = makeToolSetNode({
      toolList: [
        {
          toolId: 'systemTool-toolset-1/child-1',
          name: 'Full Id Tool',
          description: 'Full Id Desc'
        }
      ]
    });
    mockToolDetail();

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result).toHaveLength(1);
    expect(result[0].pluginId).toBe('systemTool-toolset-1/child-1');
  });

  it('should skip selected tools that are missing from repo children', async () => {
    const toolSetNode = makeToolSetNode({
      toolList: [
        { toolId: 'missing-child', name: 'Missing', description: 'Missing Desc' },
        { toolId: 'child-1', name: 'Tool1', description: 'Desc1' }
      ]
    });
    mockToolDetail();

    const result = await getSystemToolRunTimeNodeFromSystemToolset({
      toolSetNode,
      lang: 'en'
    });

    expect(result).toHaveLength(1);
    expect(result[0].pluginId).toBe('systemTool-toolset-1/child-1');
  });
});
