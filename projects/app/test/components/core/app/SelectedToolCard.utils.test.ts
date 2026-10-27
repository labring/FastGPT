import { describe, expect, it } from 'vitest';
import type { TFunction } from 'next-i18next';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { getSelectedToolCardState } from '@/components/core/app/SelectedToolCard.utils';

const t = ((key: string) => key) as unknown as TFunction;

const createTool = (overrides: Partial<SelectedToolItemType> = {}) =>
  ({
    id: 'tool_1',
    name: 'Tool',
    avatar: '',
    flowNodeType: FlowNodeTypeEnum.tool,
    inputs: [],
    outputs: [],
    ...overrides
  }) as unknown as SelectedToolItemType;

describe('getSelectedToolCardState', () => {
  it('marks offline tools as errors', () => {
    const state = getSelectedToolCardState({
      tool: createTool({ status: PluginStatusEnum.Offline }),
      t
    });

    expect(state.status).toBe(PluginStatusEnum.Offline);
    expect(state.hasToolError).toBe(true);
    expect(state.errorMessage).toBe('common:core.workflow.check.tool_missing');
  });

  it('uses pluginData error for deleted or unauthorized tools', () => {
    const state = getSelectedToolCardState({
      tool: createTool({ pluginData: { error: 'resource_no_permission' } as any }),
      t
    });

    expect(state.hasToolError).toBe(true);
    expect(state.errorMessage).toBe('common:core.workflow.check.resource_no_permission');
  });

  it('shows soon offline status without treating it as an error', () => {
    const state = getSelectedToolCardState({
      tool: createTool({ pluginData: { status: PluginStatusEnum.SoonOffline } as any }),
      t
    });

    expect(state.status).toBe(PluginStatusEnum.SoonOffline);
    expect(state.hasToolError).toBe(false);
    expect(state.isWaitingForConfig).toBe(false);
  });

  it('honors an explicit waitingForConfig status', () => {
    const state = getSelectedToolCardState({
      tool: createTool({ configStatus: 'waitingForConfig' }),
      t
    });

    expect(state.isWaitingForConfig).toBe(true);
    expect(state.hasToolError).toBe(false);
  });

  it('infers waitingForConfig from full inputs when configStatus is missing', () => {
    const state = getSelectedToolCardState({
      tool: createTool({
        inputs: [
          {
            key: NodeInputKeyEnum.systemInputConfig,
            renderTypeList: [FlowNodeInputTypeEnum.input],
            selectedType: FlowNodeInputTypeEnum.input,
            required: true
          }
        ] as any
      }),
      t
    });

    expect(state.isWaitingForConfig).toBe(true);
  });

  it('skips inference for compact tool inputs', () => {
    const state = getSelectedToolCardState({
      tool: createTool({ inputs: [{ key: 'query', mode: 'agentGenerated' }] as any }),
      t
    });

    expect(state.isWaitingForConfig).toBe(false);
    expect(state.hasToolError).toBe(false);
  });

  it('falls back to tool_invalid for invalid status without a server error', () => {
    const state = getSelectedToolCardState({
      tool: createTool({ configStatus: 'invalid' }),
      t
    });

    expect(state.hasToolError).toBe(true);
    expect(state.errorMessage).toBe('common:tool_invalid');
  });

  it('detects debug tools', () => {
    const state = getSelectedToolCardState({
      tool: createTool({ source: 'debug:tmbId:1' }),
      t
    });

    expect(state.isDebugTool).toBe(true);
  });

  it('prefers tool.status over pluginData.status', () => {
    const state = getSelectedToolCardState({
      tool: createTool({
        status: PluginStatusEnum.Offline,
        pluginData: { status: PluginStatusEnum.Normal } as any
      }),
      t
    });

    expect(state.hasToolError).toBe(true);
  });
});
