import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  getAppVersionById: vi.fn(),
  getSystemToolDetail: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: mocks.findById
  }
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppVersionById: mocks.getAppVersionById,
  checkIsLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: vi.fn(() => ({
      getSystemToolDetail: mocks.getSystemToolDetail
    }))
  }
}));

import { getClientToolPreviewNode } from '@fastgpt/service/core/app/tool/utils/client';

describe('getClientToolPreviewNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses explicit debug source for system tool preview without encoding appId', async () => {
    mocks.getSystemToolDetail.mockResolvedValueOnce({
      id: 'systemTool-weather',
      version: '1.0.0',
      status: 1,
      source: 'debug:tmbId:tmb-1',
      isToolSet: false,
      avatar: 'weather.svg',
      name: 'Weather',
      intro: 'Weather query',
      author: 'FastGPT',
      tags: [],
      toolDescription: 'Weather query',
      currentCost: 0,
      systemKeyCost: 0,
      hasTokenFee: false,
      hasSystemSecret: false
    });

    const result = await getClientToolPreviewNode({
      appId: 'systemTool-weather',
      versionId: '',
      lang: 'en',
      source: 'debug:tmbId:tmb-1'
    });

    expect(mocks.getSystemToolDetail).toHaveBeenCalledWith({
      pluginId: 'systemTool-weather',
      version: undefined,
      lang: 'en',
      source: 'debug:tmbId:tmb-1'
    });
    expect(result.pluginId).toBe('systemTool-weather');
    expect(result.source).toBe('debug:tmbId:tmb-1');
  });

  it('omits runtime schema fields from client preview response', async () => {
    mocks.findById.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        teamId: '507f1f77bcf86cd799439012',
        type: AppTypeEnum.httpToolSet,
        name: 'HTTP Tools',
        avatar: 'http.svg',
        intro: 'HTTP toolset'
      })
    });
    mocks.getAppVersionById.mockResolvedValueOnce({
      nodes: [
        {
          toolConfig: {
            httpToolSet: {
              toolList: [
                {
                  name: 'search',
                  description: 'Search tool',
                  requestSchema: { type: 'object', properties: { q: { type: 'string' } } },
                  inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
                  outputSchema: { type: 'object', properties: { result: { type: 'string' } } }
                }
              ]
            }
          }
        }
      ],
      edges: [],
      chatConfig: {},
      versionId: 'version-id',
      versionName: 'Version 1'
    });

    const result = await getClientToolPreviewNode({
      appId: 'http-507f1f77bcf86cd799439011/search',
      lang: 'en'
    });

    expect(result).not.toHaveProperty('jsonSchema');
    expect(result).not.toHaveProperty('inputSchema');
    expect(result).not.toHaveProperty('outputSchema');
    expect(result).not.toHaveProperty('secretSchema');
    expect(result.toolConfig?.httpTool).toEqual({
      toolId: 'http-507f1f77bcf86cd799439011/search'
    });
    expect(result.inputs[0]?.key).toBe('q');
    expect((result as any).jsonSchema).toBeUndefined();
  });

  it('applies isToolParam default over a workflow plugin input selection', async () => {
    const appId = '507f1f77bcf86cd799439011';
    mocks.findById.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        _id: appId,
        teamId: '507f1f77bcf86cd799439012',
        type: AppTypeEnum.workflowTool,
        name: 'Workflow plugin',
        avatar: 'plugin.svg',
        intro: 'Workflow plugin'
      })
    });
    mocks.getAppVersionById.mockResolvedValueOnce({
      nodes: [
        {
          flowNodeType: 'pluginInput',
          inputs: [
            {
              key: 'test',
              label: 'test',
              valueType: 'string',
              selectedType: 'input',
              selectedTypeIndex: 0,
              renderTypeList: ['input', 'reference'],
              isToolParam: true
            },
            {
              key: 'referenceOnly',
              label: 'referenceOnly',
              valueType: 'string',
              selectedType: 'reference',
              selectedTypeIndex: 0,
              renderTypeList: ['reference']
            },
            {
              key: 'legacyToolParam',
              label: 'legacyToolParam',
              valueType: 'string',
              renderTypeList: ['input', 'reference'],
              toolDescription: 'Legacy AI parameter'
            },
            {
              key: 'explicitManual',
              label: 'explicitManual',
              valueType: 'string',
              renderTypeList: ['input', 'reference'],
              toolDescription: 'Parameter description',
              isToolParam: false
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {},
      versionId: 'version-id',
      versionName: 'Version 1'
    });

    const result = await getClientToolPreviewNode({
      appId,
      versionId: ''
    });
    const input = result.inputs.find((item) => item.key === 'test');

    expect(input).toMatchObject({
      selectedType: 'agentGenerated',
      selectedTypeIndex: 0,
      renderTypeList: ['agentGenerated', 'input', 'reference'],
      isToolParam: true
    });

    expect(result.inputs.find((item) => item.key === 'referenceOnly')).toMatchObject({
      selectedType: 'agentGenerated',
      selectedTypeIndex: 0,
      renderTypeList: ['agentGenerated', 'reference']
    });

    expect(result.inputs.find((item) => item.key === 'legacyToolParam')).toMatchObject({
      selectedType: 'agentGenerated',
      selectedTypeIndex: 0,
      renderTypeList: ['agentGenerated', 'input', 'reference'],
      isToolParam: true
    });

    expect(result.inputs.find((item) => item.key === 'explicitManual')).toMatchObject({
      renderTypeList: ['input', 'reference'],
      isToolParam: false
    });
    expect(
      result.inputs.find((item) => item.key === 'explicitManual')?.selectedType
    ).toBeUndefined();
  });
});
