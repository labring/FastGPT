import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';

const mocks = vi.hoisted(() => ({
  getSystemToolDetail: vi.fn(),
  getInstance: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: mocks.getInstance
  }
}));

import { getClientSystemToolPreviewNode } from '@fastgpt/service/core/app/tool/utils/client';

describe('getClientSystemToolPreviewNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInstance.mockReturnValue({
      getSystemToolDetail: mocks.getSystemToolDetail
    });
  });

  it('adds system input config when system tool has secrets', async () => {
    mocks.getSystemToolDetail.mockResolvedValueOnce({
      id: 'systemTool-weather',
      version: '1.0.0',
      status: 1,
      source: 'system',
      isToolSet: false,
      avatar: 'weather.svg',
      name: 'Weather',
      intro: 'Weather query',
      author: 'FastGPT',
      tags: [],
      toolDescription: 'Weather query',
      currentCost: 0,
      systemKeyCost: 1,
      hasTokenFee: false,
      hasSystemSecret: true,
      secretSchema: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            title: 'API Key',
            isSecret: true
          }
        },
        required: ['apiKey']
      },
      inputSchema: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            title: 'City'
          }
        }
      }
    });

    const result = await getClientSystemToolPreviewNode({
      pluginId: 'systemTool-weather',
      versionId: '1.0.0',
      lang: 'en'
    });

    expect(result.inputs[0]).toEqual({
      key: NodeInputKeyEnum.systemInputConfig,
      label: '',
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      inputList: [
        {
          key: 'apiKey',
          label: 'API Key',
          inputType: 'secret',
          description: undefined,
          required: true
        }
      ]
    });
    expect(result.inputs[1]?.key).toBe('city');
    expect(result.version).toBe('1.0.0');
    expect(result.versionLabel).toBe('1.0.0');
  });

  it('keeps inputs unchanged when system tool has no secrets', async () => {
    mocks.getSystemToolDetail.mockResolvedValueOnce({
      id: 'systemTool-weather',
      version: '1.0.0',
      status: 1,
      source: 'system',
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
      hasSystemSecret: false,
      inputSchema: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            title: 'City'
          }
        }
      }
    });

    const result = await getClientSystemToolPreviewNode({
      pluginId: 'systemTool-weather',
      lang: 'en'
    });

    expect(result.inputs).toHaveLength(1);
    expect(result.inputs[0]?.key).toBe('city');
    expect(result.version).toBe('');
    expect(result.versionLabel).toBeUndefined();
  });

  it('returns latest version id when requested explicitly', async () => {
    mocks.getSystemToolDetail.mockResolvedValueOnce({
      id: 'systemTool-weather',
      version: '1.0.0',
      status: 1,
      source: 'system',
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

    const result = await getClientSystemToolPreviewNode({
      pluginId: 'systemTool-weather',
      getLatestVersion: true,
      lang: 'en'
    });

    expect(result.version).toBe('1.0.0');
    expect(result.versionLabel).toBe('1.0.0');
  });

  it('uses latest data but returns empty version when versionId is an empty string', async () => {
    mocks.getSystemToolDetail.mockResolvedValueOnce({
      id: 'systemTool-weather',
      version: '1.0.0',
      status: 1,
      source: 'system',
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

    const result = await getClientSystemToolPreviewNode({
      pluginId: 'systemTool-weather',
      versionId: '',
      lang: 'en'
    });

    expect(mocks.getSystemToolDetail).toHaveBeenCalledWith({
      pluginId: 'systemTool-weather',
      version: undefined,
      lang: 'en',
      source: 'system'
    });
    expect(result.version).toBe('');
    expect(result.versionLabel).toBeUndefined();
  });

  it('returns plugin module preview for commercial workflow tools', async () => {
    mocks.getSystemToolDetail.mockResolvedValueOnce({
      id: 'commercial-workflow-tool',
      version: 'workflow-version',
      status: 1,
      source: 'system',
      versionLabel: 'Workflow v1',
      isToolSet: false,
      avatar: 'workflow.svg',
      name: 'Workflow Tool',
      intro: 'Workflow tool intro',
      author: 'FastGPT',
      tags: [],
      toolDescription: 'Run workflow tool',
      currentCost: 1,
      systemKeyCost: 0,
      hasTokenFee: true,
      hasSystemSecret: false,
      associatedPluginId: 'app-id',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            title: 'Query'
          }
        },
        required: ['query']
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: {
            type: 'string',
            title: 'Result'
          }
        }
      }
    });

    const result = await getClientSystemToolPreviewNode({
      pluginId: 'commercial-workflow-tool',
      versionId: 'workflow-version',
      lang: 'en'
    });

    expect(result.flowNodeType).toBe(FlowNodeTypeEnum.pluginModule);
    expect(result.pluginId).toBe('commercial-workflow-tool');
    expect(result.toolConfig).toBeUndefined();
    expect(result.isFolder).toBe(false);
    expect(result.inputs[0]?.key).toBe('query');
    expect(result.version).toBe('workflow-version');
    expect(result.versionLabel).toBe('Workflow v1');
  });
});
