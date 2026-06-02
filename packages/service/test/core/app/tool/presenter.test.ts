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

import { getToolPreviewNode } from '@fastgpt/service/core/app/tool/presenter';

describe('getToolPreviewNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInstance.mockReturnValue({
      getSystemToolDetail: mocks.getSystemToolDetail
    });
  });

  it('adds system input config when system tool has secrets', async () => {
    const secrets = [
      {
        key: 'apiKey',
        label: 'API Key',
        inputType: 'secret',
        required: true
      }
    ];

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
      secrets,
      inputs: [
        {
          key: 'city',
          label: 'City',
          valueType: 'string',
          renderTypeList: [FlowNodeInputTypeEnum.input],
          required: true
        }
      ],
      outputs: []
    });

    const result = await getToolPreviewNode({
      pluginId: 'systemTool-weather',
      versionId: '1.0.0',
      lang: 'en'
    });

    expect(result.inputs[0]).toEqual({
      key: NodeInputKeyEnum.systemInputConfig,
      label: '',
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      inputList: secrets
    });
    expect(result.inputs[1]?.key).toBe('city');
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
      inputs: [
        {
          key: 'city',
          label: 'City',
          valueType: 'string',
          renderTypeList: [FlowNodeInputTypeEnum.input],
          required: true
        }
      ],
      outputs: []
    });

    const result = await getToolPreviewNode({
      pluginId: 'systemTool-weather',
      lang: 'en'
    });

    expect(result.inputs).toHaveLength(1);
    expect(result.inputs[0]?.key).toBe('city');
  });

  it('returns plugin module preview for commercial workflow tools', async () => {
    mocks.getSystemToolDetail.mockResolvedValueOnce({
      id: 'commercial-workflow-tool',
      version: 'workflow-version',
      status: 1,
      source: 'system',
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
      inputs: [
        {
          key: 'query',
          label: 'Query',
          valueType: 'string',
          renderTypeList: [FlowNodeInputTypeEnum.input],
          required: true
        }
      ],
      outputs: []
    });

    const result = await getToolPreviewNode({
      pluginId: 'commercial-workflow-tool',
      versionId: 'workflow-version',
      lang: 'en'
    });

    expect(result.flowNodeType).toBe(FlowNodeTypeEnum.pluginModule);
    expect(result.pluginId).toBe('commercial-workflow-tool');
    expect(result.toolConfig).toBeUndefined();
    expect(result.isFolder).toBe(false);
    expect(result.inputs[0]?.key).toBe('query');
  });
});
