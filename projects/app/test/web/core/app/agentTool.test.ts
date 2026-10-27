import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { AgentToolInputModeEnum } from '@fastgpt/global/core/app/tool/constants';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';

const mocks = vi.hoisted(() => ({
  getPreview: vi.fn()
}));

vi.mock('@/web/core/app/api/tool', () => ({
  getClientToolPreviewNode: mocks.getPreview
}));

import { hydrateAgentToolForEdit } from '@/web/core/app/agentTool';

const createPreview = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'preview-id',
    pluginId: 'review-tool',
    name: 'Live tool',
    avatar: 'live-avatar',
    flowNodeType: FlowNodeTypeEnum.tool,
    version: 'v2',
    inputs: [
      {
        key: 'query',
        label: 'Query',
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
        value: 'default query'
      },
      {
        key: 'limit',
        label: 'Limit',
        renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.agentGenerated],
        value: 10
      }
    ],
    outputs: [],
    toolConfig: { live: true },
    ...overrides
  }) as any;

describe('hydrateAgentToolForEdit', () => {
  beforeEach(() => {
    mocks.getPreview.mockReset();
  });

  it('loads the preview and restores saved modes and config values', async () => {
    mocks.getPreview.mockResolvedValue(createPreview());

    const result = await hydrateAgentToolForEdit({
      tool: {
        id: 'review-tool',
        name: 'Saved tool',
        avatar: 'saved-avatar',
        version: 'v1',
        source: 'teamId:team-1',
        inputs: [
          { key: 'query', mode: AgentToolInputModeEnum.manual },
          { key: 'limit', mode: AgentToolInputModeEnum.agentGenerated }
        ],
        config: { query: 'saved query', limit: 5 }
      } as unknown as SelectedToolItemType,
      lang: 'en'
    });

    expect(mocks.getPreview).toHaveBeenCalledWith({
      appId: 'review-tool',
      versionId: 'v1',
      source: 'teamId:team-1',
      lang: 'en'
    });
    expect(result).toMatchObject({
      id: 'review-tool',
      pluginId: 'review-tool',
      name: 'Saved tool',
      avatar: 'saved-avatar',
      version: 'v1',
      source: 'teamId:team-1',
      flowNodeType: FlowNodeTypeEnum.tool
    });

    const queryInput = result.inputs.find((input) => input.key === 'query')!;
    expect(queryInput).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.input,
      value: 'saved query'
    });
    expect(queryInput.renderTypeList).toContain(FlowNodeInputTypeEnum.agentGenerated);

    const limitInput = result.inputs.find((input) => input.key === 'limit')!;
    expect(limitInput).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.agentGenerated,
      value: 5
    });
    expect(result.metadataLocale).toBeUndefined();
  });

  it('requests latest with an empty versionId and does not pin the preview locale', async () => {
    mocks.getPreview.mockResolvedValue(createPreview({ metadataLocale: 'zh-CN' }));

    const result = await hydrateAgentToolForEdit({
      tool: {
        id: 'review-tool',
        config: {}
      } as unknown as SelectedToolItemType,
      lang: 'en'
    });

    expect(mocks.getPreview).toHaveBeenCalledWith({
      appId: 'review-tool',
      versionId: '',
      source: undefined,
      lang: 'en'
    });
    expect(result.metadataLocale).toBeUndefined();
  });

  it('defaults missing canonical inputs to agentGenerated for system tools', async () => {
    mocks.getPreview.mockResolvedValue(
      createPreview({
        pluginId: 'systemTool-weather',
        inputs: [
          {
            key: 'query',
            label: 'Query',
            toolDescription: 'query',
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
            value: 'default query'
          }
        ]
      })
    );

    const result = await hydrateAgentToolForEdit({
      tool: {
        id: 'systemTool-weather',
        config: {}
      } as unknown as SelectedToolItemType,
      lang: 'en'
    });

    expect(result.inputs[0]).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.agentGenerated,
      value: 'default query'
    });
  });

  it('rejects when the preview cannot be loaded', async () => {
    mocks.getPreview.mockRejectedValueOnce(new Error('tool missing'));

    await expect(
      hydrateAgentToolForEdit({
        tool: {
          id: 'review-tool',
          config: {}
        } as unknown as SelectedToolItemType,
        lang: 'en'
      })
    ).rejects.toThrow('tool missing');
  });
});
